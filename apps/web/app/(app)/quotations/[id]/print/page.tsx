'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '../../../../../lib/api';
import { formatMoney, formatDate } from '../../../../../lib/format';

interface Item {
  id: string; description: string; quantity: string; unit: string;
  unitPrice: string; discountAmount: string; taxRateBp: number; lineTotal: string;
}
interface Quote {
  quoteNo: string; account: { name: string } | null; contact: { name: string } | null;
  owner: { name: string } | null; issueDate: string; expiryDate: string | null; status: string;
  currency: string; subtotal: string; discountTotal: string; taxTotal: string; grandTotal: string;
  terms: string | null; paymentTerms: string | null; deliveryTerms: string | null; notes: string | null;
  items: Item[];
}
interface Org { name: string; legalName: string | null; }

export default function QuotationPrintPage() {
  const { id } = useParams<{ id: string }>();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [org, setOrg] = useState<Org | null>(null);

  const load = useCallback(async () => {
    const [q, o] = await Promise.all([
      apiFetch<Quote>(`/quotations/${id}`),
      apiFetch<Org>('/organizations/current').catch(() => null),
    ]);
    setQuote(q); setOrg(o);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (!quote) return <div className="p-6 text-gray-400">Loading…</div>;
  const c = quote.currency;

  return (
    <div className="mx-auto max-w-3xl bg-white p-8 text-sm text-gray-800 print:max-w-none print:p-0">
      <div className="mb-6 flex items-center justify-between print:hidden">
        <Link href={`/quotations/${id}`} className="text-sm text-gray-500 hover:text-gray-900">← Back</Link>
        <button onClick={() => window.print()} className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600">Print / Save as PDF</button>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between border-b border-gray-300 pb-4">
        <div>
          <div className="text-lg font-bold text-gray-900">{org?.legalName || org?.name || 'Your Company'}</div>
          <div className="text-xs text-gray-500">Quotation</div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-gray-900">QUOTE</div>
          <div className="text-sm text-gray-600">{quote.quoteNo}</div>
        </div>
      </div>

      {/* Meta */}
      <div className="mt-4 grid grid-cols-2 gap-6">
        <div>
          <div className="text-xs font-semibold uppercase text-gray-400">Bill to</div>
          <div className="mt-1 font-medium text-gray-900">{quote.account?.name ?? '—'}</div>
          {quote.contact && <div className="text-gray-600">{quote.contact.name}</div>}
        </div>
        <div className="text-right">
          <MetaRow label="Issue date" value={formatDate(quote.issueDate)} />
          <MetaRow label="Valid until" value={formatDate(quote.expiryDate)} />
          <MetaRow label="Prepared by" value={quote.owner?.name ?? '—'} />
        </div>
      </div>

      {/* Items */}
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
          {quote.items.map((it) => (
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

      {/* Totals */}
      <div className="mt-4 flex justify-end">
        <div className="w-64">
          <TotalRow label="Subtotal" value={formatMoney(quote.subtotal, c)} />
          <TotalRow label="Discount" value={`− ${formatMoney(quote.discountTotal, c)}`} />
          <TotalRow label="Tax" value={formatMoney(quote.taxTotal, c)} />
          <div className="mt-1 flex justify-between border-t-2 border-gray-300 pt-2 text-base font-bold text-gray-900">
            <span>Grand total</span><span>{formatMoney(quote.grandTotal, c)}</span>
          </div>
        </div>
      </div>

      {/* Terms */}
      {(quote.paymentTerms || quote.deliveryTerms || quote.terms || quote.notes) && (
        <div className="mt-8 space-y-2 border-t border-gray-200 pt-4 text-xs text-gray-600">
          {quote.paymentTerms && <p><span className="font-semibold">Payment terms:</span> {quote.paymentTerms}</p>}
          {quote.deliveryTerms && <p><span className="font-semibold">Delivery terms:</span> {quote.deliveryTerms}</p>}
          {quote.terms && <p><span className="font-semibold">Terms:</span> {quote.terms}</p>}
          {quote.notes && <p><span className="font-semibold">Notes:</span> {quote.notes}</p>}
        </div>
      )}

      <div className="mt-10 text-center text-[11px] text-gray-400">This quotation is valid until the date shown above. Prices are in {c}.</div>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-6"><span className="text-gray-500">{label}</span><span className="text-gray-800">{value}</span></div>;
}
function TotalRow({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between py-0.5 text-gray-600"><span>{label}</span><span className="text-gray-800">{value}</span></div>;
}
