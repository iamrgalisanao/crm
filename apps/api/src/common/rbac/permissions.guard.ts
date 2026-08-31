import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from './permissions.decorator';
import type { AuthUser } from '../decorators/current-user.decorator';

/**
 * Capability check (Phase 0 §11). Runs after JwtAuthGuard. Super admins bypass;
 * otherwise the user must hold every permission listed by @RequirePermissions.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user: AuthUser | undefined = request.user;
    if (!user) throw new ForbiddenException('Not authenticated');
    if (user.isSuperAdmin) return true;

    const held = new Set(user.permissions);
    const missing = required.filter((p) => !held.has(p));
    if (missing.length > 0) {
      throw new ForbiddenException(`Missing permission(s): ${missing.join(', ')}`);
    }
    return true;
  }
}
