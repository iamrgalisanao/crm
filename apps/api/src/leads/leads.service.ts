import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  DomainEvent,
  LeadStatus,
  LEAD_TRANSITIONS,
  canTransition,
  classifyScore,
  toMinor,
  toMajorString,
} from '@crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { requireOrgId, currentUserId } from '../common/context/request-context';
import { isOwnScoped, canAccessOwned } from '../common/scope/ownership-scope';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import {
  ChangeStatusDto,
  AssignLeadDto,
  ScoreLeadDto,
  ConvertLeadDto,
} from './dto/lead-actions.dto';
import { OpportunitiesService } from '../opportunities/opportunities.service';

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
    private readonly opportunities: OpportunitiesService,
  ) {}

  async list(params: {
    q?: string;
    status?: string;
    sourceId?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 25));

    const where: Record<string, unknown> = { ...this.scopeWhere(), deletedAt: null };
    if (params.status) where.status = params.status;
    if (params.sourceId) where.sourceId = params.sourceId;
    if (params.q) {
      where.OR = [
        { name: { contains: params.q, mode: 'insensitive' } },
        { company: { contains: params.q, mode: 'insensitive' } },
        { email: { contains: params.q, mode: 'insensitive' } },
        { leadNo: { contains: params.q, mode: 'insensitive' } },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.lead.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          source: { select: { id: true, label: true } },
          assignedUser: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.lead.count({ where }),
    ]);

    return {
      data: rows.map((r) => this.toDto(r)),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  /** Aggregate leads by location + status for the map heatmap. */
  async byLocation() {
    const where: Record<string, unknown> = { ...this.scopeWhere(), deletedAt: null, location: { not: null } };
    const groups = await this.prisma.lead.groupBy({
      by: ['location', 'status'],
      where,
      _count: { _all: true },
    });
    const map = new Map<string, { location: string; total: number; statuses: Record<string, number> }>();
    for (const g of groups) {
      const loc = (g.location ?? '').trim();
      if (!loc) continue;
      if (!map.has(loc)) map.set(loc, { location: loc, total: 0, statuses: {} });
      const entry = map.get(loc)!;
      entry.total += g._count._all;
      entry.statuses[g.status] = (entry.statuses[g.status] ?? 0) + g._count._all;
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }

  async findOne(id: string) {
    const lead = await this.getScopedOrThrow(id);
    const full = await this.prisma.lead.findUnique({
      where: { id: lead.id },
      include: {
        source: { select: { id: true, label: true } },
        assignedUser: { select: { id: true, firstName: true, lastName: true } },
        scores: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });
    return this.toDto(full);
  }

  async create(dto: CreateLeadDto) {
    const organizationId = requireOrgId();
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { baseCurrency: true },
    });
    const currency = org.baseCurrency;

    const lead = await this.prisma.$transaction(async (tx) => {
      const leadNo = await this.nextLeadNo(tx, organizationId);
      return tx.lead.create({
        data: {
          organizationId,
          leadNo,
          name: dto.name,
          company: dto.company ?? null,
          contactPerson: dto.contactPerson ?? null,
          email: dto.email ?? null,
          phone: dto.phone ?? null,
          mobile: dto.mobile ?? null,
          sourceId: dto.sourceId ?? null,
          industry: dto.industry ?? null,
          interest: dto.interest ?? null,
          estimatedBudget: dto.estimatedBudget ? toMinor(dto.estimatedBudget, currency) : null,
          currency,
          location: dto.location ?? null,
          // Default assignment to the creator so reps immediately own it.
          assignedUserId: dto.assignedUserId ?? currentUserId(),
          priority: dto.priority ?? 'medium',
          tags: dto.tags ?? [],
          notes: dto.notes ?? null,
          nextFollowupAt: dto.nextFollowupAt ? new Date(dto.nextFollowupAt) : null,
          createdBy: currentUserId(),
          updatedBy: currentUserId(),
        },
        include: {
          source: { select: { id: true, label: true } },
          assignedUser: { select: { id: true, firstName: true, lastName: true } },
        },
      });
    });

    await this.audit.record({
      action: 'lead.created',
      entityType: 'lead',
      entityId: lead.id,
      newValues: { leadNo: lead.leadNo, name: lead.name },
    });
    this.emit(DomainEvent.LEAD_CREATED, lead.id);
    return this.toDto(lead);
  }

  async update(id: string, dto: UpdateLeadDto) {
    const existing = await this.getScopedOrThrow(id);
    const lead = await this.prisma.lead.update({
      where: { id: existing.id },
      data: {
        ...('name' in dto ? { name: dto.name } : {}),
        ...('company' in dto ? { company: dto.company ?? null } : {}),
        ...('contactPerson' in dto ? { contactPerson: dto.contactPerson ?? null } : {}),
        ...('email' in dto ? { email: dto.email ?? null } : {}),
        ...('phone' in dto ? { phone: dto.phone ?? null } : {}),
        ...('mobile' in dto ? { mobile: dto.mobile ?? null } : {}),
        ...('sourceId' in dto ? { sourceId: dto.sourceId ?? null } : {}),
        ...('industry' in dto ? { industry: dto.industry ?? null } : {}),
        ...('interest' in dto ? { interest: dto.interest ?? null } : {}),
        ...('estimatedBudget' in dto
          ? { estimatedBudget: dto.estimatedBudget ? toMinor(dto.estimatedBudget, existing.currency) : null }
          : {}),
        ...('location' in dto ? { location: dto.location ?? null } : {}),
        ...('priority' in dto ? { priority: dto.priority } : {}),
        ...('tags' in dto ? { tags: dto.tags ?? [] } : {}),
        ...('notes' in dto ? { notes: dto.notes ?? null } : {}),
        ...('nextFollowupAt' in dto
          ? { nextFollowupAt: dto.nextFollowupAt ? new Date(dto.nextFollowupAt) : null }
          : {}),
        ...('lastContactedAt' in dto
          ? { lastContactedAt: dto.lastContactedAt ? new Date(dto.lastContactedAt) : null }
          : {}),
        updatedBy: currentUserId(),
      },
      include: {
        source: { select: { id: true, label: true } },
        assignedUser: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    await this.audit.record({
      action: 'lead.updated',
      entityType: 'lead',
      entityId: lead.id,
    });
    return this.toDto(lead);
  }

  async remove(id: string) {
    const existing = await this.getScopedOrThrow(id);
    await this.prisma.lead.update({
      where: { id: existing.id },
      data: { deletedAt: new Date(), updatedBy: currentUserId() },
    });
    await this.audit.record({ action: 'lead.deleted', entityType: 'lead', entityId: existing.id });
    return { ok: true };
  }

  async changeStatus(id: string, dto: ChangeStatusDto) {
    const existing = await this.getScopedOrThrow(id);
    const from = existing.status as LeadStatus;
    const to = dto.status as LeadStatus;

    if (from === to) return this.toDto(existing);
    if (!canTransition(LEAD_TRANSITIONS, from, to)) {
      throw new BadRequestException(`Illegal status change: ${from} → ${to}`);
    }
    if (to === LeadStatus.CONVERTED) {
      throw new BadRequestException('Use the convert action to convert a lead');
    }
    if (to === LeadStatus.LOST && !dto.lostReason) {
      throw new BadRequestException('A loss reason is required to mark a lead lost');
    }

    const lead = await this.prisma.lead.update({
      where: { id: existing.id },
      data: {
        status: to,
        lostReason: to === LeadStatus.LOST ? dto.lostReason ?? null : existing.lostReason,
        lostNotes: to === LeadStatus.LOST ? dto.lostNotes ?? null : existing.lostNotes,
        updatedBy: currentUserId(),
      },
      include: {
        source: { select: { id: true, label: true } },
        assignedUser: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    await this.audit.record({
      action: 'lead.status_changed',
      entityType: 'lead',
      entityId: lead.id,
      oldValues: { status: from },
      newValues: { status: to },
    });
    this.emit(DomainEvent.LEAD_STATUS_CHANGED, lead.id, { from, to });
    return this.toDto(lead);
  }

  async assign(id: string, dto: AssignLeadDto) {
    const existing = await this.getScopedOrThrow(id);
    const organizationId = requireOrgId();

    const target = await this.prisma.user.findFirst({
      where: { id: dto.userId, organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!target) throw new BadRequestException('Assignee not found');

    const lead = await this.prisma.lead.update({
      where: { id: existing.id },
      data: { assignedUserId: dto.userId, updatedBy: currentUserId() },
      include: {
        source: { select: { id: true, label: true } },
        assignedUser: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    await this.audit.record({
      action: 'lead.assigned',
      entityType: 'lead',
      entityId: lead.id,
      oldValues: { assignedUserId: existing.assignedUserId },
      newValues: { assignedUserId: dto.userId },
    });
    this.emit(DomainEvent.LEAD_ASSIGNED, lead.id, { assignedUserId: dto.userId });
    return this.toDto(lead);
  }

  async score(id: string, dto: ScoreLeadDto) {
    const existing = await this.getScopedOrThrow(id);
    const organizationId = requireOrgId();

    const computed =
      dto.total ??
      Object.values(dto.criteria).reduce((sum, v) => sum + (Number(v) || 0), 0);
    const total = Math.max(0, Math.min(100, Math.round(computed)));
    const classification = classifyScore(total);

    await this.prisma.$transaction([
      this.prisma.leadScore.create({
        data: {
          organizationId,
          leadId: existing.id,
          model: dto.model ?? 'custom',
          criteria: dto.criteria,
          total,
          classification,
          scoredBy: currentUserId(),
        },
      }),
      this.prisma.lead.update({
        where: { id: existing.id },
        data: { score: total, updatedBy: currentUserId() },
      }),
    ]);

    await this.audit.record({
      action: 'lead.scored',
      entityType: 'lead',
      entityId: existing.id,
      newValues: { total, classification },
    });
    return this.findOne(existing.id);
  }

  async convert(id: string, dto: ConvertLeadDto) {
    const existing = await this.getScopedOrThrow(id);
    const organizationId = requireOrgId();

    if (existing.status === LeadStatus.CONVERTED || existing.convertedAccountId) {
      throw new ConflictException('Lead is already converted');
    }
    if (!canTransition(LEAD_TRANSITIONS, existing.status as LeadStatus, LeadStatus.CONVERTED)) {
      throw new BadRequestException('Only a qualified lead can be converted');
    }

    const ownerId = existing.assignedUserId ?? currentUserId();

    const result = await this.prisma.$transaction(async (tx) => {
      // Account: link existing (scoped) or create from the lead.
      let accountId = dto.accountId ?? null;
      if (accountId) {
        const acc = await tx.account.findFirst({
          where: { id: accountId, organizationId, deletedAt: null },
          select: { id: true, ownerId: true },
        });
        if (!acc) throw new BadRequestException('Account not found');
        if (!canAccessOwned(acc.ownerId)) throw new ForbiddenException('No access to that account');
      } else {
        const account = await tx.account.create({
          data: {
            organizationId,
            name: dto.accountName ?? existing.company ?? existing.name,
            industry: existing.industry ?? null,
            phone: existing.phone ?? null,
            ownerId,
            status: 'prospect',
            createdBy: currentUserId(),
            updatedBy: currentUserId(),
          },
        });
        accountId = account.id;
      }

      // Contact: link existing (scoped to account) or create from the lead.
      let contactId = dto.contactId ?? null;
      if (contactId) {
        const c = await tx.contact.findFirst({
          where: { id: contactId, organizationId, deletedAt: null },
          select: { id: true },
        });
        if (!c) throw new BadRequestException('Contact not found');
        await tx.contact.update({ where: { id: contactId }, data: { accountId } });
      } else {
        const { firstName, lastName } = splitName(existing.contactPerson ?? existing.name);
        const contact = await tx.contact.create({
          data: {
            organizationId,
            accountId,
            firstName,
            lastName,
            email: existing.email ?? null,
            phone: existing.phone ?? null,
            mobile: existing.mobile ?? null,
            isPrimary: true,
            createdBy: currentUserId(),
            updatedBy: currentUserId(),
          },
        });
        contactId = contact.id;
      }

      // Create an opportunity unless explicitly disabled.
      let opportunityId: string | null = null;
      if (dto.createOpportunity !== false) {
        const oppName = existing.interest
          ? `${dto.accountName ?? existing.company ?? existing.name} – ${existing.interest}`
          : dto.accountName ?? existing.company ?? existing.name;
        opportunityId = await this.opportunities.createForConversion(tx, {
          organizationId,
          name: oppName,
          accountId: accountId!,
          primaryContactId: contactId,
          ownerId,
          amountMinor: existing.estimatedBudget ?? 0n,
          currency: existing.currency,
          sourceId: existing.sourceId,
        });
      }

      const lead = await tx.lead.update({
        where: { id: existing.id },
        data: {
          status: LeadStatus.CONVERTED,
          convertedAccountId: accountId,
          convertedContactId: contactId,
          convertedOpportunityId: opportunityId,
          convertedAt: new Date(),
          updatedBy: currentUserId(),
        },
      });
      return { lead, accountId, contactId, opportunityId };
    });

    await this.audit.record({
      action: 'lead.converted',
      entityType: 'lead',
      entityId: existing.id,
      newValues: { accountId: result.accountId, contactId: result.contactId },
    });
    this.emit(DomainEvent.LEAD_CONVERTED, existing.id, {
      accountId: result.accountId,
      contactId: result.contactId,
    });

    return {
      leadId: existing.id,
      accountId: result.accountId,
      contactId: result.contactId,
      opportunityId: result.opportunityId,
    };
  }

  // ---- helpers ----

  private scopeWhere(): Record<string, unknown> {
    const organizationId = requireOrgId();
    if (!isOwnScoped()) return { organizationId };
    return { organizationId, assignedUserId: currentUserId() };
  }

  private async getScopedOrThrow(id: string) {
    const organizationId = requireOrgId();
    const lead = await this.prisma.lead.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    if (!lead) throw new NotFoundException('Lead not found');
    if (isOwnScoped() && !canAccessOwned(lead.assignedUserId)) {
      throw new ForbiddenException('You do not have access to this lead');
    }
    return lead;
  }

  private async nextLeadNo(tx: any, organizationId: string): Promise<string> {
    const count = await tx.lead.count({ where: { organizationId } });
    return `L-${String(count + 1).padStart(5, '0')}`;
  }

  private emit(event: string, entityId: string, data?: unknown): void {
    this.events.emit(event, {
      organizationId: requireOrgId(),
      actorId: currentUserId(),
      entityType: 'lead',
      entityId,
      data,
      at: new Date().toISOString(),
    });
  }

  private toDto(l: any) {
    if (!l) return null;
    return {
      id: l.id,
      leadNo: l.leadNo,
      name: l.name,
      company: l.company,
      contactPerson: l.contactPerson,
      email: l.email,
      phone: l.phone,
      mobile: l.mobile,
      source: l.source ? { id: l.source.id, label: l.source.label } : null,
      industry: l.industry,
      interest: l.interest,
      estimatedBudget: l.estimatedBudget != null ? toMajorString(l.estimatedBudget, l.currency) : null,
      currency: l.currency,
      location: l.location,
      assignedUser: l.assignedUser
        ? { id: l.assignedUser.id, name: `${l.assignedUser.firstName} ${l.assignedUser.lastName}` }
        : null,
      status: l.status,
      score: l.score,
      classification: classifyScore(l.score),
      priority: l.priority,
      tags: l.tags ?? [],
      notes: l.notes,
      lastContactedAt: l.lastContactedAt,
      nextFollowupAt: l.nextFollowupAt,
      lostReason: l.lostReason,
      lostNotes: l.lostNotes,
      convertedAccountId: l.convertedAccountId,
      convertedContactId: l.convertedContactId,
      convertedOpportunityId: l.convertedOpportunityId,
      convertedAt: l.convertedAt,
      scores: l.scores?.map((s: any) => ({
        id: s.id,
        model: s.model,
        criteria: s.criteria,
        total: s.total,
        classification: s.classification,
        createdAt: s.createdAt,
      })),
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
    };
  }
}

function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: '-' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}
