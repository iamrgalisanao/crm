/**
 * Quotation line and total arithmetic. Single source of truth used by the API
 * (authoritative — client totals are ignored and recomputed) and the web quote
 * builder (live preview). All money is integer minor units; nothing here uses
 * floating point for currency.
 */
import { mulRatio, toMinor, CurrencyCode } from './money';

const QTY_SCALE = 3; // quantities support up to 3 decimal places

/** Parse a decimal string to an integer scaled by 10^scale (round half up). */
export function parseScaled(value: string | number, scale: number): bigint {
  const str = typeof value === 'number' ? value.toString() : value.trim();
  const negative = str.startsWith('-');
  const clean = negative ? str.slice(1) : str;
  const [whole, frac = ''] = clean.split('.');
  // one extra digit for rounding
  const padded = (frac + '0'.repeat(scale + 1)).slice(0, scale + 1);
  const base = BigInt(`${whole || '0'}${padded.slice(0, scale)}`);
  const roundDigit = Number(padded[scale] ?? '0');
  const rounded = roundDigit >= 5 ? base + 1n : base;
  return negative ? -rounded : rounded;
}

export type DiscountType = 'none' | 'percent' | 'amount';

export interface QuoteLineInput {
  unitPrice: bigint; // minor units
  quantity: string | number; // decimal
  discountType: DiscountType;
  discountValue: string | number; // percent (e.g. "10") or amount (e.g. "500.00")
  taxRateBp: number; // basis points, e.g. 1200 = 12%
  currency: CurrencyCode;
}

export interface QuoteLineResult {
  base: bigint; // qty * unitPrice, before discount
  discountAmount: bigint;
  lineSubtotal: bigint; // after discount, before tax
  lineTax: bigint;
  lineTotal: bigint;
}

/** Compute a single quotation line. Discount never exceeds the line base. */
export function computeQuoteLine(input: QuoteLineInput): QuoteLineResult {
  const qtyScaled = parseScaled(input.quantity, QTY_SCALE);
  const base = mulRatio(input.unitPrice, qtyScaled, 10n ** BigInt(QTY_SCALE));

  let discountAmount = 0n;
  if (input.discountType === 'percent') {
    const bp = parseScaled(input.discountValue, 2); // "12.5" -> 1250 bp
    discountAmount = mulRatio(base, bp, 10000n);
  } else if (input.discountType === 'amount') {
    discountAmount = toMinor(String(input.discountValue), input.currency);
  }
  if (discountAmount > base) discountAmount = base;
  if (discountAmount < 0n) discountAmount = 0n;

  const lineSubtotal = base - discountAmount;
  const lineTax = mulRatio(lineSubtotal, BigInt(Math.max(0, input.taxRateBp)), 10000n);
  const lineTotal = lineSubtotal + lineTax;

  return { base, discountAmount, lineSubtotal, lineTax, lineTotal };
}

export interface QuoteTotals {
  subtotal: bigint;
  discountTotal: bigint;
  taxTotal: bigint;
  grandTotal: bigint;
}

export function sumQuoteTotals(lines: QuoteLineResult[]): QuoteTotals {
  return lines.reduce<QuoteTotals>(
    (acc, l) => ({
      subtotal: acc.subtotal + l.base,
      discountTotal: acc.discountTotal + l.discountAmount,
      taxTotal: acc.taxTotal + l.lineTax,
      grandTotal: acc.grandTotal + l.lineTotal,
    }),
    { subtotal: 0n, discountTotal: 0n, taxTotal: 0n, grandTotal: 0n },
  );
}
