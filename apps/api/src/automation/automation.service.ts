import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { requireOrgId, currentUserId } from '../common/context/request-context';
import { AUTOMATION_TRIGGERS, TRIGGER_EVENTS, ACTION_TYPES } from './triggers';

export interface RuleDto {
  name: string;
  trigger: string;
  conditions?: any[];
  actions: { type: string; config: Record<string, any> }[];
  isActive?: boolean;
}

@Injectable()
export class AutomationService {
  constructor(private readonly prisma: PrismaService) {}

  triggers() {
    return { triggers: AUTOMATION_TRIGGERS, actionTypes: ACTION_TYPES };
  }

  async list() {
    const organizationId = requireOrgId();
    const rules = await this.prisma.automationRule.findMany({
      where: { organizationId }, orderBy: { createdAt: 'desc' },
      include: { _count: { select: { runs: true } } },
    });
    return rules.map((r) => this.dto(r));
  }

  async create(dto: RuleDto) {
    const organizationId = requireOrgId();
    this.validate(dto);
    const rule = await this.prisma.automationRule.create({
      data: {
        organizationId, name: dto.name, trigger: dto.trigger,
        conditions: dto.conditions ?? [], actions: dto.actions,
        isActive: dto.isActive ?? true, createdBy: currentUserId(),
      },
      include: { _count: { select: { runs: true } } },
    });
    return this.dto(rule);
  }

  async setActive(id: string, isActive: boolean) {
    const organizationId = requireOrgId();
    const existing = await this.prisma.automationRule.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException('Rule not found');
    const rule = await this.prisma.automationRule.update({ where: { id }, data: { isActive }, include: { _count: { select: { runs: true } } } });
    return this.dto(rule);
  }

  async remove(id: string) {
    const organizationId = requireOrgId();
    const existing = await this.prisma.automationRule.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException('Rule not found');
    await this.prisma.automationRule.delete({ where: { id } });
    return { ok: true };
  }

  async runs(ruleId?: string) {
    const organizationId = requireOrgId();
    const where: any = { organizationId };
    if (ruleId) where.ruleId = ruleId;
    const runs = await this.prisma.automationRun.findMany({
      where, orderBy: { createdAt: 'desc' }, take: 50,
      include: { rule: { select: { name: true } } },
    });
    return runs.map((r) => ({ id: r.id, rule: r.rule?.name, trigger: r.trigger, status: r.status, detail: r.detail, createdAt: r.createdAt }));
  }

  private validate(dto: RuleDto) {
    if (!TRIGGER_EVENTS.includes(dto.trigger)) throw new BadRequestException('Unknown trigger');
    if (!dto.actions?.length) throw new BadRequestException('At least one action is required');
    for (const a of dto.actions) {
      if (!(ACTION_TYPES as readonly string[]).includes(a.type)) throw new BadRequestException(`Unknown action: ${a.type}`);
      if (a.type === 'notify_role' && !a.config?.role) throw new BadRequestException('notify_role needs a role');
      if (a.type === 'webhook' && !a.config?.url) throw new BadRequestException('webhook needs a url');
    }
  }

  private dto(r: any) {
    return {
      id: r.id, name: r.name, trigger: r.trigger,
      conditions: r.conditions, actions: r.actions, isActive: r.isActive,
      runCount: r._count?.runs ?? 0, createdAt: r.createdAt,
    };
  }
}
