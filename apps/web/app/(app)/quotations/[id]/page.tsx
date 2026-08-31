'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { computeQuoteLine, sumQuoteTotals, toMinor, toMajorString } from '@crm/shared';
import { apiFetch, ApiError } from '../../../../lib/api';
import { useAuth } from '../../../../lib/auth';
import { formatMoney, formatDate } from '../../../../lib/format';
import { PAGE } from '../../../../lib/ui';
import { QUOTE_STATUS_STYLES, quoteStatusLabel } from '../../../../lib/quote-status';

interface TaxRate { id: string; name: string; rateBp: number }
interface Product { id: string; sku: string; name: string; unit: string; defaultPrice: string; taxRate: { id: string; rateBp: number } | null }
interface Item {
  id: string; productId: string | null; description: string; quantity: string; unit: string;
  unitPrice: string; discountType: string; discountValue: string; discountAmount: string;
  taxRateId: string | null; taxRateBp: number; lineSubtotal: string; lineTax: string; lineTotal: string;
}
interface Quote {
  id: string; quoteNo: string; account: { id: string; name: string } | null;
  opportunity: { id: string; name: string } | null; contact: { id: string; name: string } | null;
  owner: { id: string; name: string } | null; issueDate: string; expiryDate: string | null; validityDays: number | null;
  status: string; approvalState: string; rejectionReason: string | null; version: number; currency: string;
  subtotal: string; discountTotal: string; taxTotal: string; grandTotal: string;
  terms: string | null; paymentTerms: string | null; deliveryTerms: string | null; notes: string | null;
  items: Item[];
  submittedAt?: string | null;
  salesOrderId?: string | null;
  approvals?: Approval[];
}
interface Approval {
  id: string; tier: number; requiredRole: string; decision: string;
  comments: string | null; decidedAt: string | null; approver: { id: string; name: string } | null;
}

interface EditRow {
  productId: string; description: string; quantity: string; unit: string;
  unitPrice: string; discountType: string; discountValue: string; taxRateId: string;
}

export default function QuotationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const router = useRouter();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [rows, setRows] = useState<EditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = await apiFetch<Quote>(`/quotations/${id}`);
      setQuote(q);
      setRows(q.items.map((it) => ({
        productId: it.productId ?? '', description: it.description, quantity: it.quantity,
        unit: it.unit, unitPrice: it.unitPrice, discountType: it.discountType,
        discountValue: it.discountValue, taxRateId: it.taxRateId ?? '',
      })));
      setError(null);
    } catch (e) { setError((e as ApiError).message); } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    apiFetch<{ data: Product[] }>('/products?limit=200&active=true').then((r) => setProducts(r.data)).catch(() => {});
    apiFetch<TaxRate[]>('/tax-rates').then(setTaxRates).catch(() => {});
  }, []);

  const currency = quote?.currency ?? 'PHP';
  const isDraft = quote?.status === 'draft';
  const editable = isDraft && can('quotations.edit');

  // Live preview of totals as the user edits (server recomputes on save).
  const preview = useMemo(() => {
    const results = rows.map((r) => {
      const bp = taxRates.find((t) => t.id === r.taxRateId)?.rateBp ?? 0;
      return computeQuoteLine({
        unitPrice: toMinor(r.unitPrice || '0', currency),
        quantity: r.quantity || '0',
        discountType: (r.discountType || 'none') as any,
        discountValue: r.discountValue || '0',
        taxRateBp: bp,
        currency,
      });
    });
    const t = sumQuoteTotals(results);
    return {
      lines: results.map((x) => toMajorString(x.lineTotal, currency)),
      subtotal: toMajorString(t.subtotal, currency),
      discountTotal: toMajorString(t.discountTotal, currency),
      taxTotal: toMajorString(t.taxTotal, currency),
      grandTotal: toMajorString(t.grandTotal, currency),
    };
  }, [rows, taxRates, currency]);

  function setRow(i: number, patch: Partial<EditRow>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function pickProduct(i: number, productId: string) {
    const p = products.find((x) => x.id === productId);
    if (!p) { setRow(i, { productId: '' }); return; }
    setRow(i, { productId, description: p.name, unitPrice: p.defaultPrice, unit: p.unit, taxRateId: p.taxRate?.id ?? '' });
  }
  function addRow() {
    setRows((rs) => [...rs, { productId: '', description: '', quantity: '1', unit: 'unit', unitPrice: '', discountType: 'none', discountValue: '0', taxRateId: '' }]);
  }
  function removeRow(i: number) { setRows((rs) => rs.filter((_, idx) => idx !== i)); }

  async function saveLines() {
    setBusy(true); setError(null);
    try {
      await apiFetch(`/quotations/${id}/items`, {
        method: 'PUT',
        body: {
          items: rows.map((r) => ({
            productId: r.productId || undefined,
            description: r.description || undefined,
            quantity: r.quantity || '1',
            unit: r.unit || undefined,
            unitPrice: r.unitPrice || undefined,
            discountType: r.discountType,
            discountValue: r.discountValue || '0',
            taxRateId: r.taxRateId || undefined,
          })),
        },
      });
      await load();
    } catch (e) { setError((e as ApiError).message); } finally { setBusy(false); }
  }

  async function action(path: string, body?: unknown) {
    setBusy(true); setError(null);
    try { await apiFetch(`/quotations/${id}/${path}`, { method: 'POST', body: body ?? {} }); await load(); }
    catch (e) { setError((e as ApiError).message); } finally { setBusy(false); }
  }

  if (loading) return <div className="text-gray-400">Loading…</div>;
  if (error && !quote) return <div className="text-red-600">{error}</div>;
  if (!quote) return null;

  const inp = 'rounded-lg border border-gray-300 px-2 py-1.5 text-sm outline-none focus:border-brand-500';

  return (
    <div className={PAGE.wide}>
      <Link href="/quotations" className="text-sm text-gray-500 hover:text-gray-900">← Quotations</Link>

      <div className="mt-2 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-gray-900">{quote.quoteNo}</h1>
            <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${QUOTE_STATUS_STYLES[quote.status]}`}>{quoteStatusLabel(quote.status)}</span>
            {quote.version > 1 && <span className="text-xs text-gray-400">v{quote.version}</span>}
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {quote.account ? <Link href={`/accounts/${quote.account.id}`} className="text-brand-700 hover:underline">{quote.account.name}</Link> : 'No account'}
            {quote.opportunity && <> · <Link href={`/opportunities/${quote.opportunity.id}`} className="text-brand-700 hover:underline">{quote.opportunity.name}</Link></>}
          </p>
        </div>
        <Link href={`/quotations/${quote.id}/print`} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Print / PDF</Link>
      </div>

      {error && <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {quote.rejectionReason && quote.status === 'draft' && (
        <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Returned for revision: {quote.rejectionReason}</div>
      )}

      {/* Status actions */}
      <div className="mt-4 flex flex-wrap gap-2 rounded-xl border border-gray-200 bg-white p-3">
        {isDraft && can('quotations.submit') && <ActBtn label="Submit for approval" onClick={() => action('submit')} busy={busy} />}
        {quote.status === 'for_approval' && can('quotations.approve') && <>
          <ActBtn label="Approve" color="emerald" onClick={() => action('approve')} busy={busy} />
          <ActBtn label="Reject" color="red" onClick={() => { const reason = window.prompt('Rejection reason?'); if (reason) action('reject', { reason }); }} busy={busy} />
        </>}
        {quote.status === 'approved' && can('quotations.edit') && <ActBtn label="Send to customer" onClick={() => action('send')} busy={busy} />}
        {(quote.status === 'sent' || quote.status === 'viewed') && can('quotations.edit') && <>
          <ActBtn label="Mark accepted" color="emerald" onClick={() => action('accept')} busy={busy} />
          <ActBtn label="Mark declined" color="red" onClick={() => action('decline')} busy={busy} />
        </>}
        {!['accepted', 'rejected', 'expired', 'cancelled'].includes(quote.status) && can('quotations.edit') && (
          <ActBtn label="Cancel" color="gray" onClick={() => action('cancel')} busy={busy} />
        )}
        {quote.status === 'accepted' && quote.salesOrderId && (
          <Link href={`/sales-orders/${quote.salesOrderId}`} className="rounded-lg bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-100">View sales order →</Link>
        )}
        {quote.status === 'accepted' && !quote.salesOrderId && can('sales_orders.manage') && (
          <button disabled={busy}
            onClick={async () => {
              setBusy(true); setError(null);
              try {
                const o = await apiFetch<{ id: string }>(`/sales-orders/from-quotation/${quote.id}`, { method: 'POST', body: {} });
                router.push(`/sales-orders/${o.id}`);
              } catch (e) { setError((e as ApiError).message); setBusy(false); }
            }}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60">
            Convert to Sales Order
          </button>
        )}
      </div>

      {/* Approval progress */}
      {quote.approvals && quote.approvals.length > 0 && (
        <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-gray-700">Approval workflow</h2>
          <div className="mt-3 space-y-2">
            {quote.approvals.map((a) => (
              <div key={a.id} className="flex items-center justify-between border-b border-gray-100 pb-2 last:border-0">
                <div className="flex items-center gap-2 text-sm">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-100 text-[11px] text-gray-500">{a.tier + 1}</span>
                  <span className="capitalize text-gray-700">{a.requiredRole.replace(/_/g, ' ')}</span>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  {a.approver && <span className="text-gray-400">{a.approver.name}{a.comments ? ` — “${a.comments}”` : ''}</span>}
                  <span className={`rounded-full px-2 py-0.5 font-medium ${
                    a.decision === 'approved' ? 'bg-emerald-50 text-emerald-700'
                    : a.decision === 'rejected' ? 'bg-red-50 text-red-700'
                    : 'bg-amber-50 text-amber-700'
                  }`}>{a.decision}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Line items */}
      <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2.5">
          <h2 className="text-sm font-semibold text-gray-700">Line items</h2>
          {editable && <button onClick={addRow} className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50">+ Add line</button>}
        </div>

        {editable ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-3 py-2 font-medium">Product</th>
                  <th className="px-3 py-2 font-medium">Description</th>
                  <th className="px-3 py-2 font-medium">Qty</th>
                  <th className="px-3 py-2 font-medium">Unit price</th>
                  <th className="px-3 py-2 font-medium">Discount</th>
                  <th className="px-3 py-2 font-medium">Tax</th>
                  <th className="px-3 py-2 font-medium text-right">Line total</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="px-3 py-2">
                      <select value={r.productId} onChange={(e) => pickProduct(i, e.target.value)} className={`${inp} w-32`}>
                        <option value="">Custom</option>
                        {products.map((p) => <option key={p.id} value={p.id}>{p.sku}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2"><input value={r.description} onChange={(e) => setRow(i, { description: e.target.value })} className={`${inp} w-40`} placeholder="Description" /></td>
                    <td className="px-3 py-2"><input value={r.quantity} onChange={(e) => setRow(i, { quantity: e.target.value })} className={`${inp} w-16`} /></td>
                    <td className="px-3 py-2"><input value={r.unitPrice} onChange={(e) => setRow(i, { unitPrice: e.target.value })} className={`${inp} w-24`} placeholder="0.00" /></td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <select value={r.discountType} onChange={(e) => setRow(i, { discountType: e.target.value })} className={`${inp} w-16`}>
                          <option value="none">—</option><option value="percent">%</option><option value="amount">₱</option>
                        </select>
                        {r.discountType !== 'none' && <input value={r.discountValue} onChange={(e) => setRow(i, { discountValue: e.target.value })} className={`${inp} w-16`} />}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <select value={r.taxRateId} onChange={(e) => setRow(i, { taxRateId: e.target.value })} className={`${inp} w-24`}>
                        <option value="">No tax</option>
                        {taxRates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-gray-800">{formatMoney(preview.lines[i] ?? '0', currency)}</td>
                    <td className="px-3 py-2"><button onClick={() => removeRow(i)} className="text-gray-400 hover:text-red-600">✕</button></td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center text-gray-400">No lines. Add one to start.</td></tr>}
              </tbody>
            </table>
          </div>
        ) : (
          <ReadOnlyItems items={quote.items} currency={currency} />
        )}

        {editable && (
          <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-4 py-3">
            <span className="text-xs text-gray-400">Totals recalculated on the server when you save.</span>
            <button disabled={busy} onClick={saveLines} className="rounded-lg bg-brand-500 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60">
              {busy ? 'Saving…' : 'Save lines'}
            </button>
          </div>
        )}
      </div>

      {/* Totals */}
      <div className="mt-4 flex justify-end">
        <div className="w-72 rounded-xl border border-gray-200 bg-white p-4 text-sm">
          <TotalRow label="Subtotal" value={formatMoney(editable ? preview.subtotal : quote.subtotal, currency)} />
          <TotalRow label="Discount" value={`− ${formatMoney(editable ? preview.discountTotal : quote.discountTotal, currency)}`} />
          <TotalRow label="Tax" value={formatMoney(editable ? preview.taxTotal : quote.taxTotal, currency)} />
          <div className="mt-1 flex justify-between border-t border-gray-200 pt-2 text-base font-semibold text-gray-900">
            <span>Grand total</span><span>{formatMoney(editable ? preview.grandTotal : quote.grandTotal, currency)}</span>
          </div>
        </div>
      </div>

      {/* Terms */}
      {editable ? <TermsEditor quote={quote} onSaved={load} /> : <TermsView quote={quote} />}
    </div>
  );
}

function ActBtn({ label, onClick, busy, color = 'brand' }: { label: string; onClick: () => void; busy: boolean; color?: string }) {
  const styles: Record<string, string> = {
    brand: 'bg-brand-500 text-white hover:bg-brand-600',
    emerald: 'bg-emerald-600 text-white hover:bg-emerald-700',
    red: 'border border-red-300 text-red-600 hover:bg-red-50',
    gray: 'border border-gray-300 text-gray-600 hover:bg-gray-50',
  };
  return <button disabled={busy} onClick={onClick} className={`rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-60 ${styles[color]}`}>{label}</button>;
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between py-0.5 text-gray-600"><span>{label}</span><span className="text-gray-800">{value}</span></div>;
}

function ReadOnlyItems({ items, currency }: { items: Item[]; currency: string }) {
  return (
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
          {items.map((it) => (
            <tr key={it.id} className="border-b border-gray-100 last:border-0">
              <td className="px-4 py-2 text-gray-800">{it.description}<span className="ml-1 text-xs text-gray-400">/ {it.unit}</span></td>
              <td className="px-4 py-2 text-right text-gray-600">{it.quantity}</td>
              <td className="px-4 py-2 text-right text-gray-600">{formatMoney(it.unitPrice, currency)}</td>
              <td className="px-4 py-2 text-right text-gray-600">{formatMoney(it.discountAmount, currency)}</td>
              <td className="px-4 py-2 text-right text-gray-600">{it.taxRateBp / 100}%</td>
              <td className="px-4 py-2 text-right font-medium text-gray-800">{formatMoney(it.lineTotal, currency)}</td>
            </tr>
          ))}
          {items.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">No line items.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function TermsView({ quote }: { quote: Quote }) {
  if (!quote.terms && !quote.paymentTerms && !quote.deliveryTerms && !quote.notes) return null;
  return (
    <div className="mt-4 grid grid-cols-1 gap-4 rounded-xl border border-gray-200 bg-white p-5 sm:grid-cols-2 text-sm">
      {quote.paymentTerms && <Field label="Payment terms" value={quote.paymentTerms} />}
      {quote.deliveryTerms && <Field label="Delivery terms" value={quote.deliveryTerms} />}
      {quote.terms && <Field label="Terms & conditions" value={quote.terms} />}
      {quote.notes && <Field label="Notes" value={quote.notes} />}
    </div>
  );
}
function Field({ label, value }: { label: string; value: string }) {
  return <div><div className="text-xs font-medium uppercase text-gray-400">{label}</div><div className="mt-1 whitespace-pre-wrap text-gray-700">{value}</div></div>;
}

function TermsEditor({ quote, onSaved }: { quote: Quote; onSaved: () => void }) {
  const [f, setF] = useState({
    paymentTerms: quote.paymentTerms ?? '', deliveryTerms: quote.deliveryTerms ?? '',
    validityDays: quote.validityDays?.toString() ?? '', terms: quote.terms ?? '', notes: quote.notes ?? '',
  });
  const [saving, setSaving] = useState(false);
  const inp = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500';

  async function save() {
    setSaving(true);
    try {
      await apiFetch(`/quotations/${quote.id}`, {
        method: 'PATCH',
        body: {
          paymentTerms: f.paymentTerms || undefined, deliveryTerms: f.deliveryTerms || undefined,
          validityDays: f.validityDays ? parseInt(f.validityDays, 10) : undefined,
          terms: f.terms || undefined, notes: f.notes || undefined,
        },
      });
      onSaved();
    } finally { setSaving(false); }
  }

  return (
    <div className="mt-4 rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-gray-700">Terms &amp; notes</h2>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input placeholder="Payment terms (e.g. 50% down, 50% on delivery)" value={f.paymentTerms} onChange={(e) => setF({ ...f, paymentTerms: e.target.value })} className={inp} />
        <input placeholder="Delivery terms" value={f.deliveryTerms} onChange={(e) => setF({ ...f, deliveryTerms: e.target.value })} className={inp} />
        <input placeholder="Validity (days)" value={f.validityDays} onChange={(e) => setF({ ...f, validityDays: e.target.value })} className={inp} />
        <input placeholder="Terms & conditions" value={f.terms} onChange={(e) => setF({ ...f, terms: e.target.value })} className={inp} />
        <textarea placeholder="Notes" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} className={`${inp} sm:col-span-2`} rows={2} />
      </div>
      <div className="mt-3 flex justify-end">
        <button disabled={saving} onClick={save} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60">{saving ? 'Saving…' : 'Save terms'}</button>
      </div>
    </div>
  );
}
