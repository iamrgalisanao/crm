'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { apiFetch } from '../lib/api';
import { NotificationBell } from './notification-bell';

interface Org {
  name: string;
  baseCurrency: string;
}

export function Topbar() {
  const { logout } = useAuth();
  const [org, setOrg] = useState<Org | null>(null);

  useEffect(() => {
    apiFetch<Org>('/organizations/current')
      .then(setOrg)
      .catch(() => setOrg(null));
  }, []);

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-6 print:hidden">
      <div className="text-sm font-medium text-gray-700">{org?.name ?? ' '}</div>
      <div className="flex items-center gap-3">
        <NotificationBell />
        {org && (
          <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-500">
            {org.baseCurrency}
          </span>
        )}
        <button
          onClick={() => logout()}
          className="text-sm text-gray-500 transition hover:text-gray-900"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
