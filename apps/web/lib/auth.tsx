'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from 'react';
import { apiFetch, setAccessToken } from './api';

export interface AuthUser {
  userId: string;
  organizationId: string;
  isSuperAdmin: boolean;
  permissions: string[];
}

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginDemo: () => Promise<void>;
  logout: () => Promise<void>;
  can: (permission: string) => boolean;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Attempt to restore a session on mount (refresh cookie → new access token).
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await apiFetch<{ accessToken: string; user: AuthUser }>('/auth/refresh', {
          method: 'POST',
          retry: false,
        });
        setAccessToken(data.accessToken);
        if (active) setUser(data.user);
      } catch {
        if (active) setUser(null);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiFetch<{ accessToken: string; user: AuthUser }>('/auth/login', {
      method: 'POST',
      body: { email, password },
      retry: false,
    });
    setAccessToken(data.accessToken);
    setUser(data.user);
  }, []);

  const loginDemo = useCallback(async () => {
    const data = await apiFetch<{ accessToken: string; user: AuthUser }>('/auth/demo-login', {
      method: 'POST',
      body: {},
      retry: false,
    });
    setAccessToken(data.accessToken);
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST', retry: false });
    } catch {
      /* ignore */
    }
    setAccessToken(null);
    setUser(null);
  }, []);

  const can = useCallback(
    (permission: string) => !!user && (user.isSuperAdmin || user.permissions.includes(permission)),
    [user],
  );

  return (
    <AuthContext.Provider value={{ user, loading, login, loginDemo, logout, can }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
