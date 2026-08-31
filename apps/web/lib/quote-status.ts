export const QUOTE_STATUS_STYLES: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700',
  for_approval: 'bg-amber-50 text-amber-700',
  approved: 'bg-blue-50 text-blue-700',
  sent: 'bg-indigo-50 text-indigo-700',
  viewed: 'bg-purple-50 text-purple-700',
  accepted: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-red-50 text-red-700',
  expired: 'bg-gray-100 text-gray-500',
  cancelled: 'bg-gray-100 text-gray-400',
};

export function quoteStatusLabel(s: string): string {
  return s.replace(/_/g, ' ');
}
