'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch, ApiError } from '../../../lib/api';
import { formatMoney, formatDate } from '../../../lib/format';
import { PAGE } from '../../../lib/ui';

interface Summary {
  leads: { total: number; new: number; qualified: number };
  opportunities: { open: number; wonThisMonth: number; pipelineValue: string; weightedPipeline: string; revenueWonThisMonth: string };
  quotations: { pendingApproval: number };
  ar: { outstanding: string; overdueAmount: string; overdueCount: number; openCount: number };
  payments: { receivedThisMonth: string };
  activities: { overdue: number; upcoming: number };
  winLoss: { won: number; lost: number; winRate: number };
  revenueTrend: { month: string; value: string }[];
}
interface Opp { id: string; name: string; account: { name: string } | null; owner: { name: string } | null; amount: string; currency: string; expectedCloseDate: string | null; stage: { name: string } | null; status: string }
interface Act { id: string; type: string; subject: string; relatedType: string; relatedId: string; relatedLabel: string | null; dueDate: string | null; priority: string; isOverdue: boolean }

const num = (v: string) => parseFloat(v.replace(/,/g, '')) || 0;
const initials = (s?: string | null) => (s ?? '?').split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const AVATAR = ['bg-rose-100 text-rose-700', 'bg-sky-100 text-sky-700', 'bg-emerald-100 text-emerald-700', 'bg-violet-100 text-violet-700', 'bg-amber-100 text-amber-700'];

export default function DashboardPage() {
  const [s, setS] = useState<Summary | null>(null);
  const [deals, setDeals] = useState<Opp[]>([]);
  const [tasks, setTasks] = useState<Act[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [sum, opps, acts] = await Promise.all([
          apiFetch<Summary>('/dashboard/summary'),
          apiFetch<{ data: Opp[] }>('/opportunities?status=open&limit=5').catch(() => ({ data: [] })),
          apiFetch<{ data: Act[] }>('/activities?filter=open&limit=5').catch(() => ({ data: [] })),
        ]);
        setS(sum); setDeals(opps.data); setTasks(acts.data); setError(null);
      } catch (e) { setError((e as ApiError).message); } finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <div className={PAGE.wide}><div className="text-gray-400">Loading dashboard…</div></div>;
  if (error) return <div className={PAGE.wide}><div className="text-red-600">{error}</div></div>;
  if (!s) return null;

  const maxRev = Math.max(1, ...s.revenueTrend.map((m) => num(m.value)));

  return (
    <div className={PAGE.wide}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Dashboard</h1>
        <div className="flex items-center gap-2">
          <span className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600">This month</span>
          <Link href="/leads" className="rounded-lg bg-gradient-to-br from-gold-300 to-gold-500 px-3.5 py-2 text-sm font-semibold text-brand-900 shadow-sm transition hover:from-gold-400 hover:to-gold-600">+ New lead</Link>
        </div>
      </div>

      {/* KPI row */}
      <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <Kpi icon={<IconUsers />} label="Total Leads" value={String(s.leads.total)} pill={{ text: `${s.leads.qualified} qualified`, tone: 'neutral' }} href="/leads" />
        <Kpi icon={<IconDeal />} label="Open Deals" value={String(s.opportunities.open)} pill={{ text: formatMoney(s.opportunities.pipelineValue), tone: 'neutral' }} href="/opportunities" />
        <Kpi icon={<IconTrend />} label="Weighted Pipeline" value={formatMoney(s.opportunities.weightedPipeline)} accent pill={{ text: 'expected', tone: 'neutral' }} href="/opportunities/pipeline" />
        <Kpi icon={<IconMoney />} label="Revenue Won" value={formatMoney(s.opportunities.revenueWonThisMonth)} pill={{ text: `${s.opportunities.wonThisMonth} deals`, tone: 'up' }} href="/opportunities" />
        <Kpi icon={<IconAlert />} label="Overdue AR" value={formatMoney(s.ar.overdueAmount)} pill={{ text: `${s.ar.overdueCount} invoices`, tone: s.ar.overdueCount > 0 ? 'down' : 'neutral' }} href="/invoices" />
      </div>

      {/* Row 2: revenue chart + performance gauge */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHead title="Revenue &amp; collections" href="/reports" />
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Mini label="Revenue won" value={formatMoney(s.opportunities.revenueWonThisMonth)} tone="up" icon={<IconMoney />} />
            <Mini label="Outstanding AR" value={formatMoney(s.ar.outstanding)} tone="down" icon={<IconWallet />} />
          </div>
          {/* Bar chart: won revenue, last 6 months */}
          <div className="mt-5 flex h-44 items-end gap-3">
            {s.revenueTrend.map((m) => (
              <div key={m.month} className="flex flex-1 flex-col items-center gap-1.5">
                <div className="flex w-full flex-1 items-end">
                  <div className="w-full rounded-t-md bg-gradient-to-t from-gold-400 to-gold-300 transition-all" style={{ height: `${Math.max(2, (num(m.value) / maxRev) * 100)}%` }} title={formatMoney(m.value)} />
                </div>
                <span className="text-[11px] text-gray-400">{m.month}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHead title="Your performance" href="/reports" />
          <Gauge percent={s.winLoss.winRate} label="Win rate" />
          <div className="mt-4 space-y-2.5">
            <Check done={s.activities.overdue === 0} label={`Follow-ups overdue (${s.activities.overdue})`} />
            <Check done={s.quotations.pendingApproval === 0} label={`Quotes awaiting approval (${s.quotations.pendingApproval})`} />
            <Check done={s.ar.overdueCount === 0} label={`Overdue invoices (${s.ar.overdueCount})`} />
          </div>
        </Card>
      </div>

      {/* Row 3: active deals + pending tasks */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHead title="Active deals" href="/opportunities" />
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-400">
                  <th className="pb-2 font-medium">Account</th>
                  <th className="pb-2 font-medium">Opportunity</th>
                  <th className="pb-2 font-medium">Close</th>
                  <th className="pb-2 font-medium text-right">Amount</th>
                  <th className="pb-2 font-medium">Stage</th>
                </tr>
              </thead>
              <tbody>
                {deals.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-gray-400">No open deals.</td></tr>}
                {deals.map((d, i) => (
                  <tr key={d.id} className="border-t border-gray-100">
                    <td className="py-2.5">
                      <Link href={`/opportunities/${d.id}`} className="flex items-center gap-2">
                        <span className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${AVATAR[i % AVATAR.length]}`}>{initials(d.account?.name)}</span>
                        <span>
                          <span className="block font-medium text-gray-900">{d.account?.name ?? '—'}</span>
                          <span className="block text-xs text-gray-400">{d.owner?.name ?? ''}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="py-2.5 text-gray-600">{d.name}</td>
                    <td className="py-2.5 text-gray-500">{formatDate(d.expectedCloseDate)}</td>
                    <td className="py-2.5 text-right font-medium text-gray-800">{formatMoney(d.amount, d.currency)}</td>
                    <td className="py-2.5"><span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-700">{d.stage?.name ?? d.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHead title="Pending tasks" href="/activities" />
          <div className="mt-2 divide-y divide-gray-100">
            {tasks.length === 0 && <p className="py-6 text-center text-sm text-gray-400">Nothing pending.</p>}
            {tasks.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-gray-900">{t.subject}</div>
                  <div className="truncate text-xs text-gray-400">
                    {t.relatedLabel ?? t.relatedType} · {t.dueDate ? formatDate(t.dueDate) : 'no date'}
                    {t.isOverdue && <span className="ml-1 text-red-500">overdue</span>}
                  </div>
                </div>
                <PriorityTag priority={t.priority} />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ---------- pieces ---------- */

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-gray-200 bg-white p-5 shadow-sm ${className}`}>{children}</div>;
}
function CardHead({ title, href }: { title: string; href: string }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-sm font-semibold text-gray-800" dangerouslySetInnerHTML={{ __html: title }} />
      <Link href={href} className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50">View all →</Link>
    </div>
  );
}

function Kpi({ icon, label, value, pill, accent, href }: { icon: React.ReactNode; label: string; value: string; pill: { text: string; tone: 'up' | 'down' | 'neutral' }; accent?: boolean; href: string }) {
  const tone = pill.tone === 'up' ? 'bg-emerald-50 text-emerald-700' : pill.tone === 'down' ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-500';
  const arrow = pill.tone === 'up' ? '↑ ' : pill.tone === 'down' ? '↓ ' : '';
  return (
    <Link href={href} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-gold-300 hover:shadow">
      <div className="flex items-center gap-2 text-gray-500">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-gray-500">{icon}</span>
        <span className="text-sm">{label}</span>
      </div>
      <div className="mt-3 flex items-end gap-2">
        <span className={`text-3xl font-bold tracking-tight ${accent ? 'text-gold-600' : 'text-gray-900'}`}>{value}</span>
      </div>
      <span className={`mt-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>{arrow}{pill.text}</span>
    </Link>
  );
}

function Mini({ label, value, tone, icon }: { label: string; value: string; tone: 'up' | 'down'; icon: React.ReactNode }) {
  const t = tone === 'up' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600';
  return (
    <div className="rounded-xl border border-gray-200 p-3">
      <div className="flex items-center gap-2 text-xs text-gray-500"><span className={`flex h-6 w-6 items-center justify-center rounded-md ${t}`}>{icon}</span>{label}</div>
      <div className="mt-1.5 text-xl font-semibold text-gray-900">{value}</div>
    </div>
  );
}

function Gauge({ percent, label }: { percent: number; label: string }) {
  const R = 70;
  const LEN = Math.PI * R; // semicircle length
  const dash = Math.max(0, Math.min(1, percent / 100)) * LEN;
  return (
    <div className="mt-4 flex flex-col items-center">
      <svg viewBox="0 0 180 100" className="w-full max-w-[220px]">
        <defs>
          <linearGradient id="gaugeg" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#22c55e" />
            <stop offset="55%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#EAB02E" />
          </linearGradient>
        </defs>
        <path d="M20,90 A70,70 0 0 1 160,90" fill="none" stroke="#eceae3" strokeWidth="14" strokeLinecap="round" />
        <path d="M20,90 A70,70 0 0 1 160,90" fill="none" stroke="url(#gaugeg)" strokeWidth="14" strokeLinecap="round" strokeDasharray={`${dash} ${LEN}`} />
        <text x="90" y="78" textAnchor="middle" className="fill-gray-900" style={{ fontSize: 26, fontWeight: 700 }}>{percent}%</text>
        <text x="90" y="94" textAnchor="middle" className="fill-gray-400" style={{ fontSize: 10 }}>{label}</text>
      </svg>
    </div>
  );
}

function Check({ done, label }: { done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${done ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{done ? '✓' : '!'}</span>
      <span className="text-gray-600">{label}</span>
    </div>
  );
}

function PriorityTag({ priority }: { priority: string }) {
  const map: Record<string, [string, string]> = {
    urgent: ['High', 'bg-red-50 text-red-600'], high: ['High', 'bg-red-50 text-red-600'],
    medium: ['Medium', 'bg-amber-50 text-amber-700'], low: ['Low', 'bg-emerald-50 text-emerald-700'],
  };
  const [text, cls] = map[priority] ?? ['—', 'bg-gray-100 text-gray-500'];
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{text}</span>;
}

/* ---------- icons ---------- */
const sv = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const IconUsers = () => <svg {...sv}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
const IconDeal = () => <svg {...sv}><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>;
const IconTrend = () => <svg {...sv}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>;
const IconMoney = () => <svg {...sv}><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>;
const IconWallet = () => <svg {...sv}><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" /><path d="M3 5v14a2 2 0 0 0 2 2h16v-5" /><path d="M18 12a2 2 0 0 0 0 4h4v-4z" /></svg>;
const IconAlert = () => <svg {...sv}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>;
