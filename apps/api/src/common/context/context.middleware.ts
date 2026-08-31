import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { runWithContext, RequestContext } from './request-context';

/**
 * Establishes the AsyncLocalStorage request context at the very start of the
 * request so it propagates through guards, services and the response. The
 * JwtAuthGuard mutates this same object once the user is authenticated.
 */
@Injectable()
export class ContextMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    const ctx: RequestContext = {
      organizationId: null,
      userId: null,
      permissions: new Set<string>(),
      roleKeys: new Set<string>(),
      isSuperAdmin: false,
      ip: req.ip ?? req.socket?.remoteAddress ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    };
    runWithContext(ctx, () => next());
  }
}
