import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { requireUserId } from '../common/context/request-context';

export interface NotificationInput {
  organizationId: string;
  userId: string;
  type: string;
  title: string;
  body?: string;
  relatedType?: string;
  relatedId?: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ---- read side (current user) ----

  async list(params: { unreadOnly?: boolean; page?: number; limit?: number }) {
    const userId = requireUserId();
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 20));
    const where: Record<string, unknown> = { userId };
    if (params.unreadOnly) where.readAt = null;

    const [rows, total, unread] = await Promise.all([
      this.prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return {
      data: rows.map((n) => ({
        id: n.id, type: n.type, title: n.title, body: n.body,
        relatedType: n.relatedType, relatedId: n.relatedId,
        read: n.readAt != null, createdAt: n.createdAt,
      })),
      unread,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  async unreadCount() {
    return { unread: await this.prisma.notification.count({ where: { userId: requireUserId(), readAt: null } }) };
  }

  async markRead(id: string) {
    await this.prisma.notification.updateMany({ where: { id, userId: requireUserId(), readAt: null }, data: { readAt: new Date() } });
    return { ok: true };
  }

  async markAllRead() {
    await this.prisma.notification.updateMany({ where: { userId: requireUserId(), readAt: null }, data: { readAt: new Date() } });
    return { ok: true };
  }

  // ---- write side (called by the event listener) ----

  async notify(input: NotificationInput): Promise<void> {
    try {
      await this.prisma.notification.create({
        data: {
          organizationId: input.organizationId,
          userId: input.userId,
          type: input.type,
          title: input.title,
          body: input.body ?? null,
          relatedType: input.relatedType ?? null,
          relatedId: input.relatedId ?? null,
        },
      });
    } catch (err) {
      this.logger.error(`Failed to create notification "${input.type}"`, err as Error);
    }
  }

  /** Notify every active user holding a given role (excluding one user). */
  async notifyRole(
    organizationId: string,
    roleKey: string,
    exclude: string | null,
    payload: Omit<NotificationInput, 'organizationId' | 'userId'>,
  ): Promise<void> {
    const userRoles = await this.prisma.userRole.findMany({
      where: { role: { organizationId, key: roleKey } },
      select: { userId: true },
    });
    const recipients = [...new Set(userRoles.map((r) => r.userId))].filter((id) => id !== exclude);
    await Promise.all(recipients.map((userId) => this.notify({ organizationId, userId, ...payload })));
  }
}
