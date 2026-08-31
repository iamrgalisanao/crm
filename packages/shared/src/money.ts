/**
 * Money is represented everywhere as INTEGER MINOR UNITS (e.g. centavos) + a
 * currency code. Never use floating point for currency. All arithmetic that
 * affects stored totals must go through these helpers on the server.
 *
 * `amount` is a bigint number of minor units. For MVP the base currency is PHP
 * (2 decimal places), but the code is written to support other exponents.
 */

export type CurrencyCode = string; // ISO 4217, e.g. "PHP"

export interface Money {
  amount: bigint; // minor units
  currency: CurrencyCode;
}

/** Decimal exponent per currency (how many minor units in one major unit). */
const CURRENCY_EXPONENT: Record<string, number> = {
  PHP: 2,
  USD: 2,
  EUR: 2,
  JPY: 0,
};

export function exponentFor(currency: CurrencyCode): number {
  return CURRENCY_EXPONENT[currency.toUpperCase()] ?? 2;
}

/** Convert a major-unit decimal string ("1234.50") to minor units (123450n). */
export function toMinor(major: string | number, currency: CurrencyCode): bigint {
  const exp = exponentFor(currency);
  const str = typeof major === 'number' ? major.toString() : major.trim();
  const negative = str.startsWith('-');
  const clean = negative ? str.slice(1) : str;
  const [whole, frac = ''] = clean.split('.');
  const fracPadded = (frac + '0'.repeat(exp)).slice(0, exp);
  const digits = `${whole}${fracPadded}`.replace(/^0+(?=\d)/, '');
  const value = BigInt(digits === '' ? '0' : digits);
  return negative ? -value : value;
}

/** Convert minor units (123450n) to a major-unit decimal string ("1234.50"). */
export function toMajorString(amount: bigint, currency: CurrencyCode): string {
  const exp = exponentFor(currency);
  if (exp === 0) return amount.toString();
  const negative = amount < 0n;
  const abs = negative ? -amount : amount;
  const s = abs.toString().padStart(exp + 1, '0');
  const whole = s.slice(0, s.length - exp);
  const frac = s.slice(s.length - exp);
  return `${negative ? '-' : ''}${whole}.${frac}`;
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new Error(`Currency mismatch: ${a.currency} vs ${b.currency}`);
  }
}

export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amount: a.amount + b.amount, currency: a.currency };
}

export function subMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amount: a.amount - b.amount, currency: a.currency };
}

/**
 * Multiply a money amount by a quantity/rate expressed as basis-points-safe
 * integers. `numerator/denominator` lets us apply percentages without floats:
 * e.g. 8.5% tax => mulRatio(amount, 850n, 10000n). Uses round-half-up.
 */
export function mulRatio(amount: bigint, numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new Error('Division by zero');
  const negative = amount < 0n !== numerator < 0n;
  const a = amount < 0n ? -amount : amount;
  const n = numerator < 0n ? -numerator : numerator;
  const product = a * n;
  const half = denominator / 2n;
  const rounded = (product + half) / denominator; // round half up
  return negative ? -rounded : rounded;
}

/** Money zero for a currency. */
export function zero(currency: CurrencyCode): Money {
  return { amount: 0n, currency };
}

export function sumMoney(items: Money[], currency: CurrencyCode): Money {
  return items.reduce((acc, m) => addMoney(acc, m), zero(currency));
}
