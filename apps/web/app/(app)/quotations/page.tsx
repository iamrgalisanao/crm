'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { formatMoney, formatDate } from '../../../lib/format';
import { PAGE } from '../../../lib/ui';
import { QUOTE_STATUS_STYLES, quoteStatusLabel } from '../../../lib/quote-status';

interface Quote {
  id: string;
  quoteNo: string;
  account: { id: string; name: string } | null;
  status: string;
  currency: string;
  grandTotal: string;
  issueDate: string;
  expiryDate: string | null;
}
interface Account { id: string; name: string }

export default function QuotationsPage() {
  const { can } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<Quote[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [newAccountId, setNewAccountId] = useState('');

  const load = useCallback(async (query: string, st: string) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (query) qs.set('q', query);
      if (st) qs.set('status', st);
      const res = await apiFetch<{ data: Quote[]; pagination: { total: number } }>(`/quotations?${qs}`);
      setRows(res.data); setTotal(res.pagination.total); setError(null);
    } catch (e) { setError((e as ApiError).message); } finally { setLoading(false); }
  }, []);

  useEffect(() => { apiFetch<{ data: Account[] }>('/accounts?limit=100').then((r) => setAccounts(r.data)).catch(() => {}); }, []);
  useEffect(() => { const t = setTimeout(() => load(q, status), 250); return () => clearTimeout(t); }, [q, status, load]);

  async function createDraft() {
    setCreating(true);
    try {
      const res = await apiFetch<{ id: string }>('/quotations', {
        method: 'POST',
        body: { accountId: newAccountId || undefined, items: [] },
      });
      router.push(`/quotations/${res.id}`);
    } catch (e) { setError((e as ApiError).message); setCreating(false); }
  }

  return (
    <div className={PAGE.wide}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Quotations</h1>
          <p className="mt-1 text-sm text-gray-500">{total} quotes</p>
        </div>
        {can('quotations.create') && (
          <div className="flex items-center gap-2">
            <select value={newAccountId} onChange={(e) => setNewAccountId(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500">
              <option value="">No account</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <button disabled={creating} onClick={createDraft}
              className="rounded-lg bg-brand-500 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60">
              {creating ? 'Creating…' : 'New quotation'}
            </button>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search quote # or account…"
          className="w-full max-w-sm rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500">
          <option value="">All statuses</option>
          {Object.keys(QUOTE_STATUS_STYLES).map((s) => <option key={s} value={s}>{quoteStatusLabel(s)}</option>)}
        </select>
      </div>

      {error && <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-4 py-2.5 font-medium">Quote #</th>
              <th className="px-4 py-2.5 font-medium">Account</th>
              <th className="px-4 py-2.5 font-medium">Issue date</th>
              <th className="px-4 py-2.5 font-medium">Expiry</th>
              <th className="px-4 py-2.5 font-medium text-right">Total</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">Loading…</td></tr>}
            {!loading && !error && rows.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No quotations yet.</td></tr>}
            {!loading && rows.map((qt) => (
              <tr key={qt.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                <td className="px-4 py-2.5"><Link href={`/quotations/${qt.id}`} className="font-medium text-brand-700">{qt.quoteNo}</Link></td>
                <td className="px-4 py-2.5 text-gray-600">{qt.account?.name ?? '—'}</td>
                <td className="px-4 py-2.5 text-gray-600">{formatDate(qt.issueDate)}</td>
                <td className="px-4 py-2.5 text-gray-600">{formatDate(qt.expiryDate)}</td>
                <td className="px-4 py-2.5 text-right font-medium text-gray-800">{formatMoney(qt.grandTotal, qt.currency)}</td>
                <td className="px-4 py-2.5"><span className={`rounded-full px-2 py-0.5 text-xs capitalize ${QUOTE_STATUS_STYLES[qt.status]}`}>{quoteStatusLabel(qt.status)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
