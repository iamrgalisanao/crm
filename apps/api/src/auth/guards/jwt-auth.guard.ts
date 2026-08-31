import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { getContext } from '../../common/context/request-context';
import type { AuthUser } from '../../common/decorators/current-user.decorator';

/**
 * Global authentication guard. Skips routes marked @Public. On success it hydrates
 * the AsyncLocalStorage request context with the resolved tenant/actor so services
 * and the audit trail can scope by organization without threading params through.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const ok = (await super.canActivate(context)) as boolean;
    if (ok) {
      const request = context.switchToHttp().getRequest();
      const user: AuthUser = request.user;
      const ctx = getContext();
      if (ctx && user) {
        ctx.organizationId = user.organizationId;
        ctx.userId = user.userId;
        ctx.isSuperAdmin = user.isSuperAdmin;
        ctx.permissions = new Set(user.permissions);
        ctx.roleKeys = new Set(user.roleKeys);
      }
    }
    return ok;
  }
}
