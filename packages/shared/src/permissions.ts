/**
 * RBAC permission keys and the default role → permission mapping (Phase 0 §11).
 * `packages/shared` is the single source of truth; the API seed writes these
 * into the database and the PermissionsGuard enforces them.
 *
 * Data scoping (own / team / org) is orthogonal to these capability keys and is
 * enforced separately in the service layer using the request tenant context.
 */

export const RoleKey = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  SALES_MANAGER: 'sales_manager',
  SALES_REP: 'sales_rep',
  FINANCE: 'finance',
  APPROVER: 'approver',
  VIEWER: 'viewer',
} as const;
export type RoleKey = (typeof RoleKey)[keyof typeof RoleKey];

/** Capability keys: `<domain>.<action>`. */
export const Permission = {
  // Platform / admin
  SETTINGS_MANAGE: 'settings.manage',
  USERS_MANAGE: 'users.manage',
  ROLES_MANAGE: 'roles.manage',
  INTEGRATIONS_MANAGE: 'integrations.manage',
  AUDIT_VIEW: 'audit.view',

  // Leads
  LEADS_VIEW: 'leads.view',
  LEADS_CREATE: 'leads.create',
  LEADS_EDIT: 'leads.edit',
  LEADS_DELETE: 'leads.delete',
  LEADS_ASSIGN: 'leads.assign',
  LEADS_IMPORT: 'leads.import',
  LEADS_EXPORT: 'leads.export',

  // Accounts & contacts
  ACCOUNTS_VIEW: 'accounts.view',
  ACCOUNTS_CREATE: 'accounts.create',
  ACCOUNTS_EDIT: 'accounts.edit',
  ACCOUNTS_DELETE: 'accounts.delete',
  CONTACTS_VIEW: 'contacts.view',
  CONTACTS_CREATE: 'contacts.create',
  CONTACTS_EDIT: 'contacts.edit',

  // Opportunities
  OPPORTUNITIES_VIEW: 'opportunities.view',
  OPPORTUNITIES_CREATE: 'opportunities.create',
  OPPORTUNITIES_EDIT: 'opportunities.edit',
  OPPORTUNITIES_ASSIGN: 'opportunities.assign',

  // Activities
  ACTIVITIES_VIEW: 'activities.view',
  ACTIVITIES_CREATE: 'activities.create',
  ACTIVITIES_EDIT: 'activities.edit',

  // Catalog
  PRODUCTS_VIEW: 'products.view',
  PRODUCTS_MANAGE: 'products.manage',

  // Quotations
  QUOTATIONS_VIEW: 'quotations.view',
  QUOTATIONS_CREATE: 'quotations.create',
  QUOTATIONS_EDIT: 'quotations.edit',
  QUOTATIONS_SUBMIT: 'quotations.submit',
  QUOTATIONS_APPROVE: 'quotations.approve',

  // Commerce
  SALES_ORDERS_VIEW: 'sales_orders.view',
  SALES_ORDERS_MANAGE: 'sales_orders.manage',
  INVOICES_VIEW: 'invoices.view',
  INVOICES_MANAGE: 'invoices.manage',
  PAYMENTS_VIEW: 'payments.view',
  PAYMENTS_RECORD: 'payments.record',

  // Analytics
  REPORTS_VIEW: 'reports.view',
  DASHBOARD_VIEW: 'dashboard.view',
} as const;
export type Permission = (typeof Permission)[keyof typeof Permission];

export const ALL_PERMISSIONS: Permission[] = Object.values(Permission);

const P = Permission;

/** Default capability grants per role (scope handled separately in services). */
export const ROLE_PERMISSIONS: Record<RoleKey, Permission[]> = {
  super_admin: ALL_PERMISSIONS,
  admin: ALL_PERMISSIONS,
  sales_manager: [
    P.DASHBOARD_VIEW, P.REPORTS_VIEW, P.AUDIT_VIEW,
    P.LEADS_VIEW, P.LEADS_CREATE, P.LEADS_EDIT, P.LEADS_ASSIGN, P.LEADS_EXPORT, P.LEADS_IMPORT,
    P.ACCOUNTS_VIEW, P.ACCOUNTS_CREATE, P.ACCOUNTS_EDIT,
    P.CONTACTS_VIEW, P.CONTACTS_CREATE, P.CONTACTS_EDIT,
    P.OPPORTUNITIES_VIEW, P.OPPORTUNITIES_CREATE, P.OPPORTUNITIES_EDIT, P.OPPORTUNITIES_ASSIGN,
    P.ACTIVITIES_VIEW, P.ACTIVITIES_CREATE, P.ACTIVITIES_EDIT,
    P.PRODUCTS_VIEW,
    P.QUOTATIONS_VIEW, P.QUOTATIONS_CREATE, P.QUOTATIONS_EDIT, P.QUOTATIONS_SUBMIT, P.QUOTATIONS_APPROVE,
    P.SALES_ORDERS_VIEW, P.INVOICES_VIEW, P.PAYMENTS_VIEW,
  ],
  sales_rep: [
    P.DASHBOARD_VIEW, P.REPORTS_VIEW,
    P.LEADS_VIEW, P.LEADS_CREATE, P.LEADS_EDIT,
    P.ACCOUNTS_VIEW, P.ACCOUNTS_CREATE, P.ACCOUNTS_EDIT,
    P.CONTACTS_VIEW, P.CONTACTS_CREATE, P.CONTACTS_EDIT,
    P.OPPORTUNITIES_VIEW, P.OPPORTUNITIES_CREATE, P.OPPORTUNITIES_EDIT,
    P.ACTIVITIES_VIEW, P.ACTIVITIES_CREATE, P.ACTIVITIES_EDIT,
    P.PRODUCTS_VIEW,
    P.QUOTATIONS_VIEW, P.QUOTATIONS_CREATE, P.QUOTATIONS_EDIT, P.QUOTATIONS_SUBMIT,
    P.SALES_ORDERS_VIEW, P.INVOICES_VIEW, P.PAYMENTS_VIEW,
  ],
  finance: [
    P.DASHBOARD_VIEW, P.REPORTS_VIEW,
    P.ACCOUNTS_VIEW, P.CONTACTS_VIEW, P.OPPORTUNITIES_VIEW, P.PRODUCTS_VIEW,
    P.QUOTATIONS_VIEW,
    P.SALES_ORDERS_VIEW, P.SALES_ORDERS_MANAGE,
    P.INVOICES_VIEW, P.INVOICES_MANAGE,
    P.PAYMENTS_VIEW, P.PAYMENTS_RECORD,
  ],
  approver: [
    P.DASHBOARD_VIEW,
    P.QUOTATIONS_VIEW, P.QUOTATIONS_APPROVE,
    P.OPPORTUNITIES_VIEW, P.PRODUCTS_VIEW,
  ],
  viewer: [
    P.DASHBOARD_VIEW, P.REPORTS_VIEW,
    P.LEADS_VIEW, P.ACCOUNTS_VIEW, P.CONTACTS_VIEW,
    P.OPPORTUNITIES_VIEW, P.ACTIVITIES_VIEW, P.PRODUCTS_VIEW,
    P.QUOTATIONS_VIEW, P.SALES_ORDERS_VIEW, P.INVOICES_VIEW, P.PAYMENTS_VIEW,
  ],
};

export const ROLE_LABELS: Record<RoleKey, string> = {
  super_admin: 'Super Admin',
  admin: 'Administrator',
  sales_manager: 'Sales Manager',
  sales_rep: 'Sales Representative',
  finance: 'Finance',
  approver: 'Approver',
  viewer: 'Viewer / Management',
};
