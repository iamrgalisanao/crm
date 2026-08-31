'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { LeadStatus } from '@crm/shared';
import { apiFetch, ApiError } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { PAGE } from '../../../lib/ui';
import {
  CLASSIFICATION_STYLES,
  LEAD_STATUS_STYLES,
  PRIORITY_STYLES,
  statusLabel,
} from '../../../lib/badges';

interface Lead {
  id: string;
  leadNo: string;
  name: string;
  company: string | null;
  source: { id: string; label: string } | null;
  score: number;
  classification: string;
  priority: string;
  status: string;
  assignedUser: { id: string; name: string } | null;
}
interface Source { id: string; label: string }

const STATUS_FILTERS = Object.values(LeadStatus);

export default function LeadsPage() {
  const { can } = useAuth();
  const [rows, setRows] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async (query: string, st: string) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (query) qs.set('q', query);
      if (st) qs.set('status', st);
      const res = await apiFetch<{ data: Lead[]; pagination: { total: number } }>(`/leads?${qs}`);
      setRows(res.data);
      setTotal(res.pagination.total);
      setError(null);
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { apiFetch<Source[]>('/lead-sources').then(setSources).catch(() => {}); }, []);
  useEffect(() => {
    const t = setTimeout(() => load(q, status), 250);
    return () => clearTimeout(t);
  }, [q, status, load]);

  return (
    <div className={PAGE.wide}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Leads</h1>
          <p className="mt-1 text-sm text-gray-500">{total} leads</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/leads/map" className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Map view</Link>
          {can('leads.create') && (
            <button onClick={() => setShowForm((s) => !s)}
              className="rounded-lg bg-brand-500 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-600">
              {showForm ? 'Close' : 'New lead'}
            </button>
          )}
        </div>
      </div>

      {showForm && <NewLeadForm sources={sources} onCreated={() => { setShowForm(false); load(q, status); }} />}

      <div className="mt-4 flex flex-wrap gap-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, company, email, lead #…"
          className="w-full max-w-sm rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
        <select value={status} onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500">
          <option value="">All statuses</option>
          {STATUS_FILTERS.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
        </select>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-4 py-2.5 font-medium">Lead</th>
              <th className="px-4 py-2.5 font-medium">Company</th>
              <th className="px-4 py-2.5 font-medium">Source</th>
              <th className="px-4 py-2.5 font-medium">Score</th>
              <th className="px-4 py-2.5 font-medium">Priority</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Owner</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-400">Loading…</td></tr>}
            {error && !loading && <tr><td colSpan={7} className="px-4 py-6 text-center text-red-600">{error}</td></tr>}
            {!loading && !error && rows.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No leads yet.</td></tr>
            )}
            {!loading && !error && rows.map((l) => (
              <tr key={l.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                <td className="px-4 py-2.5">
                  <Link href={`/leads/${l.id}`} className="font-medium text-brand-700">{l.name}</Link>
                  <div className="text-xs text-gray-400">{l.leadNo}</div>
                </td>
                <td className="px-4 py-2.5 text-gray-600">{l.company ?? '—'}</td>
                <td className="px-4 py-2.5 text-gray-600">{l.source?.label ?? '—'}</td>
                <td className="px-4 py-2.5">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${CLASSIFICATION_STYLES[l.classification]}`}>
                    {l.score} · {l.classification}
                  </span>
                </td>
                <td className={`px-4 py-2.5 text-xs capitalize ${PRIORITY_STYLES[l.priority]}`}>{l.priority}</td>
                <td className="px-4 py-2.5">
                  <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${LEAD_STATUS_STYLES[l.status]}`}>
                    {statusLabel(l.status)}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-gray-600">{l.assignedUser?.name ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function NewLeadForm({ sources, onCreated }: { sources: Source[]; onCreated: () => void }) {
  const [f, setF] = useState({
    name: '', company: '', contactPerson: '', email: '', phone: '',
    sourceId: '', industry: '', interest: '', estimatedBudget: '', priority: 'medium',
  });
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const input = 'rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setErr(null);
    try {
      await apiFetch('/leads', {
        method: 'POST',
        body: {
          name: f.name,
          company: f.company || undefined,
          contactPerson: f.contactPerson || undefined,
          email: f.email || undefined,
          phone: f.phone || undefined,
          sourceId: f.sourceId || undefined,
          industry: f.industry || undefined,
          interest: f.interest || undefined,
          estimatedBudget: f.estimatedBudget || undefined,
          priority: f.priority,
        },
      });
      onCreated();
    } catch (e) { setErr((e as ApiError).message); } finally { setSaving(false); }
  }

  return (
    <form onSubmit={submit} className="mt-4 grid grid-cols-1 gap-3 rounded-xl border border-gray-200 bg-white p-4 sm:grid-cols-3">
      <input required placeholder="Lead name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={input} />
      <input placeholder="Company" value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} className={input} />
      <input placeholder="Contact person" value={f.contactPerson} onChange={(e) => setF({ ...f, contactPerson: e.target.value })} className={input} />
      <input placeholder="Email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className={input} />
      <input placeholder="Phone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} className={input} />
      <select value={f.sourceId} onChange={(e) => setF({ ...f, sourceId: e.target.value })} className={input}>
        <option value="">Source…</option>
        {sources.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
      </select>
      <input placeholder="Industry" value={f.industry} onChange={(e) => setF({ ...f, industry: e.target.value })} className={input} />
      <input placeholder="Interested in" value={f.interest} onChange={(e) => setF({ ...f, interest: e.target.value })} className={input} />
      <input placeholder="Est. budget (e.g. 250000)" value={f.estimatedBudget} onChange={(e) => setF({ ...f, estimatedBudget: e.target.value })} className={input} />
      <select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })} className={input}>
        <option value="low">Low</option><option value="medium">Medium</option>
        <option value="high">High</option><option value="urgent">Urgent</option>
      </select>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={saving}
          className="rounded-lg bg-brand-500 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60">
          {saving ? 'Saving…' : 'Create lead'}
        </button>
        {err && <span className="text-sm text-red-600">{err}</span>}
      </div>
    </form>
  );
}
