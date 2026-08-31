'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch, ApiError } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { PRIORITY_BADGE } from '../../../lib/badges';
import { PAGE } from '../../../lib/ui';

interface Activity {
  id: string;
  type: string;
  subject: string;
  relatedType: string;
  relatedId: string;
  relatedLabel: string | null;
  dueDate: string | null;
  priority: string;
  status: string;
  isOverdue: boolean;
  owner: { id: string; name: string } | null;
}

const FILTERS = [
  { key: 'open', label: 'Open' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'done', label: 'Done' },
  { key: 'all', label: 'All' },
] as const;

const RELATED_PATH: Record<string, string> = {
  lead: '/leads',
  account: '/accounts',
  contact: '/contacts',
  opportunity: '/opportunities',
};

export default function ActivitiesPage() {
  const { can } = useAuth();
  const [rows, setRows] = useState<Activity[]>([]);
  const [filter, setFilter] = useState<string>('open');
  const [counts, setCounts] = useState<{ overdue: number; upcoming: number; open: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (f: string) => {
    setLoading(true);
    try {
      const res = await apiFetch<{ data: Activity[] }>(`/activities?filter=${f}`);
      setRows(res.data);
      setError(null);
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCounts = useCallback(() => {
    apiFetch<{ overdue: number; upcoming: number; open: number }>('/activities/counts')
      .then(setCounts).catch(() => setCounts(null));
  }, []);

  useEffect(() => { load(filter); }, [filter, load]);
  useEffect(() => { loadCounts(); }, [loadCounts]);

  async function complete(id: string) {
    await apiFetch(`/activities/${id}/complete`, { method: 'POST', body: {} });
    load(filter);
    loadCounts();
  }

  return (
    <div className={PAGE.wide}>
      <h1 className="text-2xl font-semibold text-gray-900">Activities</h1>
      {counts && (
        <p className="mt-1 text-sm text-gray-500">
          <span className={counts.overdue > 0 ? 'font-medium text-red-600' : ''}>{counts.overdue} overdue</span>
          {' · '}{counts.upcoming} upcoming · {counts.open} open
        </p>
      )}

      <div className="mt-4 flex gap-2">
        {FILTERS.map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              filter === f.key ? 'bg-brand-500 text-white' : 'border border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-4 py-2.5 font-medium">Type</th>
              <th className="px-4 py-2.5 font-medium">Subject</th>
              <th className="px-4 py-2.5 font-medium">Related to</th>
              <th className="px-4 py-2.5 font-medium">Priority</th>
              <th className="px-4 py-2.5 font-medium">Due</th>
              <th className="px-4 py-2.5 font-medium">Owner</th>
              <th className="px-4 py-2.5 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-400">Loading…</td></tr>}
            {error && !loading && <tr><td colSpan={7} className="px-4 py-6 text-center text-red-600">{error}</td></tr>}
            {!loading && !error && rows.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Nothing here.</td></tr>
            )}
            {!loading && !error && rows.map((a) => (
              <tr key={a.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                <td className="px-4 py-2.5">
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] uppercase text-gray-500">{a.type}</span>
                </td>
                <td className="px-4 py-2.5">
                  <span className={a.status === 'done' ? 'text-gray-400 line-through' : 'font-medium text-gray-900'}>{a.subject}</span>
                  {a.isOverdue && <span className="ml-2 rounded bg-red-50 px-1.5 py-0.5 text-[10px] text-red-700">overdue</span>}
                </td>
                <td className="px-4 py-2.5">
                  {a.relatedLabel ? (
                    <Link href={`${RELATED_PATH[a.relatedType]}/${a.relatedId}`} className="text-brand-700 hover:underline">
                      {a.relatedLabel}
                    </Link>
                  ) : <span className="text-gray-400">{a.relatedType}</span>}
                </td>
                <td className="px-4 py-2.5">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] capitalize ${PRIORITY_BADGE[a.priority] ?? 'bg-gray-100 text-gray-500'}`}>{a.priority}</span>
                </td>
                <td className="px-4 py-2.5 text-gray-600">{a.dueDate ? new Date(a.dueDate).toLocaleDateString() : '—'}</td>
                <td className="px-4 py-2.5 text-gray-600">{a.owner?.name ?? '—'}</td>
                <td className="px-4 py-2.5 text-right">
                  {a.status === 'done' ? (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">✓ Done</span>
                  ) : (
                    can('activities.edit') && (
                      <button onClick={() => complete(a.id)}
                        className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-700">
                        ✓ Mark done
                      </button>
                    )
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
