const SYMBOLS: Record<string, string> = { PHP: '₱', USD: '$', EUR: '€' };

/** Format a decimal-string amount (from the API) with thousands separators. */
export function formatMoney(amount: string | null, currency = 'PHP'): string {
  if (amount == null) return '—';
  const [whole, frac] = amount.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const sym = SYMBOLS[currency] ?? `${currency} `;
  return `${sym}${grouped}${frac ? '.' + frac : ''}`;
}

export function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString();
}
