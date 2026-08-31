import { Injectable } from '@nestjs/common';
import { toMajorString, OpportunityStatus } from '@crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import {
  requireOrgId,
  currentUserId,
  isSuperAdmin,
  currentRoleKeys,
} from '../common/context/request-context';

const BROAD = ['super_admin', 'admin', 'sales_manager', 'finance', 'approver', 'viewer'];
const OPEN_INVOICE = ['issued', 'sent', 'partially_paid'];

export interface ReportFilters {
  from?: string;
  to?: string;
  ownerId?: string;
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(filters: ReportFilters) {
    const organizationId = requireOrgId();
    const owner = this.effectiveOwner(filters.ownerId);
    const from = filters.from ? new Date(filters.from) : null;
    const to = filters.to ? new Date(filters.to) : null;
    const closedRange = this.range(from, to);

    const oppOwner = owner ? { ownerId: owner } : {};
    const leadOwner = owner ? { assignedUserId: owner } : {};
    const base = { organizationId, deletedAt: null };

    const [
      wonOpps, lostOpps, openCount,
      salesByOwnerWon, salesByOwnerOpen, salesByOwnerLost,
      users,
      leadGroups, leadConvertedGroups,
      lossGroups,
      quoteGroups,
      openInvoices,
    ] = await Promise.all([
      this.prisma.opportunity.findMany({ where: { ...base, ...oppOwner, status: OpportunityStatus.WON, ...(closedRange ? { closedAt: closedRange } : {}) }, select: { amount: true, createdAt: true, closedAt: true, ownerId: true } }),
      this.prisma.opportunity.findMany({ where: { ...base, ...oppOwner, status: OpportunityStatus.LOST, ...(closedRange ? { closedAt: closedRange } : {}) }, select: { amount: true, lostReason: true, ownerId: true } }),
      this.prisma.opportunity.count({ where: { ...base, ...oppOwner, status: OpportunityStatus.OPEN } }),
      this.prisma.opportunity.groupBy({ by: ['ownerId'], where: { ...base, ...oppOwner, status: OpportunityStatus.WON, ...(closedRange ? { closedAt: closedRange } : {}) }, _count: { _all: true }, _sum: { amount: true } }),
      this.prisma.opportunity.groupBy({ by: ['ownerId'], where: { ...base, ...oppOwner, status: OpportunityStatus.OPEN }, _count: { _all: true }, _sum: { amount: true } }),
      this.prisma.opportunity.groupBy({ by: ['ownerId'], where: { ...base, ...oppOwner, status: OpportunityStatus.LOST, ...(closedRange ? { closedAt: closedRange } : {}) }, _count: { _all: true } }),
      this.prisma.user.findMany({ where: { organizationId, deletedAt: null }, select: { id: true, firstName: true, lastName: true } }),
      this.prisma.lead.groupBy({ by: ['sourceId'], where: { ...base, ...leadOwner, ...(from || to ? { createdAt: this.range(from, to)! } : {}) }, _count: { _all: true } }),
      this.prisma.lead.groupBy({ by: ['sourceId'], where: { ...base, ...leadOwner, status: 'converted', ...(from || to ? { createdAt: this.range(from, to)! } : {}) }, _count: { _all: true } }),
      this.prisma.opportunity.groupBy({ by: ['lostReason'], where: { ...base, ...oppOwner, status: OpportunityStatus.LOST, ...(closedRange ? { closedAt: closedRange } : {}) }, _count: { _all: true }, _sum: { amount: true } }),
      this.prisma.quotation.groupBy({ by: ['status'], where: { ...base, ...oppOwner, ...(from || to ? { createdAt: this.range(from, to)! } : {}) }, _count: { _all: true } }),
      this.prisma.invoice.findMany({ where: { ...base, ...oppOwner, status: { in: OPEN_INVOICE } }, select: { total: true, amountPaid: true, dueDate: true } }),
    ]);

    // Win/loss + avg sales cycle.
    const wonValue = wonOpps.reduce((s, o) => s + o.amount, 0n);
    const lostValue = lostOpps.reduce((s, o) => s + o.amount, 0n);
    const winRate = wonOpps.length + lostOpps.length > 0
      ? Math.round((wonOpps.length / (wonOpps.length + lostOpps.length)) * 100)
      : 0;
    const cycles = wonOpps
      .filter((o) => o.closedAt)
      .map((o) => (new Date(o.closedAt!).getTime() - new Date(o.createdAt).getTime()) / 86400000);
    const avgCycleDays = cycles.length ? Math.round(cycles.reduce((a, b) => a + b, 0) / cycles.length) : 0;

    // Salesperson performance.
    const userName = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));
    const wonMap = new Map(salesByOwnerWon.map((r) => [r.ownerId, { count: r._count._all, sum: r._sum.amount ?? 0n }]));
    const openMap = new Map(salesByOwnerOpen.map((r) => [r.ownerId, { count: r._count._all, sum: r._sum.amount ?? 0n }]));
    const lostMap = new Map(salesByOwnerLost.map((r) => [r.ownerId, r._count._all]));
    const ownerIds = new Set<string>([...wonMap.keys(), ...openMap.keys(), ...lostMap.keys()].filter(Boolean) as string[]);
    const salespeople = [...ownerIds].map((id) => {
      const won = wonMap.get(id) ?? { count: 0, sum: 0n };
      const open = openMap.get(id) ?? { count: 0, sum: 0n };
      const lost = lostMap.get(id) ?? 0;
      const wr = won.count + lost > 0 ? Math.round((won.count / (won.count + lost)) * 100) : 0;
      return {
        name: userName.get(id) ?? 'Unknown',
        openCount: open.count, openValue: toMajorString(open.sum, 'PHP'),
        wonCount: won.count, wonValue: toMajorString(won.sum, 'PHP'),
        winRate: wr,
      };
    }).sort((a, b) => parseFloat(b.wonValue.replace(/,/g, '')) - parseFloat(a.wonValue.replace(/,/g, '')));

    // Lead source performance.
    const convertedBySource = new Map(leadConvertedGroups.map((g) => [g.sourceId ?? 'none', g._count._all]));
    const sourceIds = leadGroups.map((g) => g.sourceId).filter(Boolean) as string[];
    const sources = sourceIds.length ? await this.prisma.leadSource.findMany({ where: { id: { in: sourceIds } }, select: { id: true, label: true } }) : [];
    const sourceLabel = new Map(sources.map((s) => [s.id, s.label]));
    const leadSources = leadGroups.map((g) => {
      const total = g._count._all;
      const converted = convertedBySource.get(g.sourceId ?? 'none') ?? 0;
      return {
        label: g.sourceId ? sourceLabel.get(g.sourceId) ?? 'Unknown' : 'Unspecified',
        total, converted,
        conversionRate: total > 0 ? Math.round((converted / total) * 100) : 0,
      };
    }).sort((a, b) => b.total - a.total);

    // Loss reasons.
    const lossReasons = lossGroups.map((g) => ({
      reason: g.lostReason ?? 'Unspecified',
      count: g._count._all,
      value: toMajorString(g._sum.amount ?? 0n, 'PHP'),
    })).sort((a, b) => b.count - a.count);

    // Quotation conversion.
    const quoteCounts: Record<string, number> = {};
    let quoteTotal = 0;
    for (const g of quoteGroups) { quoteCounts[g.status] = g._count._all; quoteTotal += g._count._all; }
    const accepted = quoteCounts['accepted'] ?? 0;
    const decided = (quoteCounts['accepted'] ?? 0) + (quoteCounts['rejected'] ?? 0) + (quoteCounts['expired'] ?? 0);
    const quotationConversion = {
      byStatus: quoteCounts,
      total: quoteTotal,
      acceptedRate: decided > 0 ? Math.round((accepted / decided) * 100) : 0,
    };

    // AR aging buckets.
    const now = new Date();
    const buckets = { current: 0n, d1_30: 0n, d31_60: 0n, d60plus: 0n };
    for (const inv of openInvoices) {
      const bal = inv.total - inv.amountPaid;
      if (bal <= 0n) continue;
      if (!inv.dueDate || inv.dueDate >= now) { buckets.current += bal; continue; }
      const daysOver = Math.floor((now.getTime() - inv.dueDate.getTime()) / 86400000);
      if (daysOver <= 30) buckets.d1_30 += bal;
      else if (daysOver <= 60) buckets.d31_60 += bal;
      else buckets.d60plus += bal;
    }
    const arAging = {
      current: toMajorString(buckets.current, 'PHP'),
      d1_30: toMajorString(buckets.d1_30, 'PHP'),
      d31_60: toMajorString(buckets.d31_60, 'PHP'),
      d60plus: toMajorString(buckets.d60plus, 'PHP'),
    };

    // Revenue trend (last 6 months by closedAt, ignores date filter for the trend axis).
    const revenueTrend = await this.revenueTrend(organizationId, oppOwner);

    return {
      scope: owner === currentUserId() && this.ownScoped() ? 'own' : 'organization',
      winLoss: {
        won: wonOpps.length, lost: lostOpps.length, open: openCount, winRate, avgCycleDays,
        wonValue: toMajorString(wonValue, 'PHP'), lostValue: toMajorString(lostValue, 'PHP'),
      },
      salespeople,
      leadSources,
      lossReasons,
      quotationConversion,
      arAging,
      revenueTrend,
    };
  }

  private async revenueTrend(organizationId: string, oppOwner: Record<string, unknown>) {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const won = await this.prisma.opportunity.findMany({
      where: { organizationId, deletedAt: null, ...oppOwner, status: OpportunityStatus.WON, closedAt: { gte: start } },
      select: { amount: true, closedAt: true },
    });
    const months: { key: string; label: string; sum: bigint }[] = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
      months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleString('en', { month: 'short' }), sum: 0n });
    }
    const idx = new Map(months.map((m, i) => [m.key, i]));
    for (const o of won) {
      if (!o.closedAt) continue;
      const d = new Date(o.closedAt);
      const i = idx.get(`${d.getFullYear()}-${d.getMonth()}`);
      if (i != null) months[i].sum += o.amount;
    }
    return months.map((m) => ({ month: m.label, value: toMajorString(m.sum, 'PHP') }));
  }

  private range(from: Date | null, to: Date | null): { gte?: Date; lte?: Date } | null {
    if (!from && !to) return null;
    const r: { gte?: Date; lte?: Date } = {};
    if (from) r.gte = from;
    if (to) r.lte = to;
    return r;
  }

  private effectiveOwner(requested?: string): string | null {
    if (this.ownScoped()) return currentUserId();
    return requested ?? null;
  }

  private ownScoped(): boolean {
    if (isSuperAdmin()) return false;
    const roles = currentRoleKeys();
    return !BROAD.some((r) => roles.has(r)) && roles.has('sales_rep');
  }
}
