'use client';

import { useCallback, useEffect, useState } from 'react';
import { ActivityType } from '@crm/shared';
import { apiFetch, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { PRIORITY_BADGE } from '../lib/badges';

export interface Activity {
  id: string;
  type: string;
  subject: string;
  dueDate: string | null;
  priority: string;
  status: string;
  isOverdue: boolean;
  owner: { id: string; name: string } | null;
  outcome: string | null;
}

const TYPE_OPTIONS = Object.values(ActivityType);

export function ActivitiesPanel({
  relatedType,
  relatedId,
}: {
  relatedType: 'lead' | 'account' | 'contact' | 'opportunity';
  relatedId: string;
}) {
  const { can } = useAuth();
  const [rows, setRows] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ data: Activity[] }>(
        `/activities?relatedType=${relatedType}&relatedId=${relatedId}`,
      );
      setRows(res.data);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [relatedType, relatedId]);

  useEffect(() => { load(); }, [load]);

  async function complete(id: string) {
    await apiFetch(`/activities/${id}/complete`, { method: 'POST', body: {} });
    load();
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">Activities</h2>
        {can('activities.create') && (
          <button onClick={() => setShowForm((s) => !s)}
            className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50">
            {showForm ? 'Close' : 'Log activity'}
          </button>
        )}
      </div>

      {showForm && (
        <ActivityForm relatedType={relatedType} relatedId={relatedId}
          onCreated={() => { setShowForm(false); load(); }} />
      )}

      <div className="mt-3 divide-y divide-gray-100">
        {loading && <p className="py-3 text-sm text-gray-400">Loading…</p>}
        {!loading && rows.length === 0 && <p className="py-3 text-sm text-gray-400">No activities logged.</p>}
        {!loading && rows.map((a) => (
          <div key={a.id} className="flex items-center justify-between py-2.5">
            <div>
              <div className="flex items-center gap-2 text-sm">
                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] uppercase text-gray-500">{a.type}</span>
                <span className={`font-medium ${a.status === 'done' ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{a.subject}</span>
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] capitalize ${PRIORITY_BADGE[a.priority] ?? 'bg-gray-100 text-gray-500'}`}>{a.priority}</span>
                {a.isOverdue && <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] text-red-700">overdue</span>}
              </div>
              <div className="text-xs text-gray-500">
                {a.dueDate ? `Due ${new Date(a.dueDate).toLocaleDateString()}` : 'No due date'}
                {a.owner ? ` · ${a.owner.name}` : ''}
                {a.outcome ? ` · ${a.outcome}` : ''}
              </div>
            </div>
            {a.status === 'done' ? (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                ✓ Done
              </span>
            ) : (
              can('activities.edit') && (
                <button onClick={() => complete(a.id)}
                  className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-700">
                  ✓ Mark done
                </button>
              )
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ActivityForm({
  relatedType, relatedId, onCreated,
}: { relatedType: string; relatedId: string; onCreated: () => void }) {
  const [f, setF] = useState({ type: 'followup', subject: '', dueDate: '', priority: 'medium' });
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const input = 'rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setErr(null);
    try {
      await apiFetch('/activities', {
        method: 'POST',
        body: {
          type: f.type,
          subject: f.subject,
          relatedType,
          relatedId,
          priority: f.priority,
          dueDate: f.dueDate ? new Date(f.dueDate).toISOString() : undefined,
        },
      });
      onCreated();
    } catch (e) { setErr((e as ApiError).message); } finally { setSaving(false); }
  }

  return (
    <form onSubmit={submit} className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-gray-50 p-3">
      <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} className={input}>
        {TYPE_OPTIONS.map((t) => <option key={t} value={t} className="capitalize">{t.replace(/_/g, ' ')}</option>)}
      </select>
      <select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })} className={input}>
        <option value="low">Low</option><option value="medium">Medium</option>
        <option value="high">High</option><option value="urgent">Urgent</option>
      </select>
      <input required placeholder="Subject" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} className={`${input} col-span-2`} />
      <input type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} className={input} />
      <div className="col-span-2 flex items-center gap-3">
        <button type="submit" disabled={saving} className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60">
          {saving ? 'Saving…' : 'Add activity'}
        </button>
        {err && <span className="text-sm text-red-600">{err}</span>}
      </div>
    </form>
  );
}
