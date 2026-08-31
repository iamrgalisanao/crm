import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { getContext } from '../context/request-context';

export interface AuditInput {
  action: string;
  entityType: string;
  entityId?: string | null;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  // Overrides — normally taken from the request context.
  organizationId?: string;
  actorId?: string | null;
}

/**
 * Append-only audit trail (Phase 0 §21). Services call `record()` on meaningful
 * mutations. Actor/org/ip are pulled from the request context by default so
 * callers only pass what changed.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(input: AuditInput): Promise<void> {
    const ctx = getContext();
    const organizationId = input.organizationId ?? ctx?.organizationId ?? undefined;
    if (!organizationId) {
      this.logger.warn(`Skipping audit "${input.action}" — no organization in context`);
      return;
    }
    try {
      await this.prisma.auditLog.create({
        data: {
          organizationId,
          actorId: input.actorId !== undefined ? input.actorId : ctx?.userId ?? null,
          action: input.action,
          entityType: input.entityType,
          entityId: input.entityId ?? null,
          oldValues: (input.oldValues as any) ?? undefined,
          newValues: (input.newValues as any) ?? undefined,
          ip: ctx?.ip ?? null,
          userAgent: ctx?.userAgent ?? null,
        },
      });
    } catch (err) {
      // Audit must never break the business operation; log and continue.
      this.logger.error(`Failed to write audit log for ${input.action}`, err as Error);
    }
  }
}
