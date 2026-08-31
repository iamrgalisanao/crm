/**
 * Domain event names emitted across module boundaries (Phase 0 §3). Audit,
 * Notifications, AI and Forecast subscribe to these. Keeping the catalog here
 * means producers and consumers can never drift on the string.
 */

export const DomainEvent = {
  // Auth / users
  USER_LOGGED_IN: 'user.logged_in',
  USER_CREATED: 'user.created',

  // Leads
  LEAD_CREATED: 'lead.created',
  LEAD_ASSIGNED: 'lead.assigned',
  LEAD_STATUS_CHANGED: 'lead.status_changed',
  LEAD_CONVERTED: 'lead.converted',

  // Opportunities
  OPPORTUNITY_CREATED: 'opportunity.created',
  OPPORTUNITY_STAGE_CHANGED: 'opportunity.stage_changed',
  OPPORTUNITY_WON: 'opportunity.won',
  OPPORTUNITY_LOST: 'opportunity.lost',

  // Quotations / approvals
  QUOTATION_SUBMITTED: 'quotation.submitted',
  QUOTATION_APPROVED: 'quotation.approved',
  QUOTATION_REJECTED: 'quotation.rejected',
  QUOTATION_ACCEPTED: 'quotation.accepted',

  // Commerce
  SALES_ORDER_CREATED: 'sales_order.created',
  INVOICE_ISSUED: 'invoice.issued',
  INVOICE_OVERDUE: 'invoice.overdue',
  PAYMENT_RECORDED: 'payment.recorded',
} as const;
export type DomainEvent = (typeof DomainEvent)[keyof typeof DomainEvent];

export interface DomainEventPayload<T = unknown> {
  organizationId: string;
  actorId: string | null;
  entityType: string;
  entityId: string;
  data?: T;
  at: string; // ISO timestamp
}
