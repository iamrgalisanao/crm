import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@crm/shared';

export const PERMISSIONS_KEY = 'requiredPermissions';

/**
 * Guards a route by capability key(s). The user must hold ALL listed
 * permissions (super admins bypass). Data scoping (own/team/org) is enforced
 * separately in the service layer.
 */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
