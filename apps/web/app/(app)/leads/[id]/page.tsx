'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  LEAD_TRANSITIONS,
  LeadStatus,
  DEFAULT_SCORE_CRITERIA,
} from '@crm/shared';
import { apiFetch, ApiError } from '../../../../lib/api';
import { useAuth } from '../../../../lib/auth';
import {
  CLASSIFICATION_STYLES,
  LEAD_STATUS_STYLES,
  statusLabel,
} from '../../../../lib/badges';
import { ActivitiesPanel } from '../../../../components/activities-panel';
import { LeadAiQualify } from '../../../../components/ai-panels';
import { PAGE } from '../../../../lib/ui';

interface Lead {
  id: string;
  leadNo: string;
  name: string;
  company: string | null;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  source: { id: string; label: string } | null;
  industry: string | null;
  interest: string | null;
  estimatedBudget: string | null;
  currency: string;
  location: string | null;
  assignedUser: { id: string; name: string } | null;
  status: string;
  score: number;
  classification: string;
  priority: string;
  notes: string | null;
  lostReason: string | null;
  convertedAccountId: string | null;
  convertedOpportunityId: string | null;
  scores: { id: string; model: string; total: number; classification: string; createdAt: string }[];
}

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const router = useRouter();
  const [lead, setLead] = useState<Lead | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try { setLead(await apiFetch<Lead>(`/leads/${id}`)); setError(null); }
    catch (e) { setError((e as ApiError).message); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { apiFetch<{ id: string; name: string }[]>('/users/assignable').then(setUsers).catch(() => {}); }, []);

  async function action(fn: () => Promise<unknown>) {
    setBusy(true); setError(null);
    try { await fn(); await load(); }
    catch (e) { setError((e as ApiError).message); }
    finally { setBusy(false); }
  }

  if (loading) return <div className="text-gray-400">Loading…</div>;
  if (error && !lead) return <div className="text-red-600">{error}</div>;
  if (!lead) return null;

  const nextStatuses = (LEAD_TRANSITIONS[lead.status as LeadStatus] ?? []).filter(
    (s) => s !== LeadStatus.CONVERTED,
  );
  const canConvert = lead.status === LeadStatus.QUALIFIED;

  async function convert() {
    const res = await apiFetch<{ accountId: string }>(`/leads/${lead!.id}/convert`, { method: 'POST', body: {} });
    router.push(`/accounts/${res.accountId}`);
  }

  return (
    <div className={PAGE.detail}>
      <Link href="/leads" className="text-sm text-gray-500 hover:text-gray-900">← Leads</Link>

      <div className="mt-2 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-gray-900">{lead.name}</h1>
            <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${LEAD_STATUS_STYLES[lead.status]}`}>{statusLabel(lead.status)}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs ${CLASSIFICATION_STYLES[lead.classification]}`}>{lead.score} · {lead.classification}</span>
          </div>
          <p className="mt-1 text-sm text-gray-500">{lead.leadNo} · {lead.company ?? 'No company'}</p>
        </div>
        <div className="flex gap-2">
          {lead.convertedOpportunityId && (
            <Link href={`/opportunities/${lead.convertedOpportunityId}`} className="rounded-lg bg-brand-50 px-3 py-1.5 text-sm text-brand-700 hover:bg-brand-100">
              View opportunity →
            </Link>
          )}
          {lead.convertedAccountId && (
            <Link href={`/accounts/${lead.convertedAccountId}`} className="rounded-lg bg-emerald-50 px-3 py-1.5 text-sm text-emerald-700 hover:bg-emerald-100">
              View account →
            </Link>
          )}
        </div>
      </div>

      {error && <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Details */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-gray-700">Details</h2>
          <dl className="mt-3 grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
            <Row label="Contact" value={lead.contactPerson ?? '—'} />
            <Row label="Email" value={lead.email ?? '—'} />
            <Row label="Phone" value={lead.phone ?? '—'} />
            <Row label="Mobile" value={lead.mobile ?? '—'} />
            <Row label="Source" value={lead.source?.label ?? '—'} />
            <Row label="Industry" value={lead.industry ?? '—'} />
            <Row label="Interested in" value={lead.interest ?? '—'} />
            <Row label="Est. budget" value={lead.estimatedBudget ? `${lead.currency} ${lead.estimatedBudget}` : '—'} />
            <Row label="Priority" value={lead.priority} />
            <Row label="Owner" value={lead.assignedUser?.name ?? '—'} />
          </dl>
          {lead.notes && <p className="mt-3 border-t border-gray-100 pt-3 text-sm text-gray-600">{lead.notes}</p>}
          {lead.lostReason && <p className="mt-3 text-sm text-red-600">Lost: {lead.lostReason}</p>}
        </div>

        {/* Actions */}
        <div className="space-y-4">
          {can('leads.edit') && lead.status !== 'converted' && (
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-gray-700">Move status</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {nextStatuses.length === 0 && <span className="text-xs text-gray-400">No further transitions.</span>}
                {nextStatuses.map((s) => (
                  <button key={s} disabled={busy}
                    onClick={() => action(() => changeStatus(lead.id, s))}
                    className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs capitalize text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                    {statusLabel(s)}
                  </button>
                ))}
              </div>
              {canConvert && can('leads.edit') && (
                <button disabled={busy} onClick={() => action(convert)}
                  className="mt-3 w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60">
                  Convert → Account + Contact
                </button>
              )}
            </div>
          )}

          {can('leads.assign') && lead.status !== 'converted' && (
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-gray-700">Assign</h3>
              <select disabled={busy} value={lead.assignedUser?.id ?? ''}
                onChange={(e) => action(() => apiFetch(`/leads/${lead.id}/assign`, { method: 'POST', body: { userId: e.target.value } }))}
                className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500">
                <option value="" disabled>Select owner…</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          )}

          {lead.status !== 'converted' && <LeadAiQualify leadId={lead.id} onApplied={load} />}

          {can('leads.edit') && lead.status !== 'converted' && (
            <ScorePanel leadId={lead.id} onScored={load} />
          )}
        </div>
      </div>

      <div className="mt-4">
        <ActivitiesPanel relatedType="lead" relatedId={lead.id} />
      </div>

      {lead.scores && lead.scores.length > 0 && (
        <div className="mt-4 rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-gray-700">Score history</h2>
          <div className="mt-2 divide-y divide-gray-100 text-sm">
            {lead.scores.map((s) => (
              <div key={s.id} className="flex items-center justify-between py-1.5">
                <span className="text-gray-600">{s.model} · {new Date(s.createdAt).toLocaleString()}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs ${CLASSIFICATION_STYLES[s.classification]}`}>{s.total} · {s.classification}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-gray-100 pb-1.5">
      <dt className="text-gray-500">{label}</dt>
      <dd className="capitalize text-gray-800">{value}</dd>
    </div>
  );
}

function changeStatus(id: string, status: string) {
  const body: Record<string, unknown> = { status };
  if (status === 'lost') body.lostReason = window.prompt('Loss reason?') ?? 'Unspecified';
  return apiFetch(`/leads/${id}/status`, { method: 'POST', body });
}

function ScorePanel({ leadId, onScored }: { leadId: string; onScored: () => void }) {
  const [vals, setVals] = useState<Record<string, number>>(
    Object.fromEntries(DEFAULT_SCORE_CRITERIA.map((c) => [c.key, 0])),
  );
  const [saving, setSaving] = useState(false);
  const total = Object.values(vals).reduce((a, b) => a + (Number(b) || 0), 0);

  async function submit() {
    setSaving(true);
    try {
      await apiFetch(`/leads/${leadId}/score`, { method: 'POST', body: { model: 'BANT', criteria: vals } });
      onScored();
    } finally { setSaving(false); }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-gray-700">Score (BANT)</h3>
      <div className="mt-2 space-y-2">
        {DEFAULT_SCORE_CRITERIA.map((c) => (
          <div key={c.key} className="flex items-center justify-between gap-2">
            <label className="text-xs text-gray-600">{c.label} <span className="text-gray-400">/ {c.max}</span></label>
            <input type="number" min={0} max={c.max} value={vals[c.key]}
              onChange={(e) => setVals({ ...vals, [c.key]: Math.min(c.max, Math.max(0, Number(e.target.value))) })}
              className="w-16 rounded-lg border border-gray-300 px-2 py-1 text-sm outline-none focus:border-brand-500" />
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between border-t border-gray-100 pt-2">
        <span className="text-sm font-medium text-gray-700">Total: {total}</span>
        <button disabled={saving} onClick={submit}
          className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60">
          {saving ? 'Saving…' : 'Save score'}
        </button>
      </div>
    </div>
  );
}
