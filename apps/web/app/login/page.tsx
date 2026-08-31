'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../lib/auth';

// Only set on the public demo instance (build-time env). When present, the login
// page offers a one-click guest sign-in. A real deployment leaves these unset.
const DEMO_EMAIL = process.env.NEXT_PUBLIC_DEMO_EMAIL || '';
const DEMO_PASSWORD = process.env.NEXT_PUBLIC_DEMO_PASSWORD || '';

export default function LoginPage() {
  const { login, user, loading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState(DEMO_EMAIL);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace('/dashboard');
  }, [user, loading, router]);

  async function doLogin(em: string, pw: string) {
    setError(null);
    setSubmitting(true);
    try {
      await login(em, pw);
      router.replace('/dashboard');
    } catch (err: any) {
      setError(err?.message ?? 'Login failed');
      setSubmitting(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    doLogin(email, password);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-gold-300 to-gold-500 text-lg font-black text-brand-900 shadow-sm">
            C
          </div>
          <h1 className="text-xl font-bold tracking-tight text-gray-900">CRM<span className="text-gold-500">.</span>Sales</h1>
          <p className="text-sm text-gray-500">Sign in to your workspace</p>
        </div>

        {DEMO_EMAIL && (
          <div className="mb-4 rounded-xl border border-gold-200 bg-gradient-to-br from-gold-50 to-white p-4 text-center shadow-sm">
            <button
              type="button"
              disabled={submitting}
              onClick={() => doLogin(DEMO_EMAIL, DEMO_PASSWORD)}
              className="w-full rounded-lg bg-gradient-to-br from-gold-300 to-gold-500 py-2.5 text-sm font-semibold text-brand-900 shadow-sm transition hover:from-gold-400 hover:to-gold-600 disabled:opacity-60"
            >
              {submitting ? 'Loading demo…' : '✨ Explore the live demo'}
            </button>
            <p className="mt-2 text-xs text-gray-500">
              Guest access · <span className="font-mono">{DEMO_EMAIL}</span> · resets nightly
            </p>
          </div>
        )}

        {DEMO_EMAIL && (
          <div className="mb-4 flex items-center gap-3 text-xs text-gray-400">
            <span className="h-px flex-1 bg-gray-200" />or sign in manually<span className="h-px flex-1 bg-gray-200" />
          </div>
        )}

        <form
          onSubmit={onSubmit}
          className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
        >
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-brand-500 py-2 text-sm font-medium text-white transition hover:bg-brand-600 disabled:opacity-60"
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
