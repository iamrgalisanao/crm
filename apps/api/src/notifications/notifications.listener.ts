import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DomainEvent, DomainEventPayload } from '@crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';

/**
 * Translates domain events into in-app notifications. Handlers are best-effort
 * and never throw into the emitter — a failed notification must not break the
 * business action that triggered it.
 */
@Injectable()
export class NotificationsListener {
  private readonly logger = new Logger(NotificationsListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @OnEvent(DomainEvent.LEAD_ASSIGNED)
  async onLeadAssigned(e: DomainEventPayload<{ assignedUserId: string }>) {
    await this.safe(async () => {
      const assignee = e.data?.assignedUserId;
      if (!assignee || assignee === e.actorId) return;
      const lead = await this.prisma.lead.findUnique({ where: { id: e.entityId }, select: { name: true, leadNo: true } });
      if (!lead) return;
      await this.notifications.notify({
        organizationId: e.organizationId, userId: assignee, type: 'lead.assigned',
        title: 'New lead assigned to you', body: `${lead.name} (${lead.leadNo})`,
        relatedType: 'lead', relatedId: e.entityId,
      });
    });
  }

  @OnEvent(DomainEvent.QUOTATION_SUBMITTED)
  async onQuotationSubmitted(e: DomainEventPayload) {
    await this.safe(async () => {
      const quote = await this.prisma.quotation.findUnique({
        where: { id: e.entityId },
        select: { quoteNo: true, approvals: { where: { decision: 'pending' }, orderBy: { tier: 'asc' }, take: 1 } },
      });
      const tier = quote?.approvals[0];
      if (!quote || !tier) return;
      await this.notifications.notifyRole(e.organizationId, tier.requiredRole, e.actorId, {
        type: 'quotation.submitted', title: 'Quotation needs your approval', body: quote.quoteNo,
        relatedType: 'quotation', relatedId: e.entityId,
      });
    });
  }

  @OnEvent(DomainEvent.QUOTATION_APPROVED)
  async onQuotationApproved(e: DomainEventPayload) {
    await this.notifyQuoteOwner(e, 'quotation.approved', 'Quotation approved', (no) => `${no} is fully approved`);
  }

  @OnEvent(DomainEvent.QUOTATION_REJECTED)
  async onQuotationRejected(e: DomainEventPayload<{ reason?: string }>) {
    await this.notifyQuoteOwner(e, 'quotation.rejected', 'Quotation returned for revision', (no) => `${no}${e.data?.reason ? ` — ${e.data.reason}` : ''}`);
  }

  @OnEvent(DomainEvent.OPPORTUNITY_WON)
  async onOpportunityWon(e: DomainEventPayload) {
    await this.safe(async () => {
      const opp = await this.prisma.opportunity.findUnique({ where: { id: e.entityId }, select: { name: true, ownerId: true } });
      if (!opp?.ownerId || opp.ownerId === e.actorId) return;
      await this.notifications.notify({
        organizationId: e.organizationId, userId: opp.ownerId, type: 'opportunity.won',
        title: 'Opportunity won 🎉', body: opp.name, relatedType: 'opportunity', relatedId: e.entityId,
      });
    });
  }

  @OnEvent(DomainEvent.PAYMENT_RECORDED)
  async onPaymentRecorded(e: DomainEventPayload) {
    await this.safe(async () => {
      const payment = await this.prisma.payment.findUnique({
        where: { id: e.entityId },
        select: { amount: true, currency: true, invoice: { select: { invoiceNo: true, ownerId: true, id: true } } },
      });
      const inv = payment?.invoice;
      if (!inv?.ownerId || inv.ownerId === e.actorId) return;
      await this.notifications.notify({
        organizationId: e.organizationId, userId: inv.ownerId, type: 'payment.recorded',
        title: 'Payment received', body: `on ${inv.invoiceNo}`, relatedType: 'invoice', relatedId: inv.id,
      });
    });
  }

  private async notifyQuoteOwner(e: DomainEventPayload, type: string, title: string, body: (quoteNo: string) => string) {
    await this.safe(async () => {
      const quote = await this.prisma.quotation.findUnique({ where: { id: e.entityId }, select: { quoteNo: true, ownerId: true } });
      if (!quote?.ownerId || quote.ownerId === e.actorId) return;
      await this.notifications.notify({
        organizationId: e.organizationId, userId: quote.ownerId, type, title, body: body(quote.quoteNo),
        relatedType: 'quotation', relatedId: e.entityId,
      });
    });
  }

  private async safe(fn: () => Promise<void>) {
    try { await fn(); } catch (err) { this.logger.error('Notification handler failed', err as Error); }
  }
}
