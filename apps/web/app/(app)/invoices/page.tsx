'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch, ApiError } from '../../../lib/api';
import { formatMoney, formatDate } from '../../../lib/format';
import { PAGE } from '../../../lib/ui';

interface Invoice {
  id: string; invoiceNo: string; account: { id: string; name: string } | null;
  issueDate: string; dueDate: string | null; status: string; paymentStatus: string;
  isOverdue: boolean; currency: string; total: string; outstanding: string;
}
interface Summary { outstanding: string; overdueAmount: string; overdueCount: number; openCount: number }

const STATUS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700', issued: 'bg-blue-50 text-blue-700', sent: 'bg-indigo-50 text-indigo-700',
  partially_paid: 'bg-amber-50 text-amber-700', paid: 'bg-emerald-100 text-emerald-800',
  overdue: 'bg-red-50 text-red-700', void: 'bg-gray-100 text-gray-400', cancelled: 'bg-gray-100 text-gray-400',
};

export default function InvoicesPage() {
  const [rows, setRows] = useState<Invoice[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (query: string, overdue: boolean) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (query) qs.set('q', query);
      if (overdue) qs.set('overdue', 'true');
      const res = await apiFetch<{ data: Invoice[]; pagination: { total: number } }>(`/invoices?${qs}`);
      setRows(res.data); setTotal(res.pagination.total); setError(null);
    } catch (e) { setError((e as ApiError).message); } finally { setLoading(false); }
  }, []);

  useEffect(() => { apiFetch<Summary>('/invoices/summary').then(setSummary).catch(() => {}); }, []);
  useEffect(() => { const t = setTimeout(() => load(q, overdueOnly), 250); return () => clearTimeout(t); }, [q, overdueOnly, load]);

  return (
    <div className={PAGE.wide}>
      <h1 className="text-2xl font-semibold text-gray-900">Invoices</h1>
      {summary && (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Outstanding" value={formatMoney(summary.outstanding, 'PHP')} />
          <Stat label="Overdue" value={formatMoney(summary.overdueAmount, 'PHP')} danger={summary.overdueCount > 0} />
          <Stat label="Overdue invoices" value={String(summary.overdueCount)} danger={summary.overdueCount > 0} />
          <Stat label="Open invoices" value={String(summary.openCount)} />
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search invoice # or account…"
          className="w-full max-w-sm rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} /> Overdue only
        </label>
      </div>

      {error && <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-4 py-2.5 font-medium">Invoice #</th>
              <th className="px-4 py-2.5 font-medium">Account</th>
              <th className="px-4 py-2.5 font-medium">Issued</th>
              <th className="px-4 py-2.5 font-medium">Due</th>
              <th className="px-4 py-2.5 font-medium text-right">Total</th>
              <th className="px-4 py-2.5 font-medium text-right">Outstanding</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-400">Loading…</td></tr>}
            {!loading && !error && rows.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No invoices yet. Generate one from a sales order.</td></tr>}
            {!loading && rows.map((i) => (
              <tr key={i.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                <td className="px-4 py-2.5"><Link href={`/invoices/${i.id}`} className="font-medium text-brand-700">{i.invoiceNo}</Link></td>
                <td className="px-4 py-2.5 text-gray-600">{i.account?.name ?? '—'}</td>
                <td className="px-4 py-2.5 text-gray-600">{formatDate(i.issueDate)}</td>
                <td className={`px-4 py-2.5 ${i.isOverdue ? 'font-medium text-red-600' : 'text-gray-600'}`}>{formatDate(i.dueDate)}</td>
                <td className="px-4 py-2.5 text-right text-gray-800">{formatMoney(i.total, i.currency)}</td>
                <td className="px-4 py-2.5 text-right font-medium text-gray-800">{formatMoney(i.outstanding, i.currency)}</td>
                <td className="px-4 py-2.5">
                  <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${STATUS[i.status]}`}>{i.status.replace(/_/g, ' ')}</span>
                  {i.isOverdue && <span className="ml-1 rounded bg-red-50 px-1.5 py-0.5 text-[10px] text-red-700">overdue</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</div>
      <div className={`mt-1 text-lg font-semibold ${danger ? 'text-red-600' : 'text-gray-900'}`}>{value}</div>
    </div>
  );
}
