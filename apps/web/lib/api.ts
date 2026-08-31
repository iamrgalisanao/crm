const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
  if (typeof window !== 'undefined') {
    if (token) localStorage.setItem('crm_access', token);
    else localStorage.removeItem('crm_access');
  }
}

export function getAccessToken(): string | null {
  if (accessToken) return accessToken;
  if (typeof window !== 'undefined') {
    accessToken = localStorage.getItem('crm_access');
  }
  return accessToken;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  retry?: boolean;
}

async function raw(path: string, options: RequestOptions = {}): Promise<Response> {
  const headers = new Headers(options.headers);
  const token = getAccessToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');

  return fetch(`${API_URL}/api${path}`, {
    ...options,
    headers,
    credentials: 'include',
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
}

/** Fetch JSON with automatic one-shot refresh on 401. */
export async function apiFetch<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  let res = await raw(path, options);

  if (res.status === 401 && options.retry !== false && path !== '/auth/refresh') {
    const refreshed = await tryRefresh();
    if (refreshed) {
      res = await raw(path, { ...options, retry: false });
    }
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message = data?.message
      ? Array.isArray(data.message)
        ? data.message.join(', ')
        : data.message
      : res.statusText;
    throw new ApiError(res.status, message);
  }
  return data as T;
}

async function tryRefresh(): Promise<boolean> {
  try {
    const res = await raw('/auth/refresh', { method: 'POST', retry: false });
    if (!res.ok) return false;
    const data = await res.json();
    setAccessToken(data.accessToken);
    return true;
  } catch {
    return false;
  }
}
