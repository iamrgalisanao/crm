import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ActivityStatus, ActivityRelatedType } from '@crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { requireOrgId, currentUserId } from '../common/context/request-context';
import { isOwnScoped, canAccessOwned } from '../common/scope/ownership-scope';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto, CompleteActivityDto } from './dto/update-activity.dto';

export interface ListActivitiesParams {
  relatedType?: string;
  relatedId?: string;
  filter?: 'overdue' | 'upcoming' | 'open' | 'done' | 'all';
  page?: number;
  limit?: number;
}

@Injectable()
export class ActivitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(params: ListActivitiesParams) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(200, Math.max(1, params.limit ?? 50));
    const now = new Date();

    const where: Record<string, unknown> = { ...this.scopeWhere(), deletedAt: null };
    if (params.relatedType) where.relatedType = params.relatedType;
    if (params.relatedId) where.relatedId = params.relatedId;

    switch (params.filter) {
      case 'overdue':
        where.status = ActivityStatus.OPEN;
        where.dueDate = { lt: now };
        break;
      case 'upcoming':
        where.status = ActivityStatus.OPEN;
        where.dueDate = { gte: now };
        break;
      case 'open':
        where.status = ActivityStatus.OPEN;
        break;
      case 'done':
        where.status = ActivityStatus.DONE;
        break;
      default:
        break;
    }

    const [rows, total] = await Promise.all([
      this.prisma.activity.findMany({
        where,
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: { owner: { select: { id: true, firstName: true, lastName: true } } },
      }),
      this.prisma.activity.count({ where }),
    ]);

    const labels = await this.resolveRelatedLabels(rows);
    return {
      data: rows.map((r) => this.toDto(r, labels)),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  async counts() {
    const now = new Date();
    const base = { ...this.scopeWhere(), deletedAt: null };
    const [overdue, upcoming, open] = await Promise.all([
      this.prisma.activity.count({ where: { ...base, status: ActivityStatus.OPEN, dueDate: { lt: now } } }),
      this.prisma.activity.count({ where: { ...base, status: ActivityStatus.OPEN, dueDate: { gte: now } } }),
      this.prisma.activity.count({ where: { ...base, status: ActivityStatus.OPEN } }),
    ]);
    return { overdue, upcoming, open };
  }

  async create(dto: CreateActivityDto) {
    const organizationId = requireOrgId();
    await this.assertRelatedAccessible(dto.relatedType, dto.relatedId);

    const activity = await this.prisma.activity.create({
      data: {
        organizationId,
        type: dto.type,
        subject: dto.subject,
        description: dto.description ?? null,
        relatedType: dto.relatedType,
        relatedId: dto.relatedId,
        ownerId: dto.ownerId ?? currentUserId(),
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        dueTime: dto.dueTime ?? null,
        priority: dto.priority ?? 'medium',
        reminderAt: dto.reminderAt ? new Date(dto.reminderAt) : null,
        createdBy: currentUserId(),
        updatedBy: currentUserId(),
      },
      include: { owner: { select: { id: true, firstName: true, lastName: true } } },
    });

    await this.audit.record({
      action: 'activity.created',
      entityType: 'activity',
      entityId: activity.id,
      newValues: { type: activity.type, subject: activity.subject, relatedType: activity.relatedType },
    });
    const labels = await this.resolveRelatedLabels([activity]);
    return this.toDto(activity, labels);
  }

  async update(id: string, dto: UpdateActivityDto) {
    const existing = await this.getScopedOrThrow(id);
    const activity = await this.prisma.activity.update({
      where: { id: existing.id },
      data: {
        ...('type' in dto ? { type: dto.type } : {}),
        ...('subject' in dto ? { subject: dto.subject } : {}),
        ...('description' in dto ? { description: dto.description ?? null } : {}),
        ...('ownerId' in dto ? { ownerId: dto.ownerId ?? null } : {}),
        ...('dueDate' in dto ? { dueDate: dto.dueDate ? new Date(dto.dueDate) : null } : {}),
        ...('dueTime' in dto ? { dueTime: dto.dueTime ?? null } : {}),
        ...('priority' in dto ? { priority: dto.priority } : {}),
        ...('reminderAt' in dto ? { reminderAt: dto.reminderAt ? new Date(dto.reminderAt) : null } : {}),
        updatedBy: currentUserId(),
      },
      include: { owner: { select: { id: true, firstName: true, lastName: true } } },
    });
    await this.audit.record({ action: 'activity.updated', entityType: 'activity', entityId: activity.id });
    const labels = await this.resolveRelatedLabels([activity]);
    return this.toDto(activity, labels);
  }

  async complete(id: string, dto: CompleteActivityDto) {
    const existing = await this.getScopedOrThrow(id);
    if (existing.status === ActivityStatus.DONE) {
      throw new BadRequestException('Activity already completed');
    }
    const activity = await this.prisma.activity.update({
      where: { id: existing.id },
      data: {
        status: ActivityStatus.DONE,
        completedAt: new Date(),
        outcome: dto.outcome ?? null,
        updatedBy: currentUserId(),
      },
      include: { owner: { select: { id: true, firstName: true, lastName: true } } },
    });
    await this.audit.record({ action: 'activity.completed', entityType: 'activity', entityId: activity.id });
    const labels = await this.resolveRelatedLabels([activity]);
    return this.toDto(activity, labels);
  }

  async remove(id: string) {
    const existing = await this.getScopedOrThrow(id);
    await this.prisma.activity.update({
      where: { id: existing.id },
      data: { deletedAt: new Date(), updatedBy: currentUserId() },
    });
    await this.audit.record({ action: 'activity.deleted', entityType: 'activity', entityId: existing.id });
    return { ok: true };
  }

  // ---- helpers ----

  private scopeWhere(): Record<string, unknown> {
    const organizationId = requireOrgId();
    if (!isOwnScoped()) return { organizationId };
    return { organizationId, ownerId: currentUserId() };
  }

  private async getScopedOrThrow(id: string) {
    const organizationId = requireOrgId();
    const activity = await this.prisma.activity.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    if (!activity) throw new NotFoundException('Activity not found');
    if (isOwnScoped() && !canAccessOwned(activity.ownerId)) {
      throw new ForbiddenException('You do not have access to this activity');
    }
    return activity;
  }

  /** Verify the target entity exists in the tenant and is within the user's scope. */
  private async assertRelatedAccessible(relatedType: string, relatedId: string): Promise<void> {
    const organizationId = requireOrgId();
    switch (relatedType) {
      case ActivityRelatedType.LEAD: {
        const lead = await this.prisma.lead.findFirst({
          where: { id: relatedId, organizationId, deletedAt: null },
          select: { assignedUserId: true },
        });
        if (!lead) throw new BadRequestException('Lead not found');
        if (!canAccessOwned(lead.assignedUserId)) throw new ForbiddenException('No access to that lead');
        return;
      }
      case ActivityRelatedType.ACCOUNT: {
        const acc = await this.prisma.account.findFirst({
          where: { id: relatedId, organizationId, deletedAt: null },
          select: { ownerId: true },
        });
        if (!acc) throw new BadRequestException('Account not found');
        if (!canAccessOwned(acc.ownerId)) throw new ForbiddenException('No access to that account');
        return;
      }
      case ActivityRelatedType.CONTACT: {
        const c = await this.prisma.contact.findFirst({
          where: { id: relatedId, organizationId, deletedAt: null },
          select: { account: { select: { ownerId: true } }, createdBy: true },
        });
        if (!c) throw new BadRequestException('Contact not found');
        const ownerId = c.account?.ownerId ?? c.createdBy ?? null;
        if (!canAccessOwned(ownerId)) throw new ForbiddenException('No access to that contact');
        return;
      }
      case ActivityRelatedType.OPPORTUNITY: {
        const opp = await this.prisma.opportunity.findFirst({
          where: { id: relatedId, organizationId, deletedAt: null },
          select: { ownerId: true },
        });
        if (!opp) throw new BadRequestException('Opportunity not found');
        if (!canAccessOwned(opp.ownerId)) throw new ForbiddenException('No access to that opportunity');
        return;
      }
      default:
        throw new BadRequestException(`Unsupported related type: ${relatedType}`);
    }
  }

  /** Batch-resolve display names for the related entities of a page of rows. */
  private async resolveRelatedLabels(
    rows: { relatedType: string; relatedId: string }[],
  ): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const byType: Record<string, Set<string>> = {};
    for (const r of rows) {
      (byType[r.relatedType] ??= new Set()).add(r.relatedId);
    }
    const key = (t: string, id: string) => `${t}:${id}`;

    if (byType[ActivityRelatedType.LEAD]) {
      const leads = await this.prisma.lead.findMany({
        where: { id: { in: [...byType[ActivityRelatedType.LEAD]] } },
        select: { id: true, name: true, leadNo: true },
      });
      leads.forEach((l) => map.set(key('lead', l.id), `${l.name} (${l.leadNo})`));
    }
    if (byType[ActivityRelatedType.ACCOUNT]) {
      const accts = await this.prisma.account.findMany({
        where: { id: { in: [...byType[ActivityRelatedType.ACCOUNT]] } },
        select: { id: true, name: true },
      });
      accts.forEach((a) => map.set(key('account', a.id), a.name));
    }
    if (byType[ActivityRelatedType.CONTACT]) {
      const contacts = await this.prisma.contact.findMany({
        where: { id: { in: [...byType[ActivityRelatedType.CONTACT]] } },
        select: { id: true, firstName: true, lastName: true },
      });
      contacts.forEach((c) => map.set(key('contact', c.id), `${c.firstName} ${c.lastName}`));
    }
    if (byType[ActivityRelatedType.OPPORTUNITY]) {
      const opps = await this.prisma.opportunity.findMany({
        where: { id: { in: [...byType[ActivityRelatedType.OPPORTUNITY]] } },
        select: { id: true, name: true },
      });
      opps.forEach((o) => map.set(key('opportunity', o.id), o.name));
    }
    return map;
  }

  private toDto(a: any, labels: Map<string, string>) {
    const now = Date.now();
    const isOverdue = a.status === ActivityStatus.OPEN && a.dueDate && new Date(a.dueDate).getTime() < now;
    return {
      id: a.id,
      type: a.type,
      subject: a.subject,
      description: a.description,
      relatedType: a.relatedType,
      relatedId: a.relatedId,
      relatedLabel: labels.get(`${a.relatedType}:${a.relatedId}`) ?? null,
      owner: a.owner ? { id: a.owner.id, name: `${a.owner.firstName} ${a.owner.lastName}` } : null,
      dueDate: a.dueDate,
      dueTime: a.dueTime,
      priority: a.priority,
      status: a.status,
      isOverdue,
      reminderAt: a.reminderAt,
      outcome: a.outcome,
      completedAt: a.completedAt,
      createdAt: a.createdAt,
    };
  }
}
