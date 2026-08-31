'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, ApiError } from '../../../../lib/api';
import { useAuth } from '../../../../lib/auth';
import { ActivitiesPanel } from '../../../../components/activities-panel';
import { PAGE } from '../../../../lib/ui';

interface Contact {
  id: string;
  name: string;
  jobTitle: string | null;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
  isDecisionMaker: boolean;
}
interface Account {
  id: string;
  name: string;
  industry: string | null;
  city: string | null;
  country: string | null;
  website: string | null;
  phone: string | null;
  status: string;
  owner: { id: string; name: string } | null;
  tags: string[];
  notes: string | null;
  contacts: Contact[];
}

export default function AccountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const [account, setAccount] = useState<Account | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setAccount(await apiFetch<Account>(`/accounts/${id}`));
      setError(null);
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="text-gray-400">Loading…</div>;
  if (error) return <div className="text-red-600">{error}</div>;
  if (!account) return null;

  return (
    <div className={PAGE.detail}>
      <Link href="/accounts" className="text-sm text-gray-500 hover:text-gray-900">← Accounts</Link>

      <div className="mt-2 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{account.name}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {[account.industry, account.city, account.country].filter(Boolean).join(' · ') || '—'}
          </p>
        </div>
        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600">{account.status}</span>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-5 lg:col-span-1">
          <h2 className="text-sm font-semibold text-gray-700">Details</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <Row label="Owner" value={account.owner?.name ?? '—'} />
            <Row label="Website" value={account.website ?? '—'} />
            <Row label="Phone" value={account.phone ?? '—'} />
            <Row label="Tags" value={account.tags.length ? account.tags.join(', ') : '—'} />
          </dl>
          {account.notes && <p className="mt-3 border-t border-gray-100 pt-3 text-sm text-gray-600">{account.notes}</p>}
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">Contacts ({account.contacts.length})</h2>
            {can('contacts.create') && (
              <button onClick={() => setShowForm((s) => !s)}
                className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50">
                {showForm ? 'Close' : 'Add contact'}
              </button>
            )}
          </div>

          {showForm && (
            <NewContactForm accountId={account.id} onCreated={() => { setShowForm(false); load(); }} />
          )}

          <div className="mt-3 divide-y divide-gray-100">
            {account.contacts.length === 0 && <p className="py-4 text-sm text-gray-400">No contacts yet.</p>}
            {account.contacts.map((c) => (
              <div key={c.id} className="flex items-center justify-between py-2.5">
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
                    {c.name}
                    {c.isPrimary && <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] text-brand-700">primary</span>}
                    {c.isDecisionMaker && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700">decision maker</span>}
                  </div>
                  <div className="text-xs text-gray-500">{[c.jobTitle, c.email, c.phone].filter(Boolean).join(' · ') || '—'}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4">
        <ActivitiesPanel relatedType="account" relatedId={account.id} />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-gray-100 pb-1.5">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-gray-800">{value}</dd>
    </div>
  );
}

function NewContactForm({ accountId, onCreated }: { accountId: string; onCreated: () => void }) {
  const [form, setForm] = useState({
    firstName: '', lastName: '', jobTitle: '', email: '', phone: '',
    isPrimary: false, isDecisionMaker: false,
  });
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      await apiFetch('/contacts', {
        method: 'POST',
        body: {
          accountId,
          firstName: form.firstName,
          lastName: form.lastName,
          jobTitle: form.jobTitle || undefined,
          email: form.email || undefined,
          phone: form.phone || undefined,
          isPrimary: form.isPrimary,
          isDecisionMaker: form.isDecisionMaker,
        },
      });
      onCreated();
    } catch (e) {
      setErr((e as ApiError).message);
    } finally {
      setSaving(false);
    }
  }

  const input = 'rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500';

  return (
    <form onSubmit={submit} className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-gray-50 p-3">
      <input required placeholder="First name" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} className={input} />
      <input required placeholder="Last name" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} className={input} />
      <input placeholder="Job title" value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} className={input} />
      <input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={input} />
      <input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={`${input} col-span-2`} />
      <label className="flex items-center gap-2 text-sm text-gray-600">
        <input type="checkbox" checked={form.isPrimary} onChange={(e) => setForm({ ...form, isPrimary: e.target.checked })} /> Primary
      </label>
      <label className="flex items-center gap-2 text-sm text-gray-600">
        <input type="checkbox" checked={form.isDecisionMaker} onChange={(e) => setForm({ ...form, isDecisionMaker: e.target.checked })} /> Decision maker
      </label>
      <div className="col-span-2 flex items-center gap-3">
        <button type="submit" disabled={saving} className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60">
          {saving ? 'Saving…' : 'Add contact'}
        </button>
        {err && <span className="text-sm text-red-600">{err}</span>}
      </div>
    </form>
  );
}
