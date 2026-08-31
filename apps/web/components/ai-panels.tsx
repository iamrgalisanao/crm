'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch, ApiError } from '../lib/api';
import { CLASSIFICATION_STYLES } from '../lib/badges';
import { formatMoney } from '../lib/format';

const AI_BADGE = <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-violet-700">AI</span>;

/** Lead qualification — AI suggests, the human applies (advisory boundary). */
export function LeadAiQualify({ leadId, onApplied }: { leadId: string; onApplied: () => void }) {
  const [res, setRes] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setBusy(true); setErr(null);
    try { setRes(await apiFetch(`/ai/score-lead/${leadId}`, { method: 'POST', body: {} })); }
    catch (e) { setErr((e as ApiError).message); } finally { setBusy(false); }
  }
  async function apply() {
    setBusy(true);
    try { await apiFetch(`/leads/${leadId}/score`, { method: 'POST', body: { model: 'BANT', criteria: res.breakdown } }); onApplied(); }
    catch (e) { setErr((e as ApiError).message); } finally { setBusy(false); }
  }

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-700">{AI_BADGE} Qualification</h3>
        <button disabled={busy} onClick={run} className="rounded-lg border border-violet-300 px-2.5 py-1 text-xs font-medium text-violet-700 hover:bg-violet-100 disabled:opacity-60">{busy ? '…' : res ? 'Re-run' : 'Analyze'}</button>
      </div>
      {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
      {res && (
        <div className="mt-2 text-sm">
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-xs ${CLASSIFICATION_STYLES[res.classification]}`}>{res.total} · {res.classification}</span>
            <span className="text-[11px] text-gray-400">via {res.model}</span>
          </div>
          <p className="mt-2 text-gray-600">{res.recommendation}</p>
          {res.analysis?.signals?.length > 0 && (
            <ul className="mt-2 list-inside list-disc text-xs text-gray-500">{res.analysis.signals.map((s: string, i: number) => <li key={i}>{s}</li>)}</ul>
          )}
          <button disabled={busy} onClick={apply} className="mt-3 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-60">Apply this score</button>
          <p className="mt-1 text-[11px] text-gray-400">Suggestion only — applying records it as the lead's score.</p>
        </div>
      )}
    </div>
  );
}

export function OppAiRisk({ oppId }: { oppId: string }) {
  const [res, setRes] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  async function run() { setBusy(true); try { setRes(await apiFetch(`/ai/opportunity-risk/${oppId}`)); } finally { setBusy(false); } }

  const riskColor = res?.riskLevel === 'high' ? 'text-red-600' : res?.riskLevel === 'medium' ? 'text-amber-600' : 'text-emerald-600';
  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-700">{AI_BADGE} Deal risk</h3>
        <button disabled={busy} onClick={run} className="rounded-lg border border-violet-300 px-2.5 py-1 text-xs font-medium text-violet-700 hover:bg-violet-100 disabled:opacity-60">{busy ? '…' : res ? 'Re-run' : 'Assess'}</button>
      </div>
      {res && (
        <div className="mt-2 text-sm">
          <div className="flex items-center gap-3">
            <span className="text-lg font-semibold text-gray-900">{res.winProbability}%</span>
            <span className={`text-xs font-medium capitalize ${riskColor}`}>{res.riskLevel} risk</span>
          </div>
          {res.reasons?.length > 0 && <ul className="mt-2 list-inside list-disc text-xs text-gray-500">{res.reasons.map((r: string, i: number) => <li key={i}>{r}</li>)}</ul>}
          <p className="mt-2 text-gray-600">{res.recommendedAction}</p>
        </div>
      )}
    </div>
  );
}

export function BriefingCard() {
  const [b, setB] = useState<any>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => { apiFetch('/ai/briefing').then(setB).catch(() => {}); }, []);
  if (!b || dismissed || (b.items.length === 0 && b.topOpportunities.length === 0)) return null;

  return (
    <div className="mb-5 rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-5">
      <div className="flex items-start justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-800">{AI_BADGE} {b.greeting} — here's what needs attention</h2>
        <button onClick={() => setDismissed(true)} className="text-xs text-gray-400 hover:text-gray-600">Dismiss</button>
      </div>
      {b.items.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
          {b.items.map((it: string, i: number) => <li key={i}>• {it}</li>)}
        </ul>
      )}
      <p className="mt-3 text-sm font-medium text-violet-800">{b.recommendation}</p>
      {b.topOpportunities.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {b.topOpportunities.map((o: any) => (
            <Link key={o.id} href={`/opportunities/${o.id}`} className="rounded-full bg-white px-2.5 py-1 text-xs text-violet-700 ring-1 ring-violet-200 hover:bg-violet-50">
              {o.account ?? o.name} · {formatMoney(o.amount)}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
