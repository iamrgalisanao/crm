'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch, ApiError } from '../../../lib/api';
import { formatMoney, formatDate } from '../../../lib/format';
import { PAGE } from '../../../lib/ui';

interface Order {
  id: string; orderNo: string; account: { id: string; name: string } | null;
  orderDate: string; status: string; deliveryStatus: string; billingStatus: string;
  currency: string; grandTotal: string;
}

const STATUS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700', confirmed: 'bg-blue-50 text-blue-700',
  in_fulfillment: 'bg-indigo-50 text-indigo-700', fulfilled: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-gray-100 text-gray-400',
};
const DELIVERY: Record<string, string> = { pending: 'text-gray-400', partial: 'text-amber-600', delivered: 'text-emerald-700' };
const BILLING: Record<string, string> = { unbilled: 'text-gray-400', partial: 'text-amber-600', billed: 'text-emerald-700' };

export default function SalesOrdersPage() {
  const [rows, setRows] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (query: string, st: string) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (query) qs.set('q', query);
      if (st) qs.set('status', st);
      const res = await apiFetch<{ data: Order[]; pagination: { total: number } }>(`/sales-orders?${qs}`);
      setRows(res.data); setTotal(res.pagination.total); setError(null);
    } catch (e) { setError((e as ApiError).message); } finally { setLoading(false); }
  }, []);

  useEffect(() => { const t = setTimeout(() => load(q, status), 250); return () => clearTimeout(t); }, [q, status, load]);

  return (
    <div className={PAGE.wide}>
      <h1 className="text-2xl font-semibold text-gray-900">Sales Orders</h1>
      <p className="mt-1 text-sm text-gray-500">{total} orders · created by converting accepted quotations</p>

      <div className="mt-4 flex flex-wrap gap-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search order # or account…"
          className="w-full max-w-sm rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500">
          <option value="">All statuses</option>
          {Object.keys(STATUS).map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
      </div>

      {error && <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-4 py-2.5 font-medium">Order #</th>
              <th className="px-4 py-2.5 font-medium">Account</th>
              <th className="px-4 py-2.5 font-medium">Date</th>
              <th className="px-4 py-2.5 font-medium text-right">Total</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Delivery</th>
              <th className="px-4 py-2.5 font-medium">Billing</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-400">Loading…</td></tr>}
            {!loading && !error && rows.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No sales orders yet. Accept a quotation and convert it.</td></tr>}
            {!loading && rows.map((o) => (
              <tr key={o.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                <td className="px-4 py-2.5"><Link href={`/sales-orders/${o.id}`} className="font-medium text-brand-700">{o.orderNo}</Link></td>
                <td className="px-4 py-2.5 text-gray-600">{o.account?.name ?? '—'}</td>
                <td className="px-4 py-2.5 text-gray-600">{formatDate(o.orderDate)}</td>
                <td className="px-4 py-2.5 text-right font-medium text-gray-800">{formatMoney(o.grandTotal, o.currency)}</td>
                <td className="px-4 py-2.5"><span className={`rounded-full px-2 py-0.5 text-xs capitalize ${STATUS[o.status]}`}>{o.status.replace(/_/g, ' ')}</span></td>
                <td className={`px-4 py-2.5 text-xs capitalize ${DELIVERY[o.deliveryStatus]}`}>{o.deliveryStatus}</td>
                <td className={`px-4 py-2.5 text-xs capitalize ${BILLING[o.billingStatus]}`}>{o.billingStatus}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
