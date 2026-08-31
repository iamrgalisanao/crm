import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { classifyScore, toMajorString, mulRatio, OpportunityStatus } from '@crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { requireOrgId, currentUserId, isSuperAdmin, currentRoleKeys } from '../common/context/request-context';
import { AiProvider } from './providers/ai-provider';
import { HeuristicProvider } from './providers/heuristic.provider';
import { ClaudeProvider } from './providers/claude.provider';

const BROAD = ['super_admin', 'admin', 'sales_manager', 'finance', 'approver', 'viewer'];

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly provider: AiProvider;
  private readonly heuristic = new HeuristicProvider();

  constructor(private readonly prisma: PrismaService, config: ConfigService) {
    const key = config.get<string>('ANTHROPIC_API_KEY');
    if (key) {
      this.provider = new ClaudeProvider(key, config.get<string>('ANTHROPIC_MODEL', 'claude-sonnet-5'));
      this.logger.log('AI: Claude provider active');
    } else {
      this.provider = this.heuristic;
      this.logger.log('AI: heuristic provider (set ANTHROPIC_API_KEY to enable Claude)');
    }
  }

  get providerName() { return this.provider.name; }

  // ---- lead qualification ----

  async scoreLead(leadId: string) {
    const organizationId = requireOrgId();
    const lead = await this.prisma.lead.findFirst({ where: { id: leadId, organizationId, deletedAt: null } });
    if (!lead) throw new NotFoundException('Lead not found');

    const b = {
      need: lead.interest ? 25 : 5,
      budget: lead.estimatedBudget && lead.estimatedBudget > 0n ? 20 : 5,
      authority: Math.min(20, (lead.email ? 10 : 0) + (lead.phone || lead.mobile ? 5 : 0) + (lead.company ? 5 : 0)),
      timeline: lead.nextFollowupAt ? 20 : 10,
      fit: lead.industry ? 15 : 5,
    };
    const total = Math.min(100, b.need + b.budget + b.authority + b.timeline + b.fit);
    const classification = classifyScore(total);
    const recommendation = this.leadRecommendation(classification, lead);

    // Optional LLM enrichment from any free-text on the lead.
    let analysis: any = null;
    const text = [lead.interest, lead.notes].filter(Boolean).join('. ');
    if (this.provider.usesLlm && text) {
      analysis = await this.safeText(() => this.provider.analyzeInquiry(text, { company: lead.company, industry: lead.industry }));
    }

    const payload = { total, classification, breakdown: b, recommendation, analysis };
    await this.saveInsight('lead', leadId, 'lead_score', payload, total / 100);
    return { ...payload, model: this.provider.name };
  }

  // ---- opportunity risk ----

  async opportunityRisk(oppId: string) {
    const organizationId = requireOrgId();
    const opp = await this.prisma.opportunity.findFirst({
      where: { id: oppId, organizationId, deletedAt: null },
      include: { primaryContact: { select: { firstName: true, lastName: true } } },
    });
    if (!opp) throw new NotFoundException('Opportunity not found');

    const lastActivity = await this.prisma.activity.findFirst({
      where: { organizationId, relatedType: 'opportunity', relatedId: oppId, deletedAt: null },
      orderBy: { createdAt: 'desc' }, select: { createdAt: true },
    });
    const now = Date.now();
    const daysInStage = Math.floor((now - new Date(opp.stageEnteredAt).getTime()) / 86400000);
    const refDate = lastActivity?.createdAt ?? opp.createdAt;
    const daysSinceActivity = Math.floor((now - new Date(refDate).getTime()) / 86400000);

    let prob = opp.probability;
    const reasons: string[] = [];
    if (daysSinceActivity > 7) { prob -= 15; reasons.push(`No activity logged for ${daysSinceActivity} days`); }
    if (daysInStage > 21) { prob -= 10; reasons.push(`In "${daysInStage} days" at the current stage`); }
    if (!opp.primaryContact) reasons.push('No primary contact identified');
    if (!opp.expectedCloseDate) reasons.push('No expected close date set');
    prob = Math.max(0, Math.min(100, prob));

    const riskLevel = daysSinceActivity > 10 || daysInStage > 30 ? 'high' : daysSinceActivity > 7 || daysInStage > 21 ? 'medium' : 'low';
    const contactName = opp.primaryContact ? `${opp.primaryContact.firstName} ${opp.primaryContact.lastName}` : 'the decision maker';
    const recommendedAction = riskLevel === 'low'
      ? 'On track — keep momentum with a scheduled next step.'
      : `Re-engage ${contactName}: send a follow-up and confirm timeline.`;

    const payload = { winProbability: prob, riskLevel, daysInStage, daysSinceActivity, reasons, recommendedAction };
    await this.saveInsight('opportunity', oppId, 'opportunity_risk', payload, prob / 100);
    return { ...payload, model: 'heuristic' };
  }

  // ---- at-risk follow-ups ----

  async followUps() {
    const organizationId = requireOrgId();
    const opps = await this.prisma.opportunity.findMany({
      where: { ...this.oppScope(), status: OpportunityStatus.OPEN },
      include: { account: { select: { name: true } }, primaryContact: { select: { firstName: true } } },
      orderBy: { amount: 'desc' }, take: 100,
    });
    if (opps.length === 0) return { atRisk: [] };

    const acts = await this.prisma.activity.findMany({
      where: { organizationId, relatedType: 'opportunity', relatedId: { in: opps.map((o) => o.id) }, deletedAt: null },
      select: { relatedId: true, createdAt: true }, orderBy: { createdAt: 'desc' },
    });
    const lastByOpp = new Map<string, Date>();
    for (const a of acts) if (!lastByOpp.has(a.relatedId)) lastByOpp.set(a.relatedId, a.createdAt);

    const now = Date.now();
    const atRisk = opps
      .map((o) => {
        const ref = lastByOpp.get(o.id) ?? o.createdAt;
        const days = Math.floor((now - new Date(ref).getTime()) / 86400000);
        return { o, days };
      })
      .filter((x) => x.days >= 7)
      .sort((a, b) => b.days - a.days)
      .slice(0, 10)
      .map((x) => ({
        id: x.o.id,
        name: x.o.name,
        account: x.o.account?.name ?? null,
        amount: toMajorString(x.o.amount, x.o.currency),
        daysSinceActivity: x.days,
        suggestedMessage: `Hi ${x.o.primaryContact?.firstName ?? 'there'}, following up on ${x.o.name}. Do you have time this week for a quick call to move things forward?`,
      }));
    return { atRisk };
  }

  // ---- executive briefing ----

  async briefing() {
    const now = new Date();
    const [newLeads, overdueFollowups, quotesPending, openInvoices, topOpps] = await Promise.all([
      this.prisma.lead.count({ where: { ...this.leadScope(), status: 'new' } }),
      this.prisma.activity.count({ where: { ...this.actScope(), status: 'open', dueDate: { lt: now } } }),
      this.prisma.quotation.count({ where: { ...this.oppScope(), status: 'for_approval' } }),
      this.prisma.invoice.findMany({ where: { ...this.oppScope(), status: { in: ['issued', 'sent', 'partially_paid'] } }, select: { total: true, amountPaid: true, dueDate: true } }),
      this.prisma.opportunity.findMany({ where: { ...this.oppScope(), status: OpportunityStatus.OPEN }, orderBy: { amount: 'desc' }, take: 3, include: { account: { select: { name: true } } } }),
    ]);

    let overdueAR = 0n;
    for (const inv of openInvoices) { const bal = inv.total - inv.amountPaid; if (inv.dueDate && inv.dueDate < now && bal > 0n) overdueAR += bal; }
    const openPipeline = topOpps.reduce((s, o) => s + o.amount, 0n);
    const weighted = topOpps.reduce((s, o) => s + mulRatio(o.amount, BigInt(o.probability), 100n), 0n);

    const items: string[] = [];
    if (newLeads > 0) items.push(`${newLeads} new lead${newLeads === 1 ? '' : 's'} to review`);
    if (overdueFollowups > 0) items.push(`${overdueFollowups} follow-up${overdueFollowups === 1 ? '' : 's'} overdue`);
    if (quotesPending > 0) items.push(`${quotesPending} quotation${quotesPending === 1 ? '' : 's'} awaiting approval`);
    if (overdueAR > 0n) items.push(`${toMajorString(overdueAR, 'PHP')} in overdue invoices`);

    const recommendation = topOpps.length
      ? `Prioritize ${topOpps.slice(0, 2).map((o) => o.account?.name ?? o.name).join(' and ')} today — combined value ${toMajorString(openPipeline, 'PHP')}.`
      : 'Focus on generating new opportunities — the pipeline is light.';

    const payload = {
      greeting: this.greeting(now),
      items,
      topOpportunities: topOpps.map((o) => ({ id: o.id, name: o.name, account: o.account?.name ?? null, amount: toMajorString(o.amount, o.currency) })),
      openPipelineTop3: toMajorString(openPipeline, 'PHP'),
      weightedTop3: toMajorString(weighted, 'PHP'),
      overdueAR: toMajorString(overdueAR, 'PHP'),
      recommendation,
    };
    await this.saveInsight('org', null, 'briefing', payload);
    return { ...payload, model: this.provider.name };
  }

  // ---- drafting ----

  async draft(kind: string, context: Record<string, unknown>) {
    const text = await this.safeText(() => this.provider.draft(kind, context))
      ?? (await this.heuristic.draft(kind, context));
    return { kind, text, model: this.provider.usesLlm ? this.provider.name : 'heuristic' };
  }

  async listInsights(subjectType: string, subjectId?: string) {
    const organizationId = requireOrgId();
    const where: any = { organizationId, subjectType };
    if (subjectId) where.subjectId = subjectId;
    const rows = await this.prisma.aiInsight.findMany({ where, orderBy: { createdAt: 'desc' }, take: 20 });
    return rows.map((r) => ({ id: r.id, kind: r.kind, payload: r.payload, model: r.model, confidence: r.confidence, status: r.status, createdAt: r.createdAt }));
  }

  // ---- helpers ----

  private leadRecommendation(classification: string, lead: any): string {
    switch (classification) {
      case 'HOT': return `High intent — schedule a discovery call with ${lead.contactPerson ?? lead.name} now.`;
      case 'WARM': return 'Good potential — send tailored info and propose a call this week.';
      case 'NURTURE': return 'Keep warm — add to a nurture sequence and revisit in a couple of weeks.';
      default: return 'Low priority — qualify further before investing time.';
    }
  }

  private greeting(now: Date): string {
    const h = now.getHours();
    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  }

  private async saveInsight(subjectType: string, subjectId: string | null, kind: string, payload: any, confidence?: number) {
    try {
      await this.prisma.aiInsight.create({
        data: { organizationId: requireOrgId(), subjectType, subjectId, kind, payload, model: this.provider.name, confidence: confidence ?? null, createdBy: currentUserId() },
      });
    } catch (err) { this.logger.error('Failed to persist AI insight', err as Error); }
  }

  private async safeText<T>(fn: () => Promise<T>): Promise<T | null> {
    try { return await fn(); } catch (err) { this.logger.warn(`AI provider failed, falling back: ${(err as Error).message}`); return null; }
  }

  private ownScoped(): boolean {
    if (isSuperAdmin()) return false;
    const roles = currentRoleKeys();
    return !BROAD.some((r) => roles.has(r)) && roles.has('sales_rep');
  }
  private leadScope() { const o = requireOrgId(); return this.ownScoped() ? { organizationId: o, deletedAt: null, assignedUserId: currentUserId() } : { organizationId: o, deletedAt: null }; }
  private oppScope() { const o = requireOrgId(); return this.ownScoped() ? { organizationId: o, deletedAt: null, ownerId: currentUserId() } : { organizationId: o, deletedAt: null }; }
  private actScope() { const o = requireOrgId(); return this.ownScoped() ? { organizationId: o, deletedAt: null, ownerId: currentUserId() } : { organizationId: o, deletedAt: null }; }
}
