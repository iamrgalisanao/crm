'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { LOSS_REASONS } from '@crm/shared';
import { apiFetch, ApiError } from '../../../../lib/api';
import { useAuth } from '../../../../lib/auth';
import { formatMoney, formatDate } from '../../../../lib/format';
import { ActivitiesPanel } from '../../../../components/activities-panel';
import { OppAiRisk } from '../../../../components/ai-panels';
import { PAGE } from '../../../../lib/ui';

interface Stage { id: string; name: string; type: string; defaultProbability: number }
interface History { id: string; toStageId: string; fromProbability: number | null; toProbability: number | null; durationSeconds: number | null; changedAt: string }
interface Opp {
  id: string;
  name: string;
  account: { id: string; name: string } | null;
  primaryContact: { id: string; name: string } | null;
  owner: { id: string; name: string } | null;
  stage: { id: string; name: string; type: string } | null;
  stageId: string;
  amount: string;
  currency: string;
  probability: number;
  weighted: string;
  expectedCloseDate: string | null;
  priority: string;
  competitor: string | null;
  status: string;
  lostReason: string | null;
  daysInStage: number;
  notes: string | null;
  stages?: Stage[];
  history?: History[];
}

const STATUS_STYLES: Record<string, string> = {
  open: 'bg-blue-50 text-blue-700',
  won: 'bg-emerald-100 text-emerald-800',
  lost: 'bg-red-50 text-red-700',
};

export default function OpportunityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const router = useRouter();
  const [opp, setOpp] = useState<Opp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showLose, setShowLose] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setOpp(await apiFetch<Opp>(`/opportunities/${id}`)); setError(null); }
    catch (e) { setError((e as ApiError).message); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true); setError(null);
    try { await fn(); await load(); }
    catch (e) { setError((e as ApiError).message); }
    finally { setBusy(false); }
  }

  if (loading) return <div className="text-gray-400">Loading…</div>;
  if (error && !opp) return <div className="text-red-600">{error}</div>;
  if (!opp) return null;

  const openStages = (opp.stages ?? []).filter((s) => s.type === 'open');
  const isOpen = opp.status === 'open';
  const stageMap = new Map((opp.stages ?? []).map((s) => [s.id, s.name]));

  return (
    <div className={PAGE.detail}>
      <Link href="/opportunities" className="text-sm text-gray-500 hover:text-gray-900">← Opportunities</Link>

      <div className="mt-2 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-gray-900">{opp.name}</h1>
            <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${STATUS_STYLES[opp.status]}`}>{opp.status}</span>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {opp.account ? <Link href={`/accounts/${opp.account.id}`} className="text-brand-700 hover:underline">{opp.account.name}</Link> : 'No account'}
            {' · '}{opp.stage?.name}
          </p>
        </div>
        <div className="text-right">
          <div className="text-xl font-semibold text-gray-900">{formatMoney(opp.amount, opp.currency)}</div>
          <div className="text-xs text-gray-500">{opp.probability}% · wtd {formatMoney(opp.weighted, opp.currency)}</div>
          {can('quotations.create') && (
            <button
              onClick={async () => {
                const q = await apiFetch<{ id: string }>('/quotations', {
                  method: 'POST',
                  body: { accountId: opp.account?.id, opportunityId: opp.id, items: [] },
                });
                router.push(`/quotations/${q.id}`);
              }}
              className="mt-2 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
              Create quotation
            </button>
          )}
        </div>
      </div>

      {error && <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {/* Stage mover */}
      {isOpen && can('opportunities.edit') && (
        <div className="mt-5 rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex flex-wrap items-center gap-2">
            {openStages.map((s, i) => {
              const active = s.id === opp.stageId;
              return (
                <button key={s.id} disabled={busy || active}
                  onClick={() => act(() => apiFetch(`/opportunities/${opp.id}/stage`, { method: 'POST', body: { stageId: s.id } }))}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                    active ? 'bg-brand-500 text-white' : 'border border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}>
                  {i + 1}. {s.name}
                </button>
              );
            })}
            <div className="ml-auto flex gap-2">
              <button disabled={busy} onClick={() => act(() => apiFetch(`/opportunities/${opp.id}/win`, { method: 'POST', body: {} }))}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60">Mark Won</button>
              <button disabled={busy} onClick={() => setShowLose((s) => !s)}
                className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50">Mark Lost</button>
            </div>
          </div>
          {showLose && <LoseForm oppId={opp.id} onDone={() => { setShowLose(false); load(); }} />}
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-gray-700">Details</h2>
          <dl className="mt-3 grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
            <Row label="Owner" value={opp.owner?.name ?? '—'} />
            <Row label="Primary contact" value={opp.primaryContact?.name ?? '—'} />
            <Row label="Expected close" value={formatDate(opp.expectedCloseDate)} />
            <Row label="Priority" value={opp.priority} />
            <Row label="Competitor" value={opp.competitor ?? '—'} />
            <Row label="Days in stage" value={String(opp.daysInStage)} />
          </dl>
          {opp.lostReason && <p className="mt-3 text-sm text-red-600">Lost — {opp.lostReason}</p>}
          {opp.notes && <p className="mt-3 border-t border-gray-100 pt-3 text-sm text-gray-600">{opp.notes}</p>}
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-gray-700">Stage history</h2>
          <div className="mt-2 space-y-2 text-sm">
            {(opp.history ?? []).length === 0 && <p className="text-gray-400">No history.</p>}
            {(opp.history ?? []).map((h) => (
              <div key={h.id} className="border-b border-gray-100 pb-1.5">
                <div className="text-gray-700">{stageMap.get(h.toStageId) ?? 'Stage'}</div>
                <div className="text-xs text-gray-400">
                  {new Date(h.changedAt).toLocaleString()}
                  {h.durationSeconds != null ? ` · ${Math.max(0, Math.round(h.durationSeconds / 86400))}d in prev` : ''}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {opp.status === 'open' && <div className="mt-4"><OppAiRisk oppId={opp.id} /></div>}

      <div className="mt-4">
        <ActivitiesPanel relatedType="opportunity" relatedId={opp.id} />
      </div>
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

function LoseForm({ oppId, onDone }: { oppId: string; onDone: () => void }) {
  const [reason, setReason] = useState<string>(LOSS_REASONS[0]);
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true); setErr(null);
    try {
      await apiFetch(`/opportunities/${oppId}/lose`, { method: 'POST', body: { lostReason: reason, lostNotes: notes || undefined } });
      onDone();
    } catch (e) { setErr((e as ApiError).message); } finally { setSaving(false); }
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-red-50 p-3">
      <select value={reason} onChange={(e) => setReason(e.target.value)} className="rounded-lg border border-red-200 px-3 py-2 text-sm outline-none">
        {LOSS_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
      </select>
      <input placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)}
        className="flex-1 rounded-lg border border-red-200 px-3 py-2 text-sm outline-none" />
      <button disabled={saving} onClick={submit} className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60">
        {saving ? 'Saving…' : 'Confirm lost'}
      </button>
      {err && <span className="text-sm text-red-600">{err}</span>}
    </div>
  );
}
