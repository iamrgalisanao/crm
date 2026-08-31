'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch, ApiError } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { formatMoney, formatDate } from '../../../lib/format';
import { PAGE } from '../../../lib/ui';

interface Opp {
  id: string;
  name: string;
  account: { id: string; name: string } | null;
  stage: { id: string; name: string; type: string } | null;
  amount: string;
  currency: string;
  probability: number;
  weighted: string;
  expectedCloseDate: string | null;
  owner: { id: string; name: string } | null;
  status: string;
}
interface Account { id: string; name: string }

const STATUS_STYLES: Record<string, string> = {
  open: 'bg-blue-50 text-blue-700',
  won: 'bg-emerald-100 text-emerald-800',
  lost: 'bg-red-50 text-red-700',
};

export default function OpportunitiesPage() {
  const { can } = useAuth();
  const [rows, setRows] = useState<Opp[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);

  const load = useCallback(async (query: string, st: string) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (query) qs.set('q', query);
      if (st) qs.set('status', st);
      const res = await apiFetch<{ data: Opp[]; pagination: { total: number } }>(`/opportunities?${qs}`);
      setRows(res.data);
      setTotal(res.pagination.total);
      setError(null);
    } catch (e) { setError((e as ApiError).message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { apiFetch<{ data: Account[] }>('/accounts?limit=100').then((r) => setAccounts(r.data)).catch(() => {}); }, []);
  useEffect(() => {
    const t = setTimeout(() => load(q, status), 250);
    return () => clearTimeout(t);
  }, [q, status, load]);

  return (
    <div className={PAGE.wide}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Opportunities</h1>
          <p className="mt-1 text-sm text-gray-500">{total} deals</p>
        </div>
        <div className="flex gap-2">
          <Link href="/opportunities/pipeline" className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Pipeline board</Link>
          {can('opportunities.create') && (
            <button onClick={() => setShowForm((s) => !s)} className="rounded-lg bg-brand-500 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-600">
              {showForm ? 'Close' : 'New opportunity'}
            </button>
          )}
        </div>
      </div>

      {showForm && <NewOppForm accounts={accounts} onCreated={() => { setShowForm(false); load(q, status); }} />}

      <div className="mt-4 flex flex-wrap gap-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search deals…"
          className="w-full max-w-sm rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500">
          <option value="">All</option><option value="open">Open</option><option value="won">Won</option><option value="lost">Lost</option>
        </select>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-4 py-2.5 font-medium">Opportunity</th>
              <th className="px-4 py-2.5 font-medium">Account</th>
              <th className="px-4 py-2.5 font-medium">Stage</th>
              <th className="px-4 py-2.5 font-medium text-right">Amount</th>
              <th className="px-4 py-2.5 font-medium text-right">Prob.</th>
              <th className="px-4 py-2.5 font-medium text-right">Weighted</th>
              <th className="px-4 py-2.5 font-medium">Close</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={8} className="px-4 py-6 text-center text-gray-400">Loading…</td></tr>}
            {error && !loading && <tr><td colSpan={8} className="px-4 py-6 text-center text-red-600">{error}</td></tr>}
            {!loading && !error && rows.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No opportunities yet.</td></tr>}
            {!loading && !error && rows.map((o) => (
              <tr key={o.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                <td className="px-4 py-2.5"><Link href={`/opportunities/${o.id}`} className="font-medium text-brand-700">{o.name}</Link></td>
                <td className="px-4 py-2.5 text-gray-600">{o.account?.name ?? '—'}</td>
                <td className="px-4 py-2.5 text-gray-600">{o.stage?.name ?? '—'}</td>
                <td className="px-4 py-2.5 text-right text-gray-800">{formatMoney(o.amount, o.currency)}</td>
                <td className="px-4 py-2.5 text-right text-gray-600">{o.probability}%</td>
                <td className="px-4 py-2.5 text-right text-gray-800">{formatMoney(o.weighted, o.currency)}</td>
                <td className="px-4 py-2.5 text-gray-600">{formatDate(o.expectedCloseDate)}</td>
                <td className="px-4 py-2.5"><span className={`rounded-full px-2 py-0.5 text-xs capitalize ${STATUS_STYLES[o.status]}`}>{o.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function NewOppForm({ accounts, onCreated }: { accounts: Account[]; onCreated: () => void }) {
  const [f, setF] = useState({ name: '', accountId: '', amount: '', expectedCloseDate: '' });
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const input = 'rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setErr(null);
    try {
      await apiFetch('/opportunities', {
        method: 'POST',
        body: {
          name: f.name,
          accountId: f.accountId || undefined,
          amount: f.amount || undefined,
          expectedCloseDate: f.expectedCloseDate ? new Date(f.expectedCloseDate).toISOString() : undefined,
        },
      });
      onCreated();
    } catch (e) { setErr((e as ApiError).message); } finally { setSaving(false); }
  }

  return (
    <form onSubmit={submit} className="mt-4 grid grid-cols-1 gap-3 rounded-xl border border-gray-200 bg-white p-4 sm:grid-cols-4">
      <input required placeholder="Opportunity name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={`${input} sm:col-span-2`} />
      <select value={f.accountId} onChange={(e) => setF({ ...f, accountId: e.target.value })} className={input}>
        <option value="">Account…</option>
        {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
      <input placeholder="Amount (e.g. 500000)" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} className={input} />
      <input type="date" value={f.expectedCloseDate} onChange={(e) => setF({ ...f, expectedCloseDate: e.target.value })} className={input} />
      <div className="flex items-center gap-3 sm:col-span-3">
        <button type="submit" disabled={saving} className="rounded-lg bg-brand-500 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60">
          {saving ? 'Saving…' : 'Create opportunity'}
        </button>
        {err && <span className="text-sm text-red-600">{err}</span>}
      </div>
    </form>
  );
}
