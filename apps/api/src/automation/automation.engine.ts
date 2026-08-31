import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as crypto from 'node:crypto';
import { DomainEventPayload } from '@crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TRIGGER_EVENTS, ACTIVITY_RELATED } from './triggers';

interface Condition { path: string; op: string; value?: any }
interface Action { type: string; config: Record<string, any> }

/**
 * Reacts to domain events by running user-defined automation rules. Runs
 * outside any request context — everything is derived from the event payload,
 * never from the request-scoped tenant context.
 */
@Injectable()
export class AutomationEngine implements OnModuleInit {
  private readonly logger = new Logger(AutomationEngine.name);

  constructor(
    private readonly events: EventEmitter2,
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit() {
    for (const event of TRIGGER_EVENTS) {
      this.events.on(event, (payload: DomainEventPayload) => {
        void this.handle(event, payload);
      });
    }
    this.logger.log(`Automation engine listening on ${TRIGGER_EVENTS.length} triggers`);
  }

  private async handle(event: string, payload: DomainEventPayload) {
    if (!payload?.organizationId) return;
    let rules;
    try {
      rules = await this.prisma.automationRule.findMany({
        where: { organizationId: payload.organizationId, trigger: event, isActive: true },
      });
    } catch (err) {
      this.logger.error('Failed to load automation rules', err as Error);
      return;
    }

    for (const rule of rules) {
      if (!this.matches((rule.conditions as unknown as Condition[]) ?? [], payload)) continue;
      try {
        const detail = await this.runActions((rule.actions as unknown as Action[]) ?? [], payload);
        await this.log(rule.id, event, payload, 'success', detail);
      } catch (err) {
        await this.log(rule.id, event, payload, 'failed', (err as Error).message);
      }
    }
  }

  private matches(conditions: Condition[], payload: DomainEventPayload): boolean {
    return conditions.every((c) => {
      const actual = this.getPath(payload, c.path);
      switch (c.op) {
        case 'exists': return actual != null;
        case 'eq': return actual === c.value;
        case 'neq': return actual !== c.value;
        case 'gte': return Number(actual) >= Number(c.value);
        case 'lte': return Number(actual) <= Number(c.value);
        case 'contains': return String(actual ?? '').toLowerCase().includes(String(c.value).toLowerCase());
        default: return true;
      }
    });
  }

  private async runActions(actions: Action[], payload: DomainEventPayload): Promise<string> {
    const results: string[] = [];
    for (const action of actions) {
      switch (action.type) {
        case 'notify_role':
          await this.notifications.notifyRole(payload.organizationId, action.config.role, null, {
            type: 'automation',
            title: action.config.title || 'Automation',
            body: action.config.body || `${payload.entityType} ${payload.entityId}`,
            relatedType: payload.entityType,
            relatedId: payload.entityId,
          });
          results.push(`notified ${action.config.role}`);
          break;
        case 'create_activity':
          if (ACTIVITY_RELATED.includes(payload.entityType)) {
            await this.prisma.activity.create({
              data: {
                organizationId: payload.organizationId,
                type: action.config.activityType || 'followup',
                subject: action.config.subject || 'Automated follow-up',
                relatedType: payload.entityType,
                relatedId: payload.entityId,
                ownerId: payload.actorId,
                dueDate: new Date(Date.now() + (Number(action.config.dueInDays) || 1) * 86400000),
                createdBy: payload.actorId,
                updatedBy: payload.actorId,
              },
            });
            results.push('activity created');
          } else {
            results.push(`activity skipped (${payload.entityType} not attachable)`);
          }
          break;
        case 'webhook':
          await this.postWebhook(action.config.url, action.config.secret, payload);
          results.push(`webhook → ${action.config.url}`);
          break;
        default:
          results.push(`unknown action ${action.type}`);
      }
    }
    return results.join('; ');
  }

  private async postWebhook(url: string, secret: string | undefined, payload: DomainEventPayload) {
    if (!url) throw new Error('Webhook action missing url');
    const body = JSON.stringify(payload);
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (secret) headers['x-signature'] = crypto.createHmac('sha256', secret).update(body).digest('hex');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(url, { method: 'POST', headers, body, signal: controller.signal });
      if (!res.ok) throw new Error(`Webhook responded ${res.status}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  private getPath(obj: any, path: string): any {
    return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  }

  private async log(ruleId: string, trigger: string, payload: DomainEventPayload, status: string, detail: string) {
    try {
      await this.prisma.automationRun.create({
        data: { organizationId: payload.organizationId, ruleId, trigger, entityId: payload.entityId, status, detail: detail.slice(0, 500) },
      });
    } catch (err) {
      this.logger.error('Failed to log automation run', err as Error);
    }
  }
}
