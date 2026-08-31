'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { PAGE } from '../../../lib/ui';

interface UserRow {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: string;
  roles: { key: string; name: string }[];
  lastLoginAt: string | null;
}

export default function UsersPage() {
  const { can } = useAuth();
  const [rows, setRows] = useState<UserRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<UserRow[]>('/users')
      .then(setRows)
      .catch((e: ApiError) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (!can('users.manage')) {
    return <div className="text-sm text-gray-500">You don’t have access to user management.</div>;
  }

  return (
    <div className={PAGE.wide}>
      <h1 className="text-2xl font-semibold text-gray-900">Users</h1>
      <p className="mt-1 text-sm text-gray-500">Team members in this organization.</p>

      <div className="mt-6 overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium">Email</th>
              <th className="px-4 py-2.5 font-medium">Roles</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-gray-400">
                  Loading…
                </td>
              </tr>
            )}
            {error && !loading && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-red-600">
                  {error}
                </td>
              </tr>
            )}
            {!loading &&
              !error &&
              rows.map((u) => (
                <tr key={u.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-2.5 font-medium text-gray-900">
                    {u.firstName} {u.lastName}
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">{u.email}</td>
                  <td className="px-4 py-2.5 text-gray-600">
                    {u.roles.map((r) => r.name).join(', ') || '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-700">
                      {u.status}
                    </span>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
