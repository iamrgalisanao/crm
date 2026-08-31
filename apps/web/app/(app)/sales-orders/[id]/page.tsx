'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { SALES_ORDER_TRANSITIONS } from '@crm/shared';
import { apiFetch, ApiError } from '../../../../lib/api';
import { useAuth } from '../../../../lib/auth';
import { formatMoney, formatDate } from '../../../../lib/format';
import { PAGE } from '../../../../lib/ui';

interface Item { id: string; description: string; quantity: string; unit: string; unitPrice: string; discountAmount: string; taxRateBp: number; lineTotal: string }
interface Order {
  id: string; orderNo: string; account: { id: string; name: string } | null; contact: { id: string; name: string } | null;
  owner: { id: string; name: string } | null; quotation: { id: string; quoteNo: string } | null;
  orderDate: string; status: string; deliveryStatus: string; billingStatus: string; currency: string;
  subtotal: string; discountTotal: string; taxTotal: string; grandTotal: string;
  terms: string | null; paymentTerms: string | null; deliveryTerms: string | null; notes: string | null; items: Item[];
  invoices?: { id: string; invoiceNo: string; status: string }[];
}

const STATUS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700', confirmed: 'bg-blue-50 text-blue-700',
  in_fulfillment: 'bg-indigo-50 text-indigo-700', fulfilled: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-gray-100 text-gray-400',
};

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const manage = can('sales_orders.manage');

  const load = useCallback(async () => {
    setLoading(true);
    try { setOrder(await apiFetch<Order>(`/sales-orders/${id}`)); setError(null); }
    catch (e) { setError((e as ApiError).message); } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true); setError(null);
    try { await fn(); await load(); } catch (e) { setError((e as ApiError).message); } finally { setBusy(false); }
  }

  if (loading) return <div className="text-gray-400">Loading…</div>;
  if (error && !order) return <div className="text-red-600">{error}</div>;
  if (!order) return null;

  const nextStatuses = (SALES_ORDER_TRANSITIONS[order.status as keyof typeof SALES_ORDER_TRANSITIONS] ?? []).filter((s) => s !== 'cancelled');
  const c = order.currency;

  return (
    <div className={PAGE.wide}>
      <Link href="/sales-orders" className="text-sm text-gray-500 hover:text-gray-900">← Sales Orders</Link>

      <div className="mt-2 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-gray-900">{order.orderNo}</h1>
            <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${STATUS[order.status]}`}>{order.status.replace(/_/g, ' ')}</span>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {order.account ? <Link href={`/accounts/${order.account.id}`} className="text-brand-700 hover:underline">{order.account.name}</Link> : 'No account'}
            {order.quotation && <> · from <Link href={`/quotations/${order.quotation.id}`} className="text-brand-700 hover:underline">{order.quotation.quoteNo}</Link></>}
          </p>
        </div>
        <div className="text-right text-xl font-semibold text-gray-900">{formatMoney(order.grandTotal, c)}</div>
      </div>

      {error && <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {manage && order.status !== 'cancelled' && order.status !== 'fulfilled' && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white p-3">
          <span className="text-sm text-gray-500">Advance:</span>
          {nextStatuses.map((s) => (
            <button key={s} disabled={busy} onClick={() => act(() => apiFetch(`/sales-orders/${order.id}/status`, { method: 'POST', body: { status: s } }))}
              className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-medium capitalize text-gray-700 hover:bg-gray-50 disabled:opacity-50">{s.replace(/_/g, ' ')}</button>
          ))}
          <span className="ml-4 text-sm text-gray-500">Delivery:</span>
          {['pending', 'partial', 'delivered'].map((d) => (
            <button key={d} disabled={busy || order.deliveryStatus === d}
              onClick={() => act(() => apiFetch(`/sales-orders/${order.id}/delivery`, { method: 'POST', body: { deliveryStatus: d } }))}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium capitalize ${order.deliveryStatus === d ? 'bg-brand-500 text-white' : 'border border-gray-300 text-gray-700 hover:bg-gray-50'} disabled:opacity-50`}>{d}</button>
          ))}
          <span className="ml-4 text-xs text-gray-400">Billing: <span className="capitalize">{order.billingStatus}</span> (auto from invoices)</span>
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
              {order.items.map((it) => (
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
          <Row label="Subtotal" value={formatMoney(order.subtotal, c)} />
          <Row label="Discount" value={`− ${formatMoney(order.discountTotal, c)}`} />
          <Row label="Tax" value={formatMoney(order.taxTotal, c)} />
          <div className="mt-1 flex justify-between border-t border-gray-200 pt-2 text-base font-semibold text-gray-900">
            <span>Grand total</span><span>{formatMoney(order.grandTotal, c)}</span>
          </div>
          <div className="mt-3 border-t border-gray-100 pt-2 text-xs text-gray-500">
            <div>Order date: {formatDate(order.orderDate)}</div>
            <div>Owner: {order.owner?.name ?? '—'}</div>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Invoicing</h2>
          {(!order.invoices || order.invoices.length === 0) && manage && order.status !== 'cancelled' && (
            <button disabled={busy}
              onClick={() => act(async () => {
                const inv = await apiFetch<{ id: string }>(`/invoices/from-order/${order.id}`, { method: 'POST', body: {} });
                router.push(`/invoices/${inv.id}`);
              })}
              className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60">
              Generate invoice
            </button>
          )}
        </div>
        {order.invoices && order.invoices.length > 0 ? (
          <div className="mt-2 space-y-1">
            {order.invoices.map((inv) => (
              <Link key={inv.id} href={`/invoices/${inv.id}`} className="flex items-center justify-between text-sm text-brand-700 hover:underline">
                <span>{inv.invoiceNo}</span><span className="text-xs capitalize text-gray-400">{inv.status}</span>
              </Link>
            ))}
          </div>
        ) : <p className="mt-2 text-sm text-gray-400">No invoice yet.</p>}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between py-0.5 text-gray-600"><span>{label}</span><span className="text-gray-800">{value}</span></div>;
}
