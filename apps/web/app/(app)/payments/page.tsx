'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch, ApiError } from '../../../lib/api';
import { formatMoney, formatDate } from '../../../lib/format';
import { PAGE } from '../../../lib/ui';

interface Payment {
  id: string; paymentRef: string; invoice: { id: string; invoiceNo: string } | null;
  account: { id: string; name: string } | null; paymentDate: string; amount: string; currency: string;
  method: string; referenceNumber: string | null; receivedBy: { id: string; name: string } | null; status: string;
}

export default function PaymentsPage() {
  const [rows, setRows] = useState<Payment[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ data: Payment[]; pagination: { total: number } }>('/payments?limit=100');
      setRows(res.data); setTotal(res.pagination.total); setError(null);
    } catch (e) { setError((e as ApiError).message); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className={PAGE.wide}>
      <h1 className="text-2xl font-semibold text-gray-900">Payments</h1>
      <p className="mt-1 text-sm text-gray-500">{total} payments · recorded against invoices</p>

      {error && <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-4 py-2.5 font-medium">Ref</th>
              <th className="px-4 py-2.5 font-medium">Invoice</th>
              <th className="px-4 py-2.5 font-medium">Account</th>
              <th className="px-4 py-2.5 font-medium">Date</th>
              <th className="px-4 py-2.5 font-medium">Method</th>
              <th className="px-4 py-2.5 font-medium text-right">Amount</th>
              <th className="px-4 py-2.5 font-medium">Received by</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={8} className="px-4 py-6 text-center text-gray-400">Loading…</td></tr>}
            {!loading && !error && rows.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No payments yet.</td></tr>}
            {!loading && rows.map((p) => (
              <tr key={p.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                <td className="px-4 py-2.5 font-mono text-xs text-gray-600">{p.paymentRef}</td>
                <td className="px-4 py-2.5">{p.invoice ? <Link href={`/invoices/${p.invoice.id}`} className="text-brand-700 hover:underline">{p.invoice.invoiceNo}</Link> : '—'}</td>
                <td className="px-4 py-2.5 text-gray-600">{p.account?.name ?? '—'}</td>
                <td className="px-4 py-2.5 text-gray-600">{formatDate(p.paymentDate)}</td>
                <td className="px-4 py-2.5"><span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] uppercase text-gray-500">{p.method.replace(/_/g, ' ')}</span></td>
                <td className={`px-4 py-2.5 text-right font-medium ${p.status === 'reversed' ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{formatMoney(p.amount, p.currency)}</td>
                <td className="px-4 py-2.5 text-gray-600">{p.receivedBy?.name ?? '—'}</td>
                <td className="px-4 py-2.5"><span className={`rounded-full px-2 py-0.5 text-xs capitalize ${p.status === 'reversed' ? 'bg-gray-100 text-gray-400' : 'bg-emerald-50 text-emerald-700'}`}>{p.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
