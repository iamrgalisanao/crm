import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  DomainEvent,
  OpportunityStatus,
  OPPORTUNITY_TRANSITIONS,
  canTransition,
  toMinor,
  toMajorString,
  mulRatio,
} from '@crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { requireOrgId, currentUserId } from '../common/context/request-context';
import { isOwnScoped, canAccessOwned } from '../common/scope/ownership-scope';
import { CreateOpportunityDto } from './dto/create-opportunity.dto';
import {
  UpdateOpportunityDto,
  ChangeStageDto,
  WinOpportunityDto,
  LoseOpportunityDto,
} from './dto/update-opportunity.dto';

@Injectable()
export class OpportunitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  async list(params: { q?: string; stageId?: string; status?: string; page?: number; limit?: number }) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 25));
    const where: Record<string, unknown> = { ...this.scopeWhere(), deletedAt: null };
    if (params.stageId) where.stageId = params.stageId;
    if (params.status) where.status = params.status;
    if (params.q) where.name = { contains: params.q, mode: 'insensitive' };

    const [rows, total] = await Promise.all([
      this.prisma.opportunity.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: this.includeRefs(),
      }),
      this.prisma.opportunity.count({ where }),
    ]);
    return {
      data: rows.map((r) => this.toDto(r)),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  /** Kanban board: default pipeline stages with their open opportunities. */
  async board() {
    const pipeline = await this.getDefaultPipeline();
    const currency = await this.baseCurrency();
    const stages = await this.prisma.pipelineStage.findMany({
      where: { pipelineId: pipeline.id },
      orderBy: { sortOrder: 'asc' },
    });

    const where: Record<string, unknown> = {
      ...this.scopeWhere(),
      deletedAt: null,
      pipelineId: pipeline.id,
      status: OpportunityStatus.OPEN,
    };
    const opps = await this.prisma.opportunity.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: this.includeRefs(),
    });
    const dtos = opps
      .map((o) => this.toDto(o))
      .filter((d): d is NonNullable<typeof d> => d !== null);

    const columns = stages
      .filter((s) => s.type === 'open')
      .map((s) => {
        const cards = dtos.filter((d) => d.stageId === s.id);
        const totalMinor = opps
          .filter((o) => o.stageId === s.id)
          .reduce((sum, o) => sum + o.amount, 0n);
        const weightedMinor = opps
          .filter((o) => o.stageId === s.id)
          .reduce((sum, o) => sum + mulRatio(o.amount, BigInt(o.probability), 100n), 0n);
        return {
          stage: { id: s.id, name: s.name, defaultProbability: s.defaultProbability, slaDays: s.slaDays },
          count: cards.length,
          total: toMajorString(totalMinor, currency),
          weighted: toMajorString(weightedMinor, currency),
          cards,
        };
      });

    return { pipeline: { id: pipeline.id, name: pipeline.name }, columns };
  }

  async findOne(id: string) {
    const opp = await this.getScopedOrThrow(id);
    const full = await this.prisma.opportunity.findUnique({
      where: { id: opp.id },
      include: {
        ...this.includeRefs(),
        stageHistory: { orderBy: { changedAt: 'desc' }, take: 20 },
        pipeline: { include: { stages: { orderBy: { sortOrder: 'asc' } } } },
      },
    });
    return this.toDto(full, true);
  }

  async create(dto: CreateOpportunityDto) {
    const organizationId = requireOrgId();
    const currency = await this.baseCurrency();
    const pipeline = dto.pipelineId
      ? await this.getPipeline(dto.pipelineId)
      : await this.getDefaultPipeline();

    const stage = dto.stageId
      ? await this.getStage(dto.stageId, pipeline.id)
      : await this.firstOpenStage(pipeline.id);

    if (dto.accountId) await this.assertAccountAccessible(dto.accountId);

    const opp = await this.prisma.$transaction(async (tx) => {
      const created = await tx.opportunity.create({
        data: {
          organizationId,
          name: dto.name,
          accountId: dto.accountId ?? null,
          primaryContactId: dto.primaryContactId ?? null,
          ownerId: dto.ownerId ?? currentUserId(),
          pipelineId: pipeline.id,
          stageId: stage.id,
          amount: dto.amount ? toMinor(dto.amount, currency) : 0n,
          currency,
          probability: dto.probability ?? stage.defaultProbability,
          expectedCloseDate: dto.expectedCloseDate ? new Date(dto.expectedCloseDate) : null,
          sourceId: dto.sourceId ?? null,
          priority: dto.priority ?? 'medium',
          competitor: dto.competitor ?? null,
          nextAction: dto.nextAction ?? null,
          nextActionAt: dto.nextActionAt ? new Date(dto.nextActionAt) : null,
          tags: dto.tags ?? [],
          notes: dto.notes ?? null,
          stageEnteredAt: new Date(),
          createdBy: currentUserId(),
          updatedBy: currentUserId(),
        },
        include: this.includeRefs(),
      });
      await tx.opportunityStageHistory.create({
        data: {
          organizationId,
          opportunityId: created.id,
          fromStageId: null,
          toStageId: stage.id,
          toProbability: created.probability,
          changedBy: currentUserId(),
        },
      });
      return created;
    });

    await this.audit.record({
      action: 'opportunity.created',
      entityType: 'opportunity',
      entityId: opp.id,
      newValues: { name: opp.name, stageId: opp.stageId },
    });
    this.emit(DomainEvent.OPPORTUNITY_CREATED, opp.id);
    return this.toDto(opp);
  }

  async update(id: string, dto: UpdateOpportunityDto) {
    const existing = await this.getScopedOrThrow(id);
    if (dto.accountId) await this.assertAccountAccessible(dto.accountId);
    const opp = await this.prisma.opportunity.update({
      where: { id: existing.id },
      data: {
        ...('name' in dto ? { name: dto.name } : {}),
        ...('accountId' in dto ? { accountId: dto.accountId ?? null } : {}),
        ...('primaryContactId' in dto ? { primaryContactId: dto.primaryContactId ?? null } : {}),
        ...('ownerId' in dto ? { ownerId: dto.ownerId ?? null } : {}),
        ...('amount' in dto ? { amount: dto.amount ? toMinor(dto.amount, existing.currency) : 0n } : {}),
        ...('probability' in dto ? { probability: dto.probability } : {}),
        ...('expectedCloseDate' in dto ? { expectedCloseDate: dto.expectedCloseDate ? new Date(dto.expectedCloseDate) : null } : {}),
        ...('sourceId' in dto ? { sourceId: dto.sourceId ?? null } : {}),
        ...('priority' in dto ? { priority: dto.priority } : {}),
        ...('competitor' in dto ? { competitor: dto.competitor ?? null } : {}),
        ...('nextAction' in dto ? { nextAction: dto.nextAction ?? null } : {}),
        ...('nextActionAt' in dto ? { nextActionAt: dto.nextActionAt ? new Date(dto.nextActionAt) : null } : {}),
        ...('tags' in dto ? { tags: dto.tags ?? [] } : {}),
        ...('notes' in dto ? { notes: dto.notes ?? null } : {}),
        updatedBy: currentUserId(),
      },
      include: this.includeRefs(),
    });
    await this.audit.record({ action: 'opportunity.updated', entityType: 'opportunity', entityId: opp.id });
    return this.toDto(opp);
  }

  async changeStage(id: string, dto: ChangeStageDto) {
    const existing = await this.getScopedOrThrow(id);
    if (existing.status !== OpportunityStatus.OPEN) {
      throw new BadRequestException('Only open opportunities can change stage');
    }
    const stage = await this.getStage(dto.stageId, existing.pipelineId);
    if (stage.type !== 'open') {
      throw new BadRequestException('Use win/lose to close an opportunity');
    }
    if (stage.id === existing.stageId) return this.findOne(existing.id);

    const durationSeconds = Math.round((Date.now() - new Date(existing.stageEnteredAt).getTime()) / 1000);

    await this.prisma.$transaction([
      this.prisma.opportunityStageHistory.create({
        data: {
          organizationId: existing.organizationId,
          opportunityId: existing.id,
          fromStageId: existing.stageId,
          toStageId: stage.id,
          fromProbability: existing.probability,
          toProbability: stage.defaultProbability,
          durationSeconds,
          changedBy: currentUserId(),
        },
      }),
      this.prisma.opportunity.update({
        where: { id: existing.id },
        data: {
          stageId: stage.id,
          probability: stage.defaultProbability,
          stageEnteredAt: new Date(),
          updatedBy: currentUserId(),
        },
      }),
    ]);

    await this.audit.record({
      action: 'opportunity.stage_changed',
      entityType: 'opportunity',
      entityId: existing.id,
      oldValues: { stageId: existing.stageId },
      newValues: { stageId: stage.id },
    });
    this.emit(DomainEvent.OPPORTUNITY_STAGE_CHANGED, existing.id, { toStageId: stage.id });
    return this.findOne(existing.id);
  }

  async win(id: string, dto: WinOpportunityDto) {
    const existing = await this.getScopedOrThrow(id);
    this.assertOpen(existing, OpportunityStatus.WON);

    const amount = dto.amount ? toMinor(dto.amount, existing.currency) : existing.amount;
    if (amount <= 0n) throw new BadRequestException('A won opportunity needs an amount greater than zero');
    const closeDate = dto.closeDate ? new Date(dto.closeDate) : existing.expectedCloseDate ?? new Date();
    const wonStage = await this.stageOfType(existing.pipelineId, 'won');

    await this.closeOpportunity(existing, {
      status: OpportunityStatus.WON,
      stageId: wonStage.id,
      probability: 100,
      amount,
      expectedCloseDate: closeDate,
    });
    await this.audit.record({ action: 'opportunity.won', entityType: 'opportunity', entityId: existing.id, newValues: { amount: amount.toString() } });
    this.emit(DomainEvent.OPPORTUNITY_WON, existing.id);
    return this.findOne(existing.id);
  }

  async lose(id: string, dto: LoseOpportunityDto) {
    const existing = await this.getScopedOrThrow(id);
    this.assertOpen(existing, OpportunityStatus.LOST);
    const lostStage = await this.stageOfType(existing.pipelineId, 'lost');

    await this.closeOpportunity(existing, {
      status: OpportunityStatus.LOST,
      stageId: lostStage.id,
      probability: 0,
      lostReason: dto.lostReason,
      lostNotes: dto.lostNotes ?? null,
    });
    await this.audit.record({ action: 'opportunity.lost', entityType: 'opportunity', entityId: existing.id, newValues: { lostReason: dto.lostReason } });
    this.emit(DomainEvent.OPPORTUNITY_LOST, existing.id, { lostReason: dto.lostReason });
    return this.findOne(existing.id);
  }

  async remove(id: string) {
    const existing = await this.getScopedOrThrow(id);
    await this.prisma.opportunity.update({
      where: { id: existing.id },
      data: { deletedAt: new Date(), updatedBy: currentUserId() },
    });
    await this.audit.record({ action: 'opportunity.deleted', entityType: 'opportunity', entityId: existing.id });
    return { ok: true };
  }

  // ---- shared helper used by lead conversion ----

  /** Creates an opportunity for a converted lead, inside an existing tx. */
  async createForConversion(
    tx: any,
    input: { organizationId: string; name: string; accountId: string; primaryContactId: string | null; ownerId: string | null; amountMinor: bigint; currency: string; sourceId: string | null },
  ): Promise<string> {
    const pipeline = await tx.pipeline.findFirst({
      where: { organizationId: input.organizationId, isDefault: true },
    });
    if (!pipeline) throw new BadRequestException('No default pipeline configured');
    const stage = await tx.pipelineStage.findFirst({
      where: { pipelineId: pipeline.id, type: 'open' },
      orderBy: { sortOrder: 'asc' },
    });
    const opp = await tx.opportunity.create({
      data: {
        organizationId: input.organizationId,
        name: input.name,
        accountId: input.accountId,
        primaryContactId: input.primaryContactId,
        ownerId: input.ownerId,
        pipelineId: pipeline.id,
        stageId: stage.id,
        amount: input.amountMinor,
        currency: input.currency,
        probability: stage.defaultProbability,
        sourceId: input.sourceId,
        stageEnteredAt: new Date(),
        createdBy: input.ownerId,
        updatedBy: input.ownerId,
      },
    });
    await tx.opportunityStageHistory.create({
      data: {
        organizationId: input.organizationId,
        opportunityId: opp.id,
        toStageId: stage.id,
        toProbability: stage.defaultProbability,
        changedBy: input.ownerId,
      },
    });
    return opp.id;
  }

  // ---- helpers ----

  private assertOpen(opp: any, to: OpportunityStatus) {
    if (!canTransition(OPPORTUNITY_TRANSITIONS, opp.status, to)) {
      throw new BadRequestException(`Opportunity is already ${opp.status}`);
    }
  }

  private async closeOpportunity(
    existing: any,
    patch: {
      status: string;
      stageId: string;
      probability: number;
      amount?: bigint;
      expectedCloseDate?: Date;
      lostReason?: string;
      lostNotes?: string | null;
    },
  ) {
    const durationSeconds = Math.round((Date.now() - new Date(existing.stageEnteredAt).getTime()) / 1000);
    await this.prisma.$transaction([
      this.prisma.opportunityStageHistory.create({
        data: {
          organizationId: existing.organizationId,
          opportunityId: existing.id,
          fromStageId: existing.stageId,
          toStageId: patch.stageId,
          fromProbability: existing.probability,
          toProbability: patch.probability,
          durationSeconds,
          changedBy: currentUserId(),
        },
      }),
      this.prisma.opportunity.update({
        where: { id: existing.id },
        data: {
          status: patch.status,
          stageId: patch.stageId,
          probability: patch.probability,
          closedAt: new Date(),
          stageEnteredAt: new Date(),
          ...(patch.amount !== undefined ? { amount: patch.amount } : {}),
          ...(patch.expectedCloseDate ? { expectedCloseDate: patch.expectedCloseDate } : {}),
          ...(patch.lostReason !== undefined ? { lostReason: patch.lostReason } : {}),
          ...(patch.lostNotes !== undefined ? { lostNotes: patch.lostNotes } : {}),
          updatedBy: currentUserId(),
        },
      }),
    ]);
  }

  private scopeWhere(): Record<string, unknown> {
    const organizationId = requireOrgId();
    if (!isOwnScoped()) return { organizationId };
    return { organizationId, ownerId: currentUserId() };
  }

  private async getScopedOrThrow(id: string) {
    const organizationId = requireOrgId();
    const opp = await this.prisma.opportunity.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    if (!opp) throw new NotFoundException('Opportunity not found');
    if (isOwnScoped() && !canAccessOwned(opp.ownerId)) {
      throw new ForbiddenException('You do not have access to this opportunity');
    }
    return opp;
  }

  private async getDefaultPipeline() {
    const organizationId = requireOrgId();
    const pipeline = await this.prisma.pipeline.findFirst({
      where: { organizationId, isDefault: true, isActive: true },
    });
    if (!pipeline) throw new BadRequestException('No default pipeline configured');
    return pipeline;
  }

  private async getPipeline(id: string) {
    const organizationId = requireOrgId();
    const pipeline = await this.prisma.pipeline.findFirst({ where: { id, organizationId } });
    if (!pipeline) throw new BadRequestException('Pipeline not found');
    return pipeline;
  }

  private async getStage(stageId: string, pipelineId: string) {
    const stage = await this.prisma.pipelineStage.findFirst({ where: { id: stageId, pipelineId } });
    if (!stage) throw new BadRequestException('Stage does not belong to this pipeline');
    return stage;
  }

  private async firstOpenStage(pipelineId: string) {
    const stage = await this.prisma.pipelineStage.findFirst({
      where: { pipelineId, type: 'open' },
      orderBy: { sortOrder: 'asc' },
    });
    if (!stage) throw new BadRequestException('Pipeline has no open stages');
    return stage;
  }

  private async stageOfType(pipelineId: string, type: 'won' | 'lost') {
    const stage = await this.prisma.pipelineStage.findFirst({ where: { pipelineId, type } });
    if (!stage) throw new BadRequestException(`Pipeline has no ${type} stage`);
    return stage;
  }

  private async assertAccountAccessible(accountId: string): Promise<void> {
    const organizationId = requireOrgId();
    const acc = await this.prisma.account.findFirst({
      where: { id: accountId, organizationId, deletedAt: null },
      select: { ownerId: true },
    });
    if (!acc) throw new BadRequestException('Account not found');
    if (!canAccessOwned(acc.ownerId)) throw new ForbiddenException('No access to that account');
  }

  private async baseCurrency(): Promise<string> {
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: requireOrgId() },
      select: { baseCurrency: true },
    });
    return org.baseCurrency;
  }

  private includeRefs() {
    return {
      account: { select: { id: true, name: true } },
      owner: { select: { id: true, firstName: true, lastName: true } },
      stage: { select: { id: true, name: true, type: true } },
      primaryContact: { select: { id: true, firstName: true, lastName: true } },
    };
  }

  private emit(event: string, entityId: string, data?: unknown): void {
    this.events.emit(event, {
      organizationId: requireOrgId(),
      actorId: currentUserId(),
      entityType: 'opportunity',
      entityId,
      data,
      at: new Date().toISOString(),
    });
  }

  private toDto(o: any, detailed = false) {
    if (!o) return null;
    const weightedMinor = mulRatio(o.amount, BigInt(o.probability), 100n);
    const daysInStage = Math.floor((Date.now() - new Date(o.stageEnteredAt).getTime()) / 86400000);
    return {
      id: o.id,
      name: o.name,
      account: o.account ? { id: o.account.id, name: o.account.name } : null,
      primaryContact: o.primaryContact ? { id: o.primaryContact.id, name: `${o.primaryContact.firstName} ${o.primaryContact.lastName}` } : null,
      owner: o.owner ? { id: o.owner.id, name: `${o.owner.firstName} ${o.owner.lastName}` } : null,
      pipelineId: o.pipelineId,
      stageId: o.stageId,
      stage: o.stage ? { id: o.stage.id, name: o.stage.name, type: o.stage.type } : null,
      amount: toMajorString(o.amount, o.currency),
      currency: o.currency,
      probability: o.probability,
      weighted: toMajorString(weightedMinor, o.currency),
      expectedCloseDate: o.expectedCloseDate,
      priority: o.priority,
      competitor: o.competitor,
      nextAction: o.nextAction,
      nextActionAt: o.nextActionAt,
      status: o.status,
      lostReason: o.lostReason,
      lostNotes: o.lostNotes,
      closedAt: o.closedAt,
      daysInStage,
      tags: o.tags ?? [],
      notes: o.notes,
      ...(detailed
        ? {
            stages: o.pipeline?.stages?.map((s: any) => ({ id: s.id, name: s.name, type: s.type, defaultProbability: s.defaultProbability })),
            history: o.stageHistory?.map((h: any) => ({
              id: h.id,
              fromStageId: h.fromStageId,
              toStageId: h.toStageId,
              fromProbability: h.fromProbability,
              toProbability: h.toProbability,
              durationSeconds: h.durationSeconds,
              changedAt: h.changedAt,
            })),
          }
        : {}),
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
    };
  }
}
