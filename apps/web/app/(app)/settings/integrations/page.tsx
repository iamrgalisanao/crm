'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, ApiError } from '../../../../lib/api';
import { useAuth } from '../../../../lib/auth';
import { PAGE } from '../../../../lib/ui';

interface Channel {
  id: string; provider: string; name: string; status: string;
  messageCount: number; webhookPath: string; secret?: string; createdAt: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const PROVIDERS = ['generic', 'website', 'facebook', 'messenger', 'email', 'whatsapp', 'api'];

export default function IntegrationsPage() {
  const { can } = useAuth();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ provider: 'website', name: '' });
  const [created, setCreated] = useState<Channel | null>(null);
  const manage = can('integrations.manage');

  const load = useCallback(async () => {
    setLoading(true);
    try { setChannels(await apiFetch<Channel[]>('/integrations/channels')); setError(null); }
    catch (e) { setError((e as ApiError).message); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    try {
      const ch = await apiFetch<Channel>('/integrations/channels', { method: 'POST', body: form });
      setCreated(ch); setForm({ provider: 'website', name: '' }); load();
    } catch (e) { setError((e as ApiError).message); }
  }
  async function toggle(c: Channel) {
    await apiFetch(`/integrations/channels/${c.id}/status`, { method: 'POST', body: { status: c.status === 'active' ? 'disabled' : 'active' } });
    load();
  }
  async function remove(c: Channel) {
    if (!confirm(`Delete channel "${c.name}"? Its inbox messages will be removed.`)) return;
    await apiFetch(`/integrations/channels/${c.id}`, { method: 'DELETE' });
    load();
  }

  if (!manage) return <div className={PAGE.detail}><div className="text-sm text-gray-500">You don't have access to integrations.</div></div>;

  return (
    <div className={PAGE.detail}>
      <h1 className="text-2xl font-semibold text-gray-900">Integrations</h1>
      <p className="mt-1 text-sm text-gray-500">Connect channels so inquiries flow into your Inbox. Each channel has a private webhook URL + secret.</p>

      {error && <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {created && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm">
          <div className="font-semibold text-emerald-800">Channel “{created.name}” created</div>
          <p className="mt-1 text-emerald-700">Point your provider's webhook here and send the secret in the <code>x-webhook-secret</code> header. Copy the secret now — it won't be shown again.</p>
          <div className="mt-2 space-y-1 font-mono text-xs">
            <div><span className="text-emerald-600">URL:</span> {API_URL}{created.webhookPath}</div>
            <div><span className="text-emerald-600">Secret:</span> {created.secret}</div>
          </div>
          <button onClick={() => setCreated(null)} className="mt-2 text-xs text-emerald-700 hover:underline">Dismiss</button>
        </div>
      )}

      <form onSubmit={create} className="mt-4 flex flex-wrap items-end gap-2 rounded-xl border border-gray-200 bg-white p-4">
        <label className="text-xs text-gray-500">Provider
          <select value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} className="mt-1 block rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500">
            {PROVIDERS.map((p) => <option key={p} value={p} className="capitalize">{p}</option>)}
          </select>
        </label>
        <label className="flex-1 text-xs text-gray-500">Name
          <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Facebook Page" className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500" />
        </label>
        <button type="submit" className="rounded-lg bg-brand-500 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-600">Add channel</button>
      </form>

      <div className="mt-4 space-y-2">
        {loading && <div className="text-sm text-gray-400">Loading…</div>}
        {!loading && channels.length === 0 && <div className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">No channels yet.</div>}
        {channels.map((c) => (
          <div key={c.id} className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900">{c.name}</span>
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] uppercase text-gray-500">{c.provider}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${c.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-400'}`}>{c.status}</span>
                </div>
                <div className="mt-1 font-mono text-xs text-gray-400">{API_URL}{c.webhookPath}</div>
                <div className="mt-0.5 text-xs text-gray-400">{c.messageCount} message{c.messageCount === 1 ? '' : 's'} received</div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => toggle(c)} className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50">{c.status === 'active' ? 'Disable' : 'Enable'}</button>
                <button onClick={() => remove(c)} className="rounded-lg border border-red-200 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50">Delete</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
