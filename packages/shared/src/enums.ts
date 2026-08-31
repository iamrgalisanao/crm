/**
 * Canonical status enums and state-machine transition tables (Phase 0 §7).
 * The API service layer is the authority: it must reject any transition not
 * listed here. Shared with the web app for display/labels.
 */

export const LeadStatus = {
  NEW: 'new',
  CONTACTED: 'contacted',
  ATTEMPTING_CONTACT: 'attempting_contact',
  QUALIFIED: 'qualified',
  UNQUALIFIED: 'unqualified',
  CONVERTED: 'converted',
  LOST: 'lost',
  SPAM: 'spam',
} as const;
export type LeadStatus = (typeof LeadStatus)[keyof typeof LeadStatus];

export const OpportunityStatus = {
  OPEN: 'open',
  WON: 'won',
  LOST: 'lost',
} as const;
export type OpportunityStatus = (typeof OpportunityStatus)[keyof typeof OpportunityStatus];

export const QuotationStatus = {
  DRAFT: 'draft',
  FOR_APPROVAL: 'for_approval',
  APPROVED: 'approved',
  SENT: 'sent',
  VIEWED: 'viewed',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
} as const;
export type QuotationStatus = (typeof QuotationStatus)[keyof typeof QuotationStatus];

export const SalesOrderStatus = {
  DRAFT: 'draft',
  CONFIRMED: 'confirmed',
  IN_FULFILLMENT: 'in_fulfillment',
  FULFILLED: 'fulfilled',
  CANCELLED: 'cancelled',
} as const;
export type SalesOrderStatus = (typeof SalesOrderStatus)[keyof typeof SalesOrderStatus];

export const InvoiceStatus = {
  DRAFT: 'draft',
  ISSUED: 'issued',
  SENT: 'sent',
  PARTIALLY_PAID: 'partially_paid',
  PAID: 'paid',
  OVERDUE: 'overdue',
  VOID: 'void',
  CANCELLED: 'cancelled',
} as const;
export type InvoiceStatus = (typeof InvoiceStatus)[keyof typeof InvoiceStatus];

export const ActivityType = {
  CALL: 'call',
  EMAIL: 'email',
  MEETING: 'meeting',
  DEMO: 'demo',
  FOLLOWUP: 'followup',
  TASK: 'task',
  NOTE: 'note',
  SITE_VISIT: 'site_visit',
  OTHER: 'other',
} as const;
export type ActivityType = (typeof ActivityType)[keyof typeof ActivityType];

export const ActivityStatus = {
  OPEN: 'open',
  DONE: 'done',
  CANCELLED: 'cancelled',
} as const;
export type ActivityStatus = (typeof ActivityStatus)[keyof typeof ActivityStatus];

/** Entities an activity can attach to. Opportunities join in their sprint. */
export const ActivityRelatedType = {
  LEAD: 'lead',
  ACCOUNT: 'account',
  CONTACT: 'contact',
  OPPORTUNITY: 'opportunity',
} as const;
export type ActivityRelatedType =
  (typeof ActivityRelatedType)[keyof typeof ActivityRelatedType];

export const ProductType = {
  PRODUCT: 'product',
  SERVICE: 'service',
  SUBSCRIPTION: 'subscription',
  CUSTOM: 'custom',
} as const;
export type ProductType = (typeof ProductType)[keyof typeof ProductType];

export const PaymentMethod = {
  CASH: 'cash',
  BANK_TRANSFER: 'bank_transfer',
  GCASH: 'gcash',
  MAYA: 'maya',
  CHECK: 'check',
  CREDIT_CARD: 'credit_card',
  OTHER: 'other',
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

/** Default loss reasons for lost-opportunity analysis (Phase 0 §18). */
export const LOSS_REASONS = [
  'Price',
  'Competitor',
  'No Budget',
  'No Decision',
  'Requirements Changed',
  'Timing',
  'Lost Contact',
  'Poor Fit',
  'Internal Cancellation',
  'Other',
] as const;
export type LossReason = (typeof LOSS_REASONS)[number];

/** Generic transition table type. */
export type Transitions<T extends string> = Record<T, readonly T[]>;

export const LEAD_TRANSITIONS: Transitions<LeadStatus> = {
  new: ['contacted', 'attempting_contact', 'qualified', 'unqualified', 'lost', 'spam'],
  contacted: ['attempting_contact', 'qualified', 'unqualified', 'lost', 'spam'],
  attempting_contact: ['contacted', 'qualified', 'unqualified', 'lost', 'spam'],
  qualified: ['converted', 'unqualified', 'lost'],
  unqualified: [],
  converted: [],
  lost: [],
  spam: [],
};

export const OPPORTUNITY_TRANSITIONS: Transitions<OpportunityStatus> = {
  open: ['won', 'lost'],
  won: [],
  lost: [],
};

export const QUOTATION_TRANSITIONS: Transitions<QuotationStatus> = {
  draft: ['for_approval', 'cancelled'],
  for_approval: ['approved', 'rejected', 'cancelled'],
  approved: ['sent', 'cancelled'],
  sent: ['viewed', 'accepted', 'rejected', 'expired', 'cancelled'],
  viewed: ['accepted', 'rejected', 'expired', 'cancelled'],
  accepted: [],
  rejected: [],
  expired: [],
  cancelled: [],
};

export const SALES_ORDER_TRANSITIONS: Transitions<SalesOrderStatus> = {
  draft: ['confirmed', 'cancelled'],
  confirmed: ['in_fulfillment', 'fulfilled', 'cancelled'],
  in_fulfillment: ['fulfilled', 'cancelled'],
  fulfilled: [],
  cancelled: [],
};

export const INVOICE_TRANSITIONS: Transitions<InvoiceStatus> = {
  draft: ['issued', 'void', 'cancelled'],
  issued: ['sent', 'void', 'cancelled'],
  sent: ['partially_paid', 'paid', 'overdue', 'void'],
  partially_paid: ['paid', 'overdue', 'void'],
  overdue: ['partially_paid', 'paid', 'void'],
  paid: [],
  void: [],
  cancelled: [],
};

export function canTransition<T extends string>(
  table: Transitions<T>,
  from: T,
  to: T,
): boolean {
  const allowed = table[from];
  return Array.isArray(allowed) && allowed.includes(to);
}
