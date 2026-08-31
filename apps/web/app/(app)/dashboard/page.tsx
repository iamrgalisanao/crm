'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch, ApiError } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { formatMoney } from '../../../lib/format';
import { PAGE } from '../../../lib/ui';
import { BriefingCard } from '../../../components/ai-panels';

interface Summary {
  scope: string;
  leads: { total: number; new: number; qualified: number };
  opportunities: { open: number; wonThisMonth: number; pipelineValue: string; weightedPipeline: string; revenueWonThisMonth: string };
  quotations: { pendingApproval: number };
  ar: { outstanding: string; overdueAmount: string; overdueCount: number; openCount: number };
  payments: { receivedThisMonth: string };
  activities: { overdue: number; upcoming: number };
  funnel: { stageId: string; name: string; count: number; value: string }[];
  leadSources: { label: string; count: number }[];
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [s, setS] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<Summary>('/dashboard/summary')
      .then(setS).catch((e: ApiError) => setError(e.message)).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className={PAGE.wide}><div className="text-gray-400">Loading dashboard…</div></div>;
  if (error) return <div className={PAGE.wide}><div className="text-red-600">{error}</div></div>;
  if (!s) return null;

  const maxFunnel = Math.max(1, ...s.funnel.map((f) => f.count));
  const maxSource = Math.max(1, ...s.leadSources.map((x) => x.count));

  return (
    <div className={PAGE.wide}>
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">
            {s.scope === 'own' ? 'Your pipeline' : 'Company-wide'} · this month
          </p>
        </div>
        {user?.isSuperAdmin && <span className="text-xs text-gray-400">super admin</span>}
      </div>

      <div className="mt-5"><BriefingCard /></div>

      {/* Primary KPIs */}
      <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi href="/leads" label="Total Leads" value={String(s.leads.total)} sub={`${s.leads.qualified} qualified`} />
        <Kpi href="/opportunities" label="Open Opportunities" value={String(s.opportunities.open)} sub={formatMoney(s.opportunities.pipelineValue)} />
        <Kpi href="/opportunities/pipeline" label="Weighted Pipeline" value={formatMoney(s.opportunities.weightedPipeline)} sub="expected value" accent />
        <Kpi href="/opportunities" label="Revenue Won" value={formatMoney(s.opportunities.revenueWonThisMonth)} sub={`${s.opportunities.wonThisMonth} deals this month`} accent />
        <Kpi href="/quotations" label="Quotes Awaiting Approval" value={String(s.quotations.pendingApproval)} sub="need a decision" alert={s.quotations.pendingApproval > 0} />
        <Kpi href="/invoices" label="Outstanding AR" value={formatMoney(s.ar.outstanding)} sub={`${s.ar.openCount} open invoices`} />
        <Kpi href="/invoices" label="Overdue AR" value={formatMoney(s.ar.overdueAmount)} sub={`${s.ar.overdueCount} invoices`} alert={s.ar.overdueCount > 0} />
        <Kpi href="/payments" label="Payments Received" value={formatMoney(s.payments.receivedThisMonth)} sub="this month" accent />
      </div>

      {/* Needs attention */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Attention href="/activities" label="Overdue follow-ups" count={s.activities.overdue} good="You're all caught up" />
        <Attention href="/activities" label="Upcoming (7 days)" count={s.activities.upcoming} good="Nothing scheduled" neutral />
        <Attention href="/quotations" label="Quotes pending approval" count={s.quotations.pendingApproval} good="No approvals waiting" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Funnel */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-gray-700">Sales funnel <span className="font-normal text-gray-400">· open opportunities</span></h2>
          <div className="mt-4 space-y-3">
            {s.funnel.map((f) => (
              <Link key={f.stageId} href="/opportunities/pipeline" className="block">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">{f.name}</span>
                  <span className="text-gray-500">{f.count} · {formatMoney(f.value)}</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100">
                  <div className="h-full rounded-full bg-gradient-to-r from-gold-300 to-gold-500" style={{ width: `${(f.count / maxFunnel) * 100}%` }} />
                </div>
              </Link>
            ))}
            {s.funnel.every((f) => f.count === 0) && <p className="text-sm text-gray-400">No open opportunities yet.</p>}
          </div>
        </div>

        {/* Lead sources */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-gray-700">Lead sources</h2>
          <div className="mt-4 space-y-3">
            {s.leadSources.length === 0 && <p className="text-sm text-gray-400">No leads yet.</p>}
            {s.leadSources.map((src) => (
              <div key={src.label}>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">{src.label}</span>
                  <span className="text-gray-500">{src.count}</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100">
                  <div className="h-full rounded-full bg-brand-400" style={{ width: `${(src.count / maxSource) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Kpi({ href, label, value, sub, accent, alert }: { href: string; label: string; value: string; sub: string; accent?: boolean; alert?: boolean }) {
  return (
    <Link href={href} className="group rounded-xl border border-gray-200 bg-white p-4 transition hover:border-brand-300 hover:shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</div>
      <div className={`mt-2 text-2xl font-semibold ${alert ? 'text-red-600' : accent ? 'text-gold-600' : 'text-gray-900'}`}>{value}</div>
      <div className="mt-1 text-xs text-gray-400">{sub}</div>
    </Link>
  );
}

function Attention({ href, label, count, good, neutral }: { href: string; label: string; count: number; good: string; neutral?: boolean }) {
  const active = count > 0;
  const color = neutral ? 'text-gray-700' : active ? 'text-amber-700' : 'text-emerald-700';
  const bg = neutral ? 'bg-white' : active ? 'bg-amber-50' : 'bg-emerald-50';
  return (
    <Link href={href} className={`flex items-center justify-between rounded-xl border border-gray-200 ${bg} p-4 transition hover:shadow-sm`}>
      <div>
        <div className="text-sm font-medium text-gray-700">{label}</div>
        <div className="text-xs text-gray-400">{active ? 'tap to review' : good}</div>
      </div>
      <div className={`text-2xl font-semibold ${color}`}>{count}</div>
    </Link>
  );
}
