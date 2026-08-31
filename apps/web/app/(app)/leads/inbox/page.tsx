'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, ApiError } from '../../../../lib/api';
import { useAuth } from '../../../../lib/auth';
import { PAGE } from '../../../../lib/ui';

interface Message {
  id: string;
  channel: { id: string; name: string; provider: string } | null;
  fromName: string | null; fromHandle: string | null;
  subject: string | null; body: string | null;
  receivedAt: string; status: string; linkedLeadId: string | null;
}

const FILTERS = [
  { key: 'new', label: 'New' },
  { key: 'converted', label: 'Converted' },
  { key: 'ignored', label: 'Ignored' },
];

const PROVIDER_STYLE: Record<string, string> = {
  website: 'bg-blue-50 text-blue-700', facebook: 'bg-indigo-50 text-indigo-700',
  messenger: 'bg-indigo-50 text-indigo-700', email: 'bg-amber-50 text-amber-700',
  whatsapp: 'bg-emerald-50 text-emerald-700', generic: 'bg-gray-100 text-gray-600', api: 'bg-gray-100 text-gray-600',
};

export default function InboxPage() {
  const { can } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<Message[]>([]);
  const [newCount, setNewCount] = useState(0);
  const [filter, setFilter] = useState('new');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (f: string) => {
    setLoading(true);
    try {
      const r = await apiFetch<{ data: Message[]; newCount: number }>(`/inbox?status=${f}`);
      setRows(r.data); setNewCount(r.newCount); setError(null);
    } catch (e) { setError((e as ApiError).message); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(filter); }, [filter, load]);

  async function convert(id: string) {
    setBusy(id);
    try {
      const r = await apiFetch<{ leadId: string }>(`/inbox/${id}/convert`, { method: 'POST', body: {} });
      router.push(`/leads/${r.leadId}`);
    } catch (e) { setError((e as ApiError).message); setBusy(null); }
  }
  async function ignore(id: string) {
    setBusy(id);
    try { await apiFetch(`/inbox/${id}/ignore`, { method: 'POST', body: {} }); await load(filter); }
    catch (e) { setError((e as ApiError).message); } finally { setBusy(null); }
  }

  return (
    <div className={PAGE.wide}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Inbox</h1>
          <p className="mt-1 text-sm text-gray-500">{newCount} new inquir{newCount === 1 ? 'y' : 'ies'} · from your connected channels</p>
        </div>
        <Link href="/settings/integrations" className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Manage channels</Link>
      </div>

      <div className="mt-4 flex gap-2">
        {FILTERS.map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`rounded-lg px-3 py-1.5 text-sm ${filter === f.key ? 'bg-brand-500 text-white' : 'border border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
            {f.label}{f.key === 'new' && newCount > 0 ? ` (${newCount})` : ''}
          </button>
        ))}
      </div>

      {error && <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="mt-4 space-y-2">
        {loading && <div className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-400">Loading…</div>}
        {!loading && rows.length === 0 && (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
            {filter === 'new' ? 'No new inquiries. Connect a channel and point its webhook here.' : `Nothing ${filter}.`}
          </div>
        )}
        {!loading && rows.map((m) => (
          <div key={m.id} className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] uppercase ${PROVIDER_STYLE[m.channel?.provider ?? 'generic']}`}>{m.channel?.provider ?? 'channel'}</span>
                  <span className="font-medium text-gray-900">{m.fromName ?? 'Unknown sender'}</span>
                  {m.fromHandle && <span className="text-xs text-gray-400">{m.fromHandle}</span>}
                  <span className="text-xs text-gray-400">· {new Date(m.receivedAt).toLocaleString()}</span>
                </div>
                {m.subject && <div className="mt-1 text-sm font-medium text-gray-700">{m.subject}</div>}
                {m.body && <div className="mt-0.5 text-sm text-gray-500">{m.body}</div>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {m.status === 'new' && can('leads.create') && (
                  <button disabled={busy === m.id} onClick={() => convert(m.id)} className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-60">Convert to lead</button>
                )}
                {m.status === 'new' && can('leads.edit') && (
                  <button disabled={busy === m.id} onClick={() => ignore(m.id)} className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-60">Ignore</button>
                )}
                {m.status === 'converted' && m.linkedLeadId && (
                  <Link href={`/leads/${m.linkedLeadId}`} className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100">View lead →</Link>
                )}
                {m.status === 'ignored' && <span className="text-xs text-gray-400">ignored</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
