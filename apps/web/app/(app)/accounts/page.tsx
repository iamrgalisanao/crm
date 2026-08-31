'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch, ApiError } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { PAGE } from '../../../lib/ui';

interface Account {
  id: string;
  name: string;
  industry: string | null;
  city: string | null;
  status: string;
  owner: { id: string; name: string } | null;
  contactCount?: number;
}
interface Paged {
  data: Account[];
  pagination: { total: number };
}

const STATUS_STYLES: Record<string, string> = {
  prospect: 'bg-blue-50 text-blue-700',
  active: 'bg-green-50 text-green-700',
  inactive: 'bg-gray-100 text-gray-500',
  churned: 'bg-red-50 text-red-700',
};

export default function AccountsPage() {
  const { can } = useAuth();
  const [rows, setRows] = useState<Account[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async (query: string) => {
    setLoading(true);
    try {
      const res = await apiFetch<Paged>(`/accounts?q=${encodeURIComponent(query)}`);
      setRows(res.data);
      setTotal(res.pagination.total);
      setError(null);
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(q), 250);
    return () => clearTimeout(t);
  }, [q, load]);

  return (
    <div className={PAGE.wide}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Accounts</h1>
          <p className="mt-1 text-sm text-gray-500">{total} companies</p>
        </div>
        {can('accounts.create') && (
          <button
            onClick={() => setShowForm((s) => !s)}
            className="rounded-lg bg-brand-500 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-600"
          >
            {showForm ? 'Close' : 'New account'}
          </button>
        )}
      </div>

      {showForm && <NewAccountForm onCreated={() => { setShowForm(false); load(q); }} />}

      <div className="mt-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, industry, city…"
          className="w-full max-w-sm rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-4 py-2.5 font-medium">Company</th>
              <th className="px-4 py-2.5 font-medium">Industry</th>
              <th className="px-4 py-2.5 font-medium">City</th>
              <th className="px-4 py-2.5 font-medium">Owner</th>
              <th className="px-4 py-2.5 font-medium">Contacts</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">Loading…</td></tr>
            )}
            {error && !loading && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-red-600">{error}</td></tr>
            )}
            {!loading && !error && rows.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No accounts yet.</td></tr>
            )}
            {!loading && !error && rows.map((a) => (
              <tr key={a.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                <td className="px-4 py-2.5 font-medium text-brand-700">
                  <Link href={`/accounts/${a.id}`}>{a.name}</Link>
                </td>
                <td className="px-4 py-2.5 text-gray-600">{a.industry ?? '—'}</td>
                <td className="px-4 py-2.5 text-gray-600">{a.city ?? '—'}</td>
                <td className="px-4 py-2.5 text-gray-600">{a.owner?.name ?? '—'}</td>
                <td className="px-4 py-2.5 text-gray-600">{a.contactCount ?? 0}</td>
                <td className="px-4 py-2.5">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLES[a.status] ?? 'bg-gray-100 text-gray-500'}`}>
                    {a.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function NewAccountForm({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState({ name: '', industry: '', city: '', status: 'prospect' });
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      await apiFetch('/accounts', {
        method: 'POST',
        body: {
          name: form.name,
          industry: form.industry || undefined,
          city: form.city || undefined,
          status: form.status,
        },
      });
      onCreated();
    } catch (e) {
      setErr((e as ApiError).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 grid grid-cols-1 gap-3 rounded-xl border border-gray-200 bg-white p-4 sm:grid-cols-4">
      <input required placeholder="Company name" value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500 sm:col-span-2" />
      <input placeholder="Industry" value={form.industry}
        onChange={(e) => setForm({ ...form, industry: e.target.value })}
        className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500" />
      <input placeholder="City" value={form.city}
        onChange={(e) => setForm({ ...form, city: e.target.value })}
        className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500" />
      <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}
        className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500">
        <option value="prospect">Prospect</option>
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
        <option value="churned">Churned</option>
      </select>
      <div className="flex items-center gap-3 sm:col-span-3">
        <button type="submit" disabled={saving}
          className="rounded-lg bg-brand-500 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60">
          {saving ? 'Saving…' : 'Create account'}
        </button>
        {err && <span className="text-sm text-red-600">{err}</span>}
      </div>
    </form>
  );
}
