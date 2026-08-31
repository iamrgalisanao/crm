import { Injectable } from '@nestjs/common';
import { toMajorString, mulRatio, OpportunityStatus, InvoiceStatus } from '@crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { requireOrgId, currentUserId, isSuperAdmin, currentRoleKeys } from '../common/context/request-context';

const OPEN_INVOICE = [InvoiceStatus.ISSUED, InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID];
const BROAD = ['super_admin', 'admin', 'sales_manager', 'finance', 'approver', 'viewer'];

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary() {
    const organizationId = requireOrgId();
    const uid = currentUserId();
    const ownScoped = this.ownScoped();
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Per-entity scope fragments (reps see only what they own).
    const leadWhere: any = { organizationId, deletedAt: null, ...(ownScoped ? { assignedUserId: uid } : {}) };
    const oppWhere: any = { organizationId, deletedAt: null, ...(ownScoped ? { ownerId: uid } : {}) };
    const quoteWhere: any = { organizationId, deletedAt: null, ...(ownScoped ? { ownerId: uid } : {}) };
    const invWhere: any = { organizationId, deletedAt: null, ...(ownScoped ? { ownerId: uid } : {}) };
    const actWhere: any = { organizationId, deletedAt: null, ...(ownScoped ? { ownerId: uid } : {}) };
    const payWhere: any = { organizationId, status: 'recorded', ...(ownScoped ? { invoice: { ownerId: uid } } : {}) };

    const [
      leadsTotal, leadsNew, leadsQualified,
      oppsOpen, oppsOpenList, oppsWon,
      quotationsPending,
      openInvoices,
      paymentsMonth,
      overdueFollowups, upcomingFollowups,
      funnelStages, funnelOpps,
      leadSourceGroups,
    ] = await Promise.all([
      this.prisma.lead.count({ where: leadWhere }),
      this.prisma.lead.count({ where: { ...leadWhere, status: 'new' } }),
      this.prisma.lead.count({ where: { ...leadWhere, status: 'qualified' } }),
      this.prisma.opportunity.count({ where: { ...oppWhere, status: OpportunityStatus.OPEN } }),
      this.prisma.opportunity.findMany({ where: { ...oppWhere, status: OpportunityStatus.OPEN }, select: { amount: true, probability: true, stageId: true } }),
      this.prisma.opportunity.findMany({ where: { ...oppWhere, status: OpportunityStatus.WON, closedAt: { gte: monthStart } }, select: { amount: true } }),
      this.prisma.quotation.count({ where: { ...quoteWhere, status: 'for_approval' } }),
      this.prisma.invoice.findMany({ where: { ...invWhere, status: { in: OPEN_INVOICE } }, select: { total: true, amountPaid: true, dueDate: true } }),
      this.prisma.payment.findMany({ where: { ...payWhere, paymentDate: { gte: monthStart } }, select: { amount: true } }),
      this.prisma.activity.count({ where: { ...actWhere, status: 'open', dueDate: { lt: now } } }),
      this.prisma.activity.count({ where: { ...actWhere, status: 'open', dueDate: { gte: now, lt: new Date(now.getTime() + 7 * 86400000) } } }),
      this.prisma.pipelineStage.findMany({ where: { organizationId, type: 'open' }, orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } }),
      this.prisma.opportunity.groupBy({ by: ['stageId'], where: { ...oppWhere, status: OpportunityStatus.OPEN }, _count: { _all: true }, _sum: { amount: true } }),
      this.prisma.lead.groupBy({ by: ['sourceId'], where: leadWhere, _count: { _all: true } }),
    ]);

    // Pipeline value + weighted (bigint sums).
    let pipelineValue = 0n;
    let weightedPipeline = 0n;
    for (const o of oppsOpenList) {
      pipelineValue += o.amount;
      weightedPipeline += mulRatio(o.amount, BigInt(o.probability), 100n);
    }
    const revenueWonMonth = oppsWon.reduce((s, o) => s + o.amount, 0n);

    // AR.
    let outstanding = 0n, overdueAmount = 0n, overdueCount = 0;
    for (const inv of openInvoices) {
      const bal = inv.total - inv.amountPaid;
      outstanding += bal;
      if (inv.dueDate && inv.dueDate < now && bal > 0n) { overdueAmount += bal; overdueCount++; }
    }
    const paymentsReceivedMonth = paymentsMonth.reduce((s, p) => s + p.amount, 0n);

    // Funnel by stage.
    const funnelMap = new Map(funnelOpps.map((f) => [f.stageId, { count: f._count._all, sum: f._sum.amount ?? 0n }]));
    const funnel = funnelStages.map((st) => {
      const d = funnelMap.get(st.id);
      return { stageId: st.id, name: st.name, count: d?.count ?? 0, value: toMajorString(d?.sum ?? 0n, 'PHP') };
    });

    // Lead source breakdown (resolve labels).
    const sourceIds = leadSourceGroups.map((g) => g.sourceId).filter(Boolean) as string[];
    const sources = sourceIds.length ? await this.prisma.leadSource.findMany({ where: { id: { in: sourceIds } }, select: { id: true, label: true } }) : [];
    const sourceLabel = new Map(sources.map((s) => [s.id, s.label]));
    const leadSources = leadSourceGroups
      .map((g) => ({ label: g.sourceId ? sourceLabel.get(g.sourceId) ?? 'Unknown' : 'Unspecified', count: g._count._all }))
      .sort((a, b) => b.count - a.count);

    return {
      scope: ownScoped ? 'own' : 'organization',
      leads: { total: leadsTotal, new: leadsNew, qualified: leadsQualified },
      opportunities: {
        open: oppsOpen,
        wonThisMonth: oppsWon.length,
        pipelineValue: toMajorString(pipelineValue, 'PHP'),
        weightedPipeline: toMajorString(weightedPipeline, 'PHP'),
        revenueWonThisMonth: toMajorString(revenueWonMonth, 'PHP'),
      },
      quotations: { pendingApproval: quotationsPending },
      ar: {
        outstanding: toMajorString(outstanding, 'PHP'),
        overdueAmount: toMajorString(overdueAmount, 'PHP'),
        overdueCount,
        openCount: openInvoices.length,
      },
      payments: { receivedThisMonth: toMajorString(paymentsReceivedMonth, 'PHP') },
      activities: { overdue: overdueFollowups, upcoming: upcomingFollowups },
      winLoss: await this.winRate(oppWhere),
      revenueTrend: await this.revenueTrend(oppWhere),
      funnel,
      leadSources,
    };
  }

  /** Win rate (won vs decided) for the performance gauge. */
  private async winRate(oppWhere: any) {
    const [won, lost] = await Promise.all([
      this.prisma.opportunity.count({ where: { ...oppWhere, status: OpportunityStatus.WON } }),
      this.prisma.opportunity.count({ where: { ...oppWhere, status: OpportunityStatus.LOST } }),
    ]);
    const rate = won + lost > 0 ? Math.round((won / (won + lost)) * 100) : 0;
    return { won, lost, winRate: rate };
  }

  /** Won revenue by month, last 6 months, for the dashboard bar chart. */
  private async revenueTrend(oppWhere: any) {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const rows = await this.prisma.opportunity.findMany({
      where: { ...oppWhere, status: OpportunityStatus.WON, closedAt: { gte: start } },
      select: { amount: true, closedAt: true },
    });
    const months: { key: string; label: string; sum: bigint }[] = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
      months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleString('en', { month: 'short' }), sum: 0n });
    }
    const idx = new Map(months.map((m, i) => [m.key, i]));
    for (const o of rows) {
      if (!o.closedAt) continue;
      const d = new Date(o.closedAt);
      const i = idx.get(`${d.getFullYear()}-${d.getMonth()}`);
      if (i != null) months[i].sum += o.amount;
    }
    return months.map((m) => ({ month: m.label, value: toMajorString(m.sum, 'PHP') }));
  }

  private ownScoped(): boolean {
    if (isSuperAdmin()) return false;
    const roles = currentRoleKeys();
    const hasBroad = BROAD.some((r) => roles.has(r));
    return !hasBroad && roles.has('sales_rep');
  }
}
