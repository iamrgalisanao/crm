'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '../../../../../lib/api';
import { formatMoney, formatDate } from '../../../../../lib/format';

interface Item { id: string; description: string; quantity: string; unit: string; unitPrice: string; discountAmount: string; taxRateBp: number; lineTotal: string }
interface Invoice {
  invoiceNo: string; account: { name: string } | null; contact: { name: string } | null;
  issueDate: string; dueDate: string | null; currency: string;
  subtotal: string; discountTotal: string; taxTotal: string; total: string; amountPaid: string; outstanding: string;
  terms: string | null; notes: string | null; items: Item[];
}
interface Org { name: string; legalName: string | null }

export default function InvoicePrintPage() {
  const { id } = useParams<{ id: string }>();
  const [inv, setInv] = useState<Invoice | null>(null);
  const [org, setOrg] = useState<Org | null>(null);

  const load = useCallback(async () => {
    const [i, o] = await Promise.all([apiFetch<Invoice>(`/invoices/${id}`), apiFetch<Org>('/organizations/current').catch(() => null)]);
    setInv(i); setOrg(o);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (!inv) return <div className="p-6 text-gray-400">Loading…</div>;
  const c = inv.currency;

  return (
    <div className="mx-auto max-w-3xl bg-white p-8 text-sm text-gray-800 print:max-w-none print:p-0">
      <div className="mb-6 flex items-center justify-between print:hidden">
        <Link href={`/invoices/${id}`} className="text-sm text-gray-500 hover:text-gray-900">← Back</Link>
        <button onClick={() => window.print()} className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600">Print / Save as PDF</button>
      </div>

      <div className="flex items-start justify-between border-b border-gray-300 pb-4">
        <div>
          <div className="text-lg font-bold text-gray-900">{org?.legalName || org?.name || 'Your Company'}</div>
          <div className="text-xs text-gray-500">Invoice</div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-gray-900">INVOICE</div>
          <div className="text-sm text-gray-600">{inv.invoiceNo}</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-6">
        <div>
          <div className="text-xs font-semibold uppercase text-gray-400">Bill to</div>
          <div className="mt-1 font-medium text-gray-900">{inv.account?.name ?? '—'}</div>
          {inv.contact && <div className="text-gray-600">{inv.contact.name}</div>}
        </div>
        <div className="text-right">
          <MetaRow label="Issue date" value={formatDate(inv.issueDate)} />
          <MetaRow label="Due date" value={formatDate(inv.dueDate)} />
        </div>
      </div>

      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-gray-300 text-left text-xs uppercase text-gray-500">
            <th className="py-2">Description</th>
            <th className="py-2 text-right">Qty</th>
            <th className="py-2 text-right">Unit price</th>
            <th className="py-2 text-right">Discount</th>
            <th className="py-2 text-right">Tax</th>
            <th className="py-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {inv.items.map((it) => (
            <tr key={it.id} className="border-b border-gray-200">
              <td className="py-2">{it.description}</td>
              <td className="py-2 text-right">{it.quantity} {it.unit}</td>
              <td className="py-2 text-right">{formatMoney(it.unitPrice, c)}</td>
              <td className="py-2 text-right">{formatMoney(it.discountAmount, c)}</td>
              <td className="py-2 text-right">{it.taxRateBp / 100}%</td>
              <td className="py-2 text-right font-medium">{formatMoney(it.lineTotal, c)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 flex justify-end">
        <div className="w-64">
          <TotalRow label="Subtotal" value={formatMoney(inv.subtotal, c)} />
          <TotalRow label="Discount" value={`− ${formatMoney(inv.discountTotal, c)}`} />
          <TotalRow label="Tax" value={formatMoney(inv.taxTotal, c)} />
          <div className="mt-1 flex justify-between border-t border-gray-200 pt-1 font-semibold text-gray-900"><span>Total</span><span>{formatMoney(inv.total, c)}</span></div>
          <TotalRow label="Paid" value={`− ${formatMoney(inv.amountPaid, c)}`} />
          <div className="mt-1 flex justify-between border-t-2 border-gray-300 pt-2 text-base font-bold text-gray-900"><span>Amount due</span><span>{formatMoney(inv.outstanding, c)}</span></div>
        </div>
      </div>

      {(inv.terms || inv.notes) && (
        <div className="mt-8 space-y-2 border-t border-gray-200 pt-4 text-xs text-gray-600">
          {inv.terms && <p><span className="font-semibold">Payment terms:</span> {inv.terms}</p>}
          {inv.notes && <p><span className="font-semibold">Notes:</span> {inv.notes}</p>}
        </div>
      )}

      <div className="mt-10 text-center text-[11px] text-gray-400">Please settle the amount due by the date shown. Amounts are in {c}.</div>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-6"><span className="text-gray-500">{label}</span><span className="text-gray-800">{value}</span></div>;
}
function TotalRow({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between py-0.5 text-gray-600"><span>{label}</span><span className="text-gray-800">{value}</span></div>;
}
