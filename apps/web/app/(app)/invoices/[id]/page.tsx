'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { PaymentMethod } from '@crm/shared';
import { apiFetch, ApiError } from '../../../../lib/api';
import { useAuth } from '../../../../lib/auth';
import { formatMoney, formatDate } from '../../../../lib/format';
import { PAGE } from '../../../../lib/ui';

interface Item { id: string; description: string; quantity: string; unit: string; unitPrice: string; discountAmount: string; taxRateBp: number; lineTotal: string }
interface Invoice {
  id: string; invoiceNo: string; account: { id: string; name: string } | null; contact: { id: string; name: string } | null;
  owner: { id: string; name: string } | null; salesOrder: { id: string; orderNo: string } | null;
  issueDate: string; dueDate: string | null; status: string; paymentStatus: string; isOverdue: boolean; currency: string;
  subtotal: string; discountTotal: string; taxTotal: string; total: string; amountPaid: string; outstanding: string;
  terms: string | null; notes: string | null; items: Item[];
  payments?: Payment[];
}
interface Payment {
  id: string; paymentRef: string; paymentDate: string; amount: string; method: string;
  referenceNumber: string | null; status: string; receivedBy: string | null;
}

const STATUS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700', issued: 'bg-blue-50 text-blue-700', sent: 'bg-indigo-50 text-indigo-700',
  partially_paid: 'bg-amber-50 text-amber-700', paid: 'bg-emerald-100 text-emerald-800',
  overdue: 'bg-red-50 text-red-700', void: 'bg-gray-100 text-gray-400', cancelled: 'bg-gray-100 text-gray-400',
};

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const [inv, setInv] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const manage = can('invoices.manage');

  const load = useCallback(async () => {
    setLoading(true);
    try { setInv(await apiFetch<Invoice>(`/invoices/${id}`)); setError(null); }
    catch (e) { setError((e as ApiError).message); } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true); setError(null);
    try { await fn(); await load(); } catch (e) { setError((e as ApiError).message); } finally { setBusy(false); }
  }

  if (loading) return <div className="text-gray-400">Loading…</div>;
  if (error && !inv) return <div className="text-red-600">{error}</div>;
  if (!inv) return null;
  const c = inv.currency;

  return (
    <div className={PAGE.wide}>
      <div className="flex items-center justify-between">
        <Link href="/invoices" className="text-sm text-gray-500 hover:text-gray-900">← Invoices</Link>
        <Link href={`/invoices/${inv.id}/print`} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Print / PDF</Link>
      </div>

      <div className="mt-2 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-gray-900">{inv.invoiceNo}</h1>
            <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${STATUS[inv.status]}`}>{inv.status.replace(/_/g, ' ')}</span>
            {inv.isOverdue && <span className="rounded bg-red-50 px-1.5 py-0.5 text-xs text-red-700">overdue</span>}
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {inv.account ? <Link href={`/accounts/${inv.account.id}`} className="text-brand-700 hover:underline">{inv.account.name}</Link> : 'No account'}
            {inv.salesOrder && <> · from <Link href={`/sales-orders/${inv.salesOrder.id}`} className="text-brand-700 hover:underline">{inv.salesOrder.orderNo}</Link></>}
          </p>
        </div>
        <div className="text-right">
          <div className="text-xl font-semibold text-gray-900">{formatMoney(inv.outstanding, c)}</div>
          <div className="text-xs text-gray-500">outstanding of {formatMoney(inv.total, c)}</div>
        </div>
      </div>

      {error && <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {manage && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white p-3">
          {inv.status === 'issued' && <button disabled={busy} onClick={() => act(() => apiFetch(`/invoices/${inv.id}/send`, { method: 'POST', body: {} }))} className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60">Mark sent</button>}
          {['issued', 'sent'].includes(inv.status) && <button disabled={busy} onClick={() => act(() => apiFetch(`/invoices/${inv.id}/void`, { method: 'POST', body: {} }))} className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60">Void</button>}
        </div>
      )}

      {/* Items */}
      <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-4 py-2 font-medium">Description</th>
                <th className="px-4 py-2 font-medium text-right">Qty</th>
                <th className="px-4 py-2 font-medium text-right">Unit price</th>
                <th className="px-4 py-2 font-medium text-right">Discount</th>
                <th className="px-4 py-2 font-medium text-right">Tax</th>
                <th className="px-4 py-2 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {inv.items.map((it) => (
                <tr key={it.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-2 text-gray-800">{it.description}<span className="ml-1 text-xs text-gray-400">/ {it.unit}</span></td>
                  <td className="px-4 py-2 text-right text-gray-600">{it.quantity}</td>
                  <td className="px-4 py-2 text-right text-gray-600">{formatMoney(it.unitPrice, c)}</td>
                  <td className="px-4 py-2 text-right text-gray-600">{formatMoney(it.discountAmount, c)}</td>
                  <td className="px-4 py-2 text-right text-gray-600">{it.taxRateBp / 100}%</td>
                  <td className="px-4 py-2 text-right font-medium text-gray-800">{formatMoney(it.lineTotal, c)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <div className="w-72 rounded-xl border border-gray-200 bg-white p-4 text-sm">
          <Row label="Subtotal" value={formatMoney(inv.subtotal, c)} />
          <Row label="Discount" value={`− ${formatMoney(inv.discountTotal, c)}`} />
          <Row label="Tax" value={formatMoney(inv.taxTotal, c)} />
          <div className="mt-1 flex justify-between border-t border-gray-200 pt-2 font-semibold text-gray-900"><span>Total</span><span>{formatMoney(inv.total, c)}</span></div>
          <Row label="Paid" value={`− ${formatMoney(inv.amountPaid, c)}`} />
          <div className="mt-1 flex justify-between border-t border-gray-200 pt-2 text-base font-semibold text-gray-900"><span>Outstanding</span><span>{formatMoney(inv.outstanding, c)}</span></div>
          <div className="mt-3 border-t border-gray-100 pt-2 text-xs text-gray-500">
            <div>Issued: {formatDate(inv.issueDate)}</div>
            <div className={inv.isOverdue ? 'text-red-600' : ''}>Due: {formatDate(inv.dueDate)}</div>
          </div>
        </div>
      </div>

      <PaymentsPanel invoice={inv} onChange={load} canRecord={can('payments.record')} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between py-0.5 text-gray-600"><span>{label}</span><span className="text-gray-800">{value}</span></div>;
}

function PaymentsPanel({ invoice, onChange, canRecord }: { invoice: Invoice; onChange: () => void; canRecord: boolean }) {
  const payments = invoice.payments ?? [];
  const closed = ['void', 'cancelled', 'paid'].includes(invoice.status);
  const [show, setShow] = useState(false);
  const [f, setF] = useState({ amount: invoice.outstanding, method: 'bank_transfer', referenceNumber: '', paymentDate: '', bank: '' });
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inp = 'rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500';

  async function record(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setErr(null);
    try {
      await apiFetch('/payments', {
        method: 'POST',
        body: {
          invoiceId: invoice.id, amount: f.amount, method: f.method,
          referenceNumber: f.referenceNumber || undefined, bank: f.bank || undefined,
          paymentDate: f.paymentDate ? new Date(f.paymentDate).toISOString() : undefined,
        },
      });
      setShow(false); onChange();
    } catch (e) { setErr((e as ApiError).message); } finally { setSaving(false); }
  }

  async function reverse(id: string) {
    await apiFetch(`/payments/${id}/reverse`, { method: 'POST', body: {} });
    onChange();
  }

  return (
    <div className="mt-4 rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">Payments</h2>
        {canRecord && !closed && (
          <button onClick={() => setShow((s) => !s)} className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50">
            {show ? 'Close' : 'Record payment'}
          </button>
        )}
      </div>

      {show && (
        <form onSubmit={record} className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-gray-50 p-3 sm:grid-cols-3">
          <input required placeholder="Amount" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} className={inp} />
          <select value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })} className={inp}>
            {Object.values(PaymentMethod).map((m) => <option key={m} value={m} className="capitalize">{m.replace(/_/g, ' ')}</option>)}
          </select>
          <input type="date" value={f.paymentDate} onChange={(e) => setF({ ...f, paymentDate: e.target.value })} className={inp} />
          <input placeholder="Reference #" value={f.referenceNumber} onChange={(e) => setF({ ...f, referenceNumber: e.target.value })} className={inp} />
          <input placeholder="Bank (optional)" value={f.bank} onChange={(e) => setF({ ...f, bank: e.target.value })} className={inp} />
          <div className="col-span-2 flex items-center gap-3 sm:col-span-3">
            <button type="submit" disabled={saving} className="rounded-lg bg-brand-500 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60">{saving ? 'Recording…' : 'Record payment'}</button>
            {err && <span className="text-sm text-red-600">{err}</span>}
          </div>
        </form>
      )}

      <div className="mt-3 divide-y divide-gray-100">
        {payments.length === 0 && <p className="py-3 text-sm text-gray-400">No payments recorded.</p>}
        {payments.map((p) => (
          <div key={p.id} className="flex items-center justify-between py-2.5 text-sm">
            <div>
              <span className={`font-medium ${p.status === 'reversed' ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{formatMoney(p.amount, invoice.currency)}</span>
              <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] uppercase text-gray-500">{p.method.replace(/_/g, ' ')}</span>
              <span className="ml-2 text-xs text-gray-400">{p.paymentRef} · {formatDate(p.paymentDate)}{p.referenceNumber ? ` · ${p.referenceNumber}` : ''}</span>
            </div>
            {p.status === 'recorded' && canRecord
              ? <button onClick={() => reverse(p.id)} className="text-xs text-gray-400 hover:text-red-600">Reverse</button>
              : <span className="text-xs capitalize text-gray-400">{p.status}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
