import { DomainEvent } from '@crm/shared';

/** Curated, user-facing automation triggers (a subset of domain events). */
export const AUTOMATION_TRIGGERS: { event: string; label: string }[] = [
  { event: DomainEvent.LEAD_CREATED, label: 'Lead created' },
  { event: DomainEvent.LEAD_ASSIGNED, label: 'Lead assigned' },
  { event: DomainEvent.LEAD_CONVERTED, label: 'Lead converted' },
  { event: DomainEvent.OPPORTUNITY_CREATED, label: 'Opportunity created' },
  { event: DomainEvent.OPPORTUNITY_WON, label: 'Opportunity won' },
  { event: DomainEvent.OPPORTUNITY_LOST, label: 'Opportunity lost' },
  { event: DomainEvent.QUOTATION_SUBMITTED, label: 'Quotation submitted for approval' },
  { event: DomainEvent.QUOTATION_APPROVED, label: 'Quotation approved' },
  { event: DomainEvent.QUOTATION_ACCEPTED, label: 'Quotation accepted' },
  { event: DomainEvent.SALES_ORDER_CREATED, label: 'Sales order created' },
  { event: DomainEvent.INVOICE_ISSUED, label: 'Invoice issued' },
  { event: DomainEvent.PAYMENT_RECORDED, label: 'Payment recorded' },
];

export const TRIGGER_EVENTS = AUTOMATION_TRIGGERS.map((t) => t.event);

export const ACTION_TYPES = ['notify_role', 'create_activity', 'webhook'] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export const ACTIVITY_RELATED = ['lead', 'account', 'contact', 'opportunity'];
