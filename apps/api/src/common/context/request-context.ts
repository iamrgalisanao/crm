import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Per-request tenant/actor context. Populated by ContextMiddleware after the
 * auth guard resolves the user, and read by services to scope every query by
 * organizationId (Phase 0 tenancy rule) and to attribute audit entries.
 */
export interface RequestContext {
  organizationId: string | null;
  userId: string | null;
  permissions: Set<string>;
  roleKeys: Set<string>;
  isSuperAdmin: boolean;
  ip: string | null;
  userAgent: string | null;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function getContext(): RequestContext | undefined {
  return storage.getStore();
}

/** Throws if there is no tenant on the context — use in tenant-scoped services. */
export function requireOrgId(): string {
  const ctx = storage.getStore();
  if (!ctx?.organizationId) {
    throw new Error('No organization in request context');
  }
  return ctx.organizationId;
}

export function currentUserId(): string | null {
  return storage.getStore()?.userId ?? null;
}

/** Throws if there is no authenticated user — use in user-scoped services. */
export function requireUserId(): string {
  const uid = storage.getStore()?.userId;
  if (!uid) throw new Error('No authenticated user in request context');
  return uid;
}

export function currentRoleKeys(): Set<string> {
  return storage.getStore()?.roleKeys ?? new Set<string>();
}

export function isSuperAdmin(): boolean {
  return storage.getStore()?.isSuperAdmin ?? false;
}
