'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../lib/api';

interface Notif {
  id: string; type: string; title: string; body: string | null;
  relatedType: string | null; relatedId: string | null; read: boolean; createdAt: string;
}

const PATH: Record<string, string> = {
  lead: '/leads', quotation: '/quotations', opportunity: '/opportunities',
  invoice: '/invoices', account: '/accounts', contact: '/contacts', payment: '/payments',
};

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function NotificationBell() {
  const router = useRouter();
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const loadCount = useCallback(() => {
    apiFetch<{ unread: number }>('/notifications/unread-count').then((r) => setUnread(r.unread)).catch(() => {});
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch<{ data: Notif[]; unread: number }>('/notifications?limit=15');
      setItems(r.data); setUnread(r.unread);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    loadCount();
    const t = setInterval(loadCount, 30000);
    return () => clearInterval(t);
  }, [loadCount]);

  useEffect(() => {
    function onClick(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) loadList();
  }

  async function openItem(n: Notif) {
    if (!n.read) { await apiFetch(`/notifications/${n.id}/read`, { method: 'POST', body: {} }).catch(() => {}); }
    setOpen(false);
    loadCount();
    if (n.relatedType && n.relatedId && PATH[n.relatedType]) router.push(`${PATH[n.relatedType]}/${n.relatedId}`);
  }

  async function markAll() {
    await apiFetch('/notifications/read-all', { method: 'POST', body: {} }).catch(() => {});
    setItems((its) => its.map((n) => ({ ...n, read: true })));
    setUnread(0);
  }

  return (
    <div ref={ref} className="relative">
      <button onClick={toggle} className="relative flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700" aria-label="Notifications">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
            <span className="text-sm font-semibold text-gray-800">Notifications</span>
            {unread > 0 && <button onClick={markAll} className="text-xs text-brand-600 hover:underline">Mark all read</button>}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {loading && <div className="px-4 py-6 text-center text-sm text-gray-400">Loading…</div>}
            {!loading && items.length === 0 && <div className="px-4 py-8 text-center text-sm text-gray-400">You're all caught up.</div>}
            {!loading && items.map((n) => (
              <button key={n.id} onClick={() => openItem(n)}
                className={`flex w-full items-start gap-2 border-b border-gray-50 px-4 py-2.5 text-left hover:bg-gray-50 ${n.read ? '' : 'bg-brand-50/40'}`}>
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? 'bg-transparent' : 'bg-brand-500'}`} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-gray-800">{n.title}</span>
                  {n.body && <span className="block truncate text-xs text-gray-500">{n.body}</span>}
                  <span className="block text-[11px] text-gray-400">{timeAgo(n.createdAt)}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
