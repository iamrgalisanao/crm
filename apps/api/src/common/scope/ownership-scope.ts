import { RoleKey } from '@crm/shared';
import {
  requireOrgId,
  currentUserId,
  currentRoleKeys,
  isSuperAdmin,
} from '../context/request-context';

/**
 * Data-scoping rule (Phase 0 §11). Sales representatives see only records they
 * own; every broader role (admin, manager, finance, approver, viewer) and super
 * admins see the whole organization. Team-level scoping arrives with the Teams
 * feature — the seam is here.
 */
const BROAD_ROLES: string[] = [
  RoleKey.SUPER_ADMIN,
  RoleKey.ADMIN,
  RoleKey.SALES_MANAGER,
  RoleKey.FINANCE,
  RoleKey.APPROVER,
  RoleKey.VIEWER,
];

/** True when the current user should be limited to records they own. */
export function isOwnScoped(): boolean {
  if (isSuperAdmin()) return false;
  const roles = currentRoleKeys();
  const hasBroad = BROAD_ROLES.some((r) => roles.has(r));
  return !hasBroad && roles.has(RoleKey.SALES_REP);
}

/**
 * Returns a Prisma `where` fragment that enforces tenant + ownership scope.
 * `ownerField` is the column holding the owning user id (default `ownerId`).
 */
export function scopedWhere(ownerField = 'ownerId'): Record<string, unknown> {
  const where: Record<string, unknown> = { organizationId: requireOrgId() };
  if (isOwnScoped()) {
    where[ownerField] = currentUserId();
  }
  return where;
}

/** Whether the current user may read/write a record with the given owner. */
export function canAccessOwned(ownerId: string | null): boolean {
  if (!isOwnScoped()) return true;
  return ownerId === currentUserId();
}
