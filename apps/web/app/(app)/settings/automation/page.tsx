'use client';

import { useCallback, useEffect, useState } from 'react';
import { ROLE_LABELS, RoleKey } from '@crm/shared';
import { apiFetch, ApiError } from '../../../../lib/api';
import { useAuth } from '../../../../lib/auth';
import { PAGE } from '../../../../lib/ui';

interface Trigger { event: string; label: string }
interface Rule {
  id: string; name: string; trigger: string; actions: { type: string; config: any }[];
  isActive: boolean; runCount: number;
}
interface Run { id: string; rule: string; trigger: string; status: string; detail: string | null; createdAt: string }

const ACTION_LABEL: Record<string, string> = { notify_role: 'Notify role', create_activity: 'Create activity', webhook: 'Webhook (n8n)' };

export default function AutomationPage() {
  const { can } = useAuth();
  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const manage = can('settings.manage');

  const load = useCallback(async () => {
    try {
      const [t, r, ru] = await Promise.all([
        apiFetch<{ triggers: Trigger[] }>('/automation/triggers'),
        apiFetch<Rule[]>('/automation/rules'),
        apiFetch<Run[]>('/automation/runs'),
      ]);
      setTriggers(t.triggers); setRules(r); setRuns(ru); setError(null);
    } catch (e) { setError((e as ApiError).message); }
  }, []);

  useEffect(() => { if (manage) load(); }, [manage, load]);

  if (!manage) return <div className={PAGE.detail}><div className="text-sm text-gray-500">You don't have access to automation.</div></div>;

  const triggerLabel = (ev: string) => triggers.find((t) => t.event === ev)?.label ?? ev;

  async function toggle(r: Rule) { await apiFetch(`/automation/rules/${r.id}/active`, { method: 'POST', body: { isActive: !r.isActive } }); load(); }
  async function remove(r: Rule) { if (confirm(`Delete rule "${r.name}"?`)) { await apiFetch(`/automation/rules/${r.id}`, { method: 'DELETE' }); load(); } }

  return (
    <div className={PAGE.detail}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Workflows</h1>
          <p className="mt-1 text-sm text-gray-500">Run actions automatically when things happen in your CRM.</p>
        </div>
        <button onClick={() => setShowForm((s) => !s)} className="rounded-lg bg-brand-500 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-600">{showForm ? 'Close' : 'New rule'}</button>
      </div>

      {error && <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {showForm && <RuleForm triggers={triggers} onCreated={() => { setShowForm(false); load(); }} onError={setError} />}

      <div className="mt-4 space-y-2">
        {rules.length === 0 && <div className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">No rules yet. Create one to automate follow-ups, alerts, or n8n webhooks.</div>}
        {rules.map((r) => (
          <div key={r.id} className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900">{r.name}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${r.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-400'}`}>{r.isActive ? 'active' : 'off'}</span>
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  <span className="text-gray-400">When</span> {triggerLabel(r.trigger)} <span className="text-gray-400">→</span> {r.actions.map((a) => ACTION_LABEL[a.type] ?? a.type).join(', ')}
                  <span className="ml-2 text-gray-400">· {r.runCount} run{r.runCount === 1 ? '' : 's'}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => toggle(r)} className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50">{r.isActive ? 'Disable' : 'Enable'}</button>
                <button onClick={() => remove(r)} className="rounded-lg border border-red-200 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50">Delete</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {runs.length > 0 && (
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-gray-700">Recent runs</h2>
          <div className="mt-2 divide-y divide-gray-100 text-sm">
            {runs.slice(0, 15).map((r) => (
              <div key={r.id} className="flex items-center justify-between py-2">
                <div>
                  <span className="text-gray-700">{r.rule}</span>
                  <span className="ml-2 text-xs text-gray-400">{r.trigger} · {new Date(r.createdAt).toLocaleString()}</span>
                  {r.detail && <div className="text-xs text-gray-500">{r.detail}</div>}
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs ${r.status === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{r.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RuleForm({ triggers, onCreated, onError }: { triggers: Trigger[]; onCreated: () => void; onError: (m: string) => void }) {
  const [name, setName] = useState('');
  const [trigger, setTrigger] = useState(triggers[0]?.event ?? '');
  const [actionType, setActionType] = useState('notify_role');
  const [config, setConfig] = useState<Record<string, any>>({ role: RoleKey.SALES_MANAGER });
  const [saving, setSaving] = useState(false);
  const inp = 'rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500';

  function setActionKind(t: string) {
    setActionType(t);
    setConfig(t === 'notify_role' ? { role: RoleKey.SALES_MANAGER } : t === 'create_activity' ? { activityType: 'followup', subject: '', dueInDays: 1 } : { url: '', secret: '' });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch('/automation/rules', { method: 'POST', body: { name, trigger, actions: [{ type: actionType, config }] } });
      onCreated();
    } catch (e) { onError((e as ApiError).message); } finally { setSaving(false); }
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-3 rounded-xl border border-gray-200 bg-white p-4">
      <input required placeholder="Rule name" value={name} onChange={(e) => setName(e.target.value)} className={`${inp} w-full`} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-xs text-gray-500">When (trigger)
          <select value={trigger} onChange={(e) => setTrigger(e.target.value)} className={`${inp} mt-1 block w-full`}>
            {triggers.map((t) => <option key={t.event} value={t.event}>{t.label}</option>)}
          </select>
        </label>
        <label className="text-xs text-gray-500">Do (action)
          <select value={actionType} onChange={(e) => setActionKind(e.target.value)} className={`${inp} mt-1 block w-full`}>
            <option value="notify_role">Notify a role</option>
            <option value="create_activity">Create a follow-up activity</option>
            <option value="webhook">Send a webhook (n8n)</option>
          </select>
        </label>
      </div>

      {actionType === 'notify_role' && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <select value={config.role} onChange={(e) => setConfig({ ...config, role: e.target.value })} className={inp}>
            {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input placeholder="Title" value={config.title ?? ''} onChange={(e) => setConfig({ ...config, title: e.target.value })} className={inp} />
          <input placeholder="Body" value={config.body ?? ''} onChange={(e) => setConfig({ ...config, body: e.target.value })} className={inp} />
        </div>
      )}
      {actionType === 'create_activity' && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <input placeholder="Subject" value={config.subject ?? ''} onChange={(e) => setConfig({ ...config, subject: e.target.value })} className={inp} />
          <select value={config.activityType} onChange={(e) => setConfig({ ...config, activityType: e.target.value })} className={inp}>
            {['followup', 'call', 'email', 'task'].map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input type="number" min={0} placeholder="Due in days" value={config.dueInDays ?? 1} onChange={(e) => setConfig({ ...config, dueInDays: Number(e.target.value) })} className={inp} />
        </div>
      )}
      {actionType === 'webhook' && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input placeholder="Webhook URL (e.g. your n8n endpoint)" value={config.url ?? ''} onChange={(e) => setConfig({ ...config, url: e.target.value })} className={inp} />
          <input placeholder="Signing secret (optional)" value={config.secret ?? ''} onChange={(e) => setConfig({ ...config, secret: e.target.value })} className={inp} />
        </div>
      )}

      <button type="submit" disabled={saving} className="rounded-lg bg-brand-500 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60">{saving ? 'Saving…' : 'Create rule'}</button>
    </form>
  );
}
