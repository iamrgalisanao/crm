'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, ApiError } from '../../../lib/api';
import { formatMoney } from '../../../lib/format';
import { PAGE } from '../../../lib/ui';

interface Overview {
  winLoss: { won: number; lost: number; open: number; winRate: number; avgCycleDays: number; wonValue: string; lostValue: string };
  salespeople: { name: string; openCount: number; openValue: string; wonCount: number; wonValue: string; winRate: number }[];
  leadSources: { label: string; total: number; converted: number; conversionRate: number }[];
  lossReasons: { reason: string; count: number; value: string }[];
  quotationConversion: { byStatus: Record<string, number>; total: number; acceptedRate: number };
  arAging: { current: string; d1_30: string; d31_60: string; d60plus: string };
  revenueTrend: { month: string; value: string }[];
}

function num(v: string) { return parseFloat(v.replace(/,/g, '')) || 0; }

export default function ReportsPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (f: string, t: string) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (f) qs.set('from', new Date(f).toISOString());
      if (t) qs.set('to', new Date(t).toISOString());
      setData(await apiFetch<Overview>(`/reports/overview?${qs}`));
      setError(null);
    } catch (e) { setError((e as ApiError).message); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(from, to); /* eslint-disable-next-line */ }, []);

  if (loading && !data) return <div className={PAGE.wide}><div className="text-gray-400">Loading reports…</div></div>;
  if (error) return <div className={PAGE.wide}><div className="text-red-600">{error}</div></div>;
  if (!data) return null;

  const maxRev = Math.max(1, ...data.revenueTrend.map((m) => num(m.value)));

  return (
    <div className={PAGE.wide}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold text-gray-900">Reports</h1>
        <div className="flex items-end gap-2">
          <label className="text-xs text-gray-500">From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 block rounded-lg border border-gray-300 px-2 py-1.5 text-sm outline-none focus:border-brand-500" /></label>
          <label className="text-xs text-gray-500">To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 block rounded-lg border border-gray-300 px-2 py-1.5 text-sm outline-none focus:border-brand-500" /></label>
          <button onClick={() => load(from, to)} className="rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600">Apply</button>
          {(from || to) && <button onClick={() => { setFrom(''); setTo(''); load('', ''); }} className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">Clear</button>}
        </div>
      </div>

      {/* Win/loss */}
      <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Card label="Win rate" value={`${data.winLoss.winRate}%`} accent />
        <Card label="Won" value={`${data.winLoss.won} · ${formatMoney(data.winLoss.wonValue)}`} />
        <Card label="Lost" value={`${data.winLoss.lost} · ${formatMoney(data.winLoss.lostValue)}`} />
        <Card label="Open deals" value={String(data.winLoss.open)} />
        <Card label="Avg sales cycle" value={`${data.winLoss.avgCycleDays}d`} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Revenue trend */}
        <Panel title="Revenue won · last 6 months">
          <div className="flex h-40 items-end gap-2">
            {data.revenueTrend.map((m) => (
              <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex w-full flex-1 items-end">
                  <div className="w-full rounded-t bg-brand-500" style={{ height: `${(num(m.value) / maxRev) * 100}%`, minHeight: num(m.value) > 0 ? 4 : 0 }} title={formatMoney(m.value)} />
                </div>
                <span className="text-[11px] text-gray-400">{m.month}</span>
              </div>
            ))}
          </div>
        </Panel>

        {/* AR aging */}
        <Panel title="AR aging">
          <div className="space-y-2 text-sm">
            <AgingRow label="Current" value={data.arAging.current} color="bg-emerald-400" />
            <AgingRow label="1–30 days" value={data.arAging.d1_30} color="bg-amber-400" />
            <AgingRow label="31–60 days" value={data.arAging.d31_60} color="bg-orange-400" />
            <AgingRow label="60+ days" value={data.arAging.d60plus} color="bg-red-500" />
          </div>
        </Panel>

        {/* Salesperson performance */}
        <Panel title="Salesperson performance">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase text-gray-400"><th className="pb-2">Rep</th><th className="pb-2 text-right">Open</th><th className="pb-2 text-right">Won</th><th className="pb-2 text-right">Win %</th></tr></thead>
            <tbody>
              {data.salespeople.length === 0 && <tr><td colSpan={4} className="py-3 text-center text-gray-400">No data.</td></tr>}
              {data.salespeople.map((sp) => (
                <tr key={sp.name} className="border-t border-gray-100">
                  <td className="py-2 font-medium text-gray-800">{sp.name}</td>
                  <td className="py-2 text-right text-gray-600">{formatMoney(sp.openValue)}</td>
                  <td className="py-2 text-right text-gray-800">{formatMoney(sp.wonValue)}</td>
                  <td className="py-2 text-right text-gray-600">{sp.winRate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        {/* Lead source performance */}
        <Panel title="Lead source performance">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase text-gray-400"><th className="pb-2">Source</th><th className="pb-2 text-right">Leads</th><th className="pb-2 text-right">Converted</th><th className="pb-2 text-right">Rate</th></tr></thead>
            <tbody>
              {data.leadSources.length === 0 && <tr><td colSpan={4} className="py-3 text-center text-gray-400">No data.</td></tr>}
              {data.leadSources.map((ls) => (
                <tr key={ls.label} className="border-t border-gray-100">
                  <td className="py-2 font-medium text-gray-800">{ls.label}</td>
                  <td className="py-2 text-right text-gray-600">{ls.total}</td>
                  <td className="py-2 text-right text-gray-600">{ls.converted}</td>
                  <td className="py-2 text-right text-gray-800">{ls.conversionRate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        {/* Loss reasons */}
        <Panel title="Loss reasons">
          {data.lossReasons.length === 0 ? <p className="text-sm text-gray-400">No lost deals in this period.</p> : (
            <div className="space-y-2 text-sm">
              {data.lossReasons.map((lr) => (
                <div key={lr.reason} className="flex items-center justify-between border-b border-gray-100 pb-1.5">
                  <span className="text-gray-700">{lr.reason}</span>
                  <span className="text-gray-500">{lr.count} · {formatMoney(lr.value)}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        {/* Quotation conversion */}
        <Panel title="Quotation conversion">
          <div className="mb-3 flex items-baseline gap-2">
            <span className="text-2xl font-semibold text-brand-600">{data.quotationConversion.acceptedRate}%</span>
            <span className="text-sm text-gray-500">accepted (of decided) · {data.quotationConversion.total} total</span>
          </div>
          <div className="space-y-1.5 text-sm">
            {Object.entries(data.quotationConversion.byStatus).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between">
                <span className="capitalize text-gray-600">{k.replace(/_/g, ' ')}</span>
                <span className="text-gray-800">{v}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Card({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</div>
      <div className={`mt-1 text-lg font-semibold ${accent ? 'text-brand-600' : 'text-gray-900'}`}>{value}</div>
    </div>
  );
}
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="mb-3 text-sm font-semibold text-gray-700">{title}</h2>
      {children}
    </div>
  );
}
function AgingRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-gray-600"><span className={`inline-block h-2.5 w-2.5 rounded-full ${color}`} />{label}</span>
      <span className="font-medium text-gray-800">{formatMoney(value)}</span>
    </div>
  );
}
