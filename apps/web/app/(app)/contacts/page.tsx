'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch, ApiError } from '../../../lib/api';
import { PAGE } from '../../../lib/ui';

interface Contact {
  id: string;
  name: string;
  jobTitle: string | null;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
  account: { id: string; name: string } | null;
}
interface Paged {
  data: Contact[];
  pagination: { total: number };
}

export default function ContactsPage() {
  const [rows, setRows] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (query: string) => {
    setLoading(true);
    try {
      const res = await apiFetch<Paged>(`/contacts?q=${encodeURIComponent(query)}`);
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
      <h1 className="text-2xl font-semibold text-gray-900">Contacts</h1>
      <p className="mt-1 text-sm text-gray-500">{total} people</p>

      <div className="mt-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name or email…"
          className="w-full max-w-sm rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium">Title</th>
              <th className="px-4 py-2.5 font-medium">Company</th>
              <th className="px-4 py-2.5 font-medium">Email</th>
              <th className="px-4 py-2.5 font-medium">Phone</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">Loading…</td></tr>}
            {error && !loading && <tr><td colSpan={5} className="px-4 py-6 text-center text-red-600">{error}</td></tr>}
            {!loading && !error && rows.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No contacts yet.</td></tr>
            )}
            {!loading && !error && rows.map((c) => (
              <tr key={c.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                <td className="px-4 py-2.5 font-medium text-gray-900">
                  {c.name}
                  {c.isPrimary && <span className="ml-2 rounded bg-brand-50 px-1.5 py-0.5 text-[10px] text-brand-700">primary</span>}
                </td>
                <td className="px-4 py-2.5 text-gray-600">{c.jobTitle ?? '—'}</td>
                <td className="px-4 py-2.5">
                  {c.account
                    ? <Link href={`/accounts/${c.account.id}`} className="text-brand-700 hover:underline">{c.account.name}</Link>
                    : <span className="text-gray-400">—</span>}
                </td>
                <td className="px-4 py-2.5 text-gray-600">{c.email ?? '—'}</td>
                <td className="px-4 py-2.5 text-gray-600">{c.phone ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
