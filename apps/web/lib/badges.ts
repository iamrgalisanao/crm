// Shared badge color maps for lead/CRM display.

export const CLASSIFICATION_STYLES: Record<string, string> = {
  HOT: 'bg-red-50 text-red-700',
  WARM: 'bg-amber-50 text-amber-700',
  NURTURE: 'bg-blue-50 text-blue-700',
  LOW: 'bg-gray-100 text-gray-500',
};

export const LEAD_STATUS_STYLES: Record<string, string> = {
  new: 'bg-slate-100 text-slate-700',
  contacted: 'bg-blue-50 text-blue-700',
  attempting_contact: 'bg-indigo-50 text-indigo-700',
  qualified: 'bg-green-50 text-green-700',
  unqualified: 'bg-gray-100 text-gray-500',
  converted: 'bg-emerald-100 text-emerald-800',
  lost: 'bg-red-50 text-red-700',
  spam: 'bg-gray-100 text-gray-400',
};

export const PRIORITY_STYLES: Record<string, string> = {
  low: 'text-gray-400',
  medium: 'text-gray-600',
  high: 'text-amber-600',
  urgent: 'text-red-600 font-semibold',
};

/** Filled pill styles for showing priority on cards and rows. */
export const PRIORITY_BADGE: Record<string, string> = {
  low: 'bg-gray-100 text-gray-500',
  medium: 'bg-slate-100 text-slate-600',
  high: 'bg-amber-50 text-amber-700',
  urgent: 'bg-red-50 text-red-700',
};

export function statusLabel(s: string): string {
  return s.replace(/_/g, ' ');
}
