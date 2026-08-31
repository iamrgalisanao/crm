'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavItem {
  label: string;
  href?: string;
  soon?: boolean;
}
interface NavGroup {
  title: string;
  items: NavItem[];
}

// Full Phase 0 navigation. Items without a route are stubbed as "soon" until
// their sprint lands, so the shell shows the whole product map from day one.
const NAV: NavGroup[] = [
  { title: '', items: [{ label: 'Dashboard', href: '/dashboard' }] },
  {
    title: 'Sales',
    items: [
      { label: 'Leads', href: '/leads' },
      { label: 'Inbox', href: '/leads/inbox' },
      { label: 'Accounts', href: '/accounts' },
      { label: 'Contacts', href: '/contacts' },
      { label: 'Opportunities', href: '/opportunities' },
      { label: 'Activities', href: '/activities' },
    ],
  },
  {
    title: 'Commerce',
    items: [
      { label: 'Quotations', href: '/quotations' },
      { label: 'Sales Orders', href: '/sales-orders' },
      { label: 'Invoices', href: '/invoices' },
      { label: 'Payments', href: '/payments' },
    ],
  },
  { title: 'Catalog', items: [{ label: 'Products', href: '/products' }] },
  {
    title: 'Analytics',
    items: [
      { label: 'Pipeline', href: '/opportunities/pipeline' },
      { label: 'Forecast', soon: true },
      { label: 'Reports', href: '/reports' },
    ],
  },
  {
    title: 'Automation',
    items: [
      { label: 'Workflows', href: '/settings/automation' },
      { label: 'Integrations', href: '/settings/integrations' },
    ],
  },
  {
    title: 'Administration',
    items: [
      { label: 'Users', href: '/users' },
      { label: 'Import / Export', href: '/import-export' },
      { label: 'Roles', soon: true },
      { label: 'Settings', soon: true },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-gray-200 bg-white print:hidden">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-gold-300 to-gold-500 text-base font-black text-brand-900 shadow-sm">
          C
        </div>
        <span className="text-[15px] font-bold tracking-tight text-brand-900">CRM<span className="text-gold-500">.</span>Sales</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-2">
        {NAV.map((group, i) => (
          <div key={i} className="mb-4">
            {group.title && (
              <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                {group.title}
              </div>
            )}
            {group.items.map((item) => {
              const active =
                item.href &&
                (pathname === item.href || pathname.startsWith(item.href + '/'));
              if (item.soon) {
                return (
                  <div
                    key={item.label}
                    className="flex items-center justify-between rounded-lg px-3 py-1.5 text-sm text-gray-300"
                  >
                    {item.label}
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-400">
                      soon
                    </span>
                  </div>
                );
              }
              return (
                <Link
                  key={item.label}
                  href={item.href!}
                  className={`block rounded-lg px-3 py-1.5 text-sm transition ${
                    active
                      ? 'bg-gold-100 font-semibold text-gold-800'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
