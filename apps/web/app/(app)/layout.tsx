'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../lib/auth';
import { Sidebar } from '../../components/sidebar';
import { Topbar } from '../../components/topbar';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="flex h-screen items-center justify-center text-gray-400">Loading…</div>
    );
  }

  return (
    <div className="flex h-screen print:block print:h-auto">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden print:overflow-visible">
        <Topbar />
        <main className="flex-1 overflow-y-auto p-6 print:overflow-visible print:p-0">{children}</main>
      </div>
    </div>
  );
}
