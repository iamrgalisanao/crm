/**
 * DEMO seed — wipes the database and loads a rich, realistic dataset so every
 * screen (dashboard, pipeline, reports, map, AI briefing, commerce flow) looks
 * alive. Running this IS the reset, so a nightly cron can just re-run it.
 *
 *   npm run db:seed:demo
 *
 * Creates a public, interactive demo login (Sales Manager + Finance) that can
 * drive the whole sell→collect flow but can't manage users/settings/integrations.
 */
import { PrismaClient, Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import {
  ALL_PERMISSIONS, ROLE_PERMISSIONS, ROLE_LABELS, RoleKey,
  toMinor, computeQuoteLine, sumQuoteTotals,
} from '@crm/shared';

const prisma = new PrismaClient();
const CURRENCY = process.env.SEED_BASE_CURRENCY ?? 'PHP';
const now = new Date();
const daysFromNow = (d: number) => new Date(now.getTime() + d * 86400000);
const M = (major: string) => toMinor(major, CURRENCY); // major→minor bigint

async function truncateAll() {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (rows.length === 0) return;
  const list = rows.map((r) => `"${r.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

async function main() {
  console.log('Demo seed: wiping…');
  await truncateAll();

  // ---- permissions ----
  for (const key of ALL_PERMISSIONS) await prisma.permission.create({ data: { key } });
  const perms = await prisma.permission.findMany();
  const permId = new Map(perms.map((p) => [p.key, p.id]));

  // ---- org ----
  const org = await prisma.organization.create({
    data: { name: process.env.SEED_ORG_NAME ?? 'abbadev CRM Demo', slug: 'demo', baseCurrency: CURRENCY },
  });
  const orgId = org.id;

  // ---- roles ----
  const roleId = new Map<string, string>();
  for (const key of Object.values(RoleKey)) {
    const role = await prisma.role.create({
      data: { organizationId: orgId, key, name: ROLE_LABELS[key], isSystem: true },
    });
    roleId.set(key, role.id);
    await prisma.rolePermission.createMany({
      data: ROLE_PERMISSIONS[key].map((k) => permId.get(k)).filter(Boolean).map((id) => ({ roleId: role.id, permissionId: id as string })),
      skipDuplicates: true,
    });
  }

  // ---- users ----
  async function mkUser(email: string, first: string, last: string, password: string, roles: string[], isSuper = false) {
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    return prisma.user.create({
      data: {
        organizationId: orgId, email: email.toLowerCase(), firstName: first, lastName: last, passwordHash,
        isSuperAdmin: isSuper,
        userRoles: { create: roles.map((r) => ({ roleId: roleId.get(r)! })) },
      },
    });
  }
  const admin = await mkUser(process.env.SEED_ADMIN_EMAIL ?? 'admin@abbadev.com', 'Super', 'Admin', process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!', [RoleKey.SUPER_ADMIN], true);
  const guest = await mkUser(process.env.SEED_DEMO_EMAIL ?? 'guest@abbadev.com', 'Demo', 'Manager', process.env.SEED_DEMO_PASSWORD ?? 'GuestDemo123!', [RoleKey.SALES_MANAGER, RoleKey.FINANCE]);
  const rico = await mkUser('rico@demo.test', 'Rico', 'Ramos', 'RepPass123!', [RoleKey.SALES_REP]);
  const maria = await mkUser('maria@demo.test', 'Maria', 'Cruz', 'RepPass123!', [RoleKey.SALES_REP]);
  const reps = [rico, maria, guest];

  // ---- catalog ----
  const vat = await prisma.taxRate.create({ data: { organizationId: orgId, name: 'VAT 12%', rateBp: 1200 } });
  await prisma.taxRate.create({ data: { organizationId: orgId, name: 'Zero-rated (0%)', rateBp: 0 } });
  const catSw = await prisma.productCategory.create({ data: { organizationId: orgId, name: 'Software' } });
  const catSvc = await prisma.productCategory.create({ data: { organizationId: orgId, name: 'Services' } });
  const products = await Promise.all([
    ['HRIS-STD', 'HRIS Standard License', 'subscription', 'license/mo', '1500.00', catSw.id],
    ['CRM-PRO', 'CRM Professional License', 'subscription', 'license/mo', '2200.00', catSw.id],
    ['INV-SYS', 'Inventory System', 'product', 'unit', '85000.00', catSw.id],
    ['IMPL', 'Implementation & Setup', 'service', 'project', '50000.00', catSvc.id],
    ['TRAIN', 'Onboarding & Training', 'service', 'day', '12000.00', catSvc.id],
  ].map(([sku, name, type, unit, price, categoryId]) =>
    prisma.product.create({ data: { organizationId: orgId, sku, name, type, unit, defaultPrice: M(price), currency: CURRENCY, categoryId, taxRateId: vat.id, createdBy: admin.id, updatedBy: admin.id } }),
  ));

  // ---- lead sources ----
  const SRC = [
    ['facebook', 'Facebook', 'social'], ['messenger', 'Messenger', 'messaging'], ['website', 'Website', 'web'],
    ['email', 'Email', 'email'], ['whatsapp', 'WhatsApp', 'messaging'], ['referral', 'Referral', 'partner'],
    ['event', 'Event', 'offline'], ['walk_in', 'Walk-in', 'offline'], ['manual', 'Manual Entry', 'other'], ['other', 'Other', 'other'],
  ];
  const sourceId = new Map<string, string>();
  for (const [key, label, category] of SRC) {
    const s = await prisma.leadSource.create({ data: { organizationId: orgId, key, label, category } });
    sourceId.set(key, s.id);
  }

  // ---- pipeline ----
  const pipeline = await prisma.pipeline.create({ data: { organizationId: orgId, name: 'Standard Sales Pipeline', isDefault: true } });
  const stageDefs = [
    ['Discovery', 10, 'open'], ['Qualification', 20, 'open'], ['Solution / Demo', 40, 'open'],
    ['Proposal', 60, 'open'], ['Negotiation', 75, 'open'], ['Decision', 90, 'open'],
    ['Closed Won', 100, 'won'], ['Closed Lost', 0, 'lost'],
  ] as const;
  const stage: Record<string, { id: string; prob: number }> = {};
  for (let i = 0; i < stageDefs.length; i++) {
    const [name, prob, type] = stageDefs[i];
    const s = await prisma.pipelineStage.create({ data: { organizationId: orgId, pipelineId: pipeline.id, name, sortOrder: i, defaultProbability: prob, type } });
    stage[name] = { id: s.id, prob };
  }

  // ---- approval rules ----
  await prisma.approvalRule.createMany({ data: [
    { organizationId: orgId, name: 'Under ₱100k', minAmount: 0n, maxAmount: 10_000_000n, requiredRoles: ['sales_manager'], sortOrder: 0 },
    { organizationId: orgId, name: '₱100k – ₱500k', minAmount: 10_000_000n, maxAmount: 50_000_000n, requiredRoles: ['sales_manager', 'approver'], sortOrder: 1 },
    { organizationId: orgId, name: 'Over ₱500k', minAmount: 50_000_000n, maxAmount: null, requiredRoles: ['sales_manager', 'approver', 'admin'], sortOrder: 2 },
  ] });

  // ---- accounts + contacts ----
  const ACCOUNTS = [
    ['ABC Construction', 'Construction', 'Manila', rico.id],
    ['XYZ Trading', 'Trading', 'Cebu City', maria.id],
    ['Globex Manufacturing', 'Manufacturing', 'Davao City', rico.id],
    ['Initech Software', 'Software', 'Makati', maria.id],
    ['Umbrella Retail', 'Retail', 'Iloilo City', guest.id],
    ['Wayne Logistics', 'Logistics', 'Cagayan de Oro', rico.id],
  ];
  const account: Record<string, string> = {};
  for (const [name, industry, city, owner] of ACCOUNTS) {
    const a = await prisma.account.create({ data: { organizationId: orgId, name, industry, city, status: 'active', ownerId: owner, createdBy: owner, updatedBy: owner } });
    account[name] = a.id;
    await prisma.contact.create({ data: { organizationId: orgId, accountId: a.id, firstName: name.split(' ')[0], lastName: 'Contact', email: `hello@${name.split(' ')[0].toLowerCase()}.test`, phone: '09170000000', isPrimary: true, isDecisionMaker: true, createdBy: owner, updatedBy: owner } });
  }

  // ---- leads (statuses + PH locations for the map) ----
  const LEADS = [
    ['Juan Dela Cruz', 'Sunrise Builders', 'website', 'new', 'Quezon City', 'HRIS', '250000', 65, rico.id],
    ['Maria Santos', 'Metro Foods', 'facebook', 'contacted', 'Makati', 'Inventory System', '450000', 72, maria.id],
    ['Pedro Reyes', 'CebuTech', 'referral', 'qualified', 'Cebu City', 'CRM', '300000', 84, guest.id],
    ['Ana Lim', 'Davao Agri', 'messenger', 'contacted', 'Davao City', 'HRIS + Payroll', '520000', 68, rico.id],
    ['Ramon Bautista', 'Baguio Cafe', 'walk_in', 'new', 'Baguio', 'POS', '90000', 40, maria.id],
    ['Liza Chua', 'Iloilo Mart', 'website', 'unqualified', 'Iloilo City', 'Inventory', '120000', 35, guest.id],
    ['Ben Tan', 'Cavite Motors', 'email', 'new', 'Cavite', 'CRM', '210000', 58, rico.id],
    ['Grace Yu', 'Pampanga Textiles', 'event', 'lost', 'San Fernando', 'ERP', '600000', 45, maria.id, 'Price'],
    ['Oscar Villa', 'Zamboanga Fisheries', 'facebook', 'contacted', 'Zamboanga', 'HRIS', '340000', 61, guest.id],
    ['Nina Ong', 'Batangas Logistics', 'referral', 'qualified', 'Batangas', 'CRM + Inventory', '480000', 88, rico.id],
  ];
  let leadNo = 1;
  for (const l of LEADS) {
    const [name, company, src, status, location, interest, budget, score, owner, lostReason] = l as any;
    await prisma.lead.create({ data: {
      organizationId: orgId, leadNo: `L-${String(leadNo++).padStart(5, '0')}`, name, company,
      contactPerson: name, email: `${name.split(' ')[0].toLowerCase()}@${company.split(' ')[0].toLowerCase()}.test`,
      phone: '09180000000', sourceId: sourceId.get(src), interest, estimatedBudget: M(budget), currency: CURRENCY,
      location, assignedUserId: owner, status, score,
      priority: score >= 80 ? 'high' : 'medium', lostReason: lostReason ?? null,
      nextFollowupAt: status === 'new' || status === 'contacted' ? daysFromNow(2) : null,
      createdBy: owner, updatedBy: owner,
    } as any });
  }

  // ---- opportunities across the pipeline ----
  const OPPS = [
    ['ABC Construction – HRIS Rollout', 'ABC Construction', 'Discovery', '250000', rico.id, 'open', 20],
    ['XYZ Trading – Inventory System', 'XYZ Trading', 'Qualification', '450000', maria.id, 'open', 15],
    ['Globex – ERP Suite', 'Globex Manufacturing', 'Proposal', '1200000', rico.id, 'open', 10],
    ['Initech – CRM Pro', 'Initech Software', 'Negotiation', '760000', maria.id, 'open', 5],
    ['Umbrella – POS + Inventory', 'Umbrella Retail', 'Solution / Demo', '380000', guest.id, 'open', 12],
    ['Wayne – Fleet CRM', 'Wayne Logistics', 'Decision', '540000', rico.id, 'open', 3],
    ['ABC Construction – Payroll Add-on', 'ABC Construction', 'Closed Won', '500000', maria.id, 'won', 8],
    ['XYZ Trading – Legacy Migration', 'XYZ Trading', 'Closed Lost', '300000', guest.id, 'lost', 25],
  ];
  const openOppIds: { id: string; owner: string }[] = [];
  for (const o of OPPS) {
    const [name, acc, stName, amount, owner, status, ageDays] = o as any;
    const st = stage[stName];
    const opp = await prisma.opportunity.create({ data: {
      organizationId: orgId, name, accountId: account[acc], ownerId: owner, pipelineId: pipeline.id, stageId: st.id,
      amount: M(amount), currency: CURRENCY, probability: st.prob, status,
      expectedCloseDate: daysFromNow(status === 'open' ? 20 : -5),
      closedAt: status === 'won' ? daysFromNow(-3) : status === 'lost' ? daysFromNow(-6) : null,
      lostReason: status === 'lost' ? 'No Budget' : null,
      stageEnteredAt: daysFromNow(-ageDays), createdBy: owner, updatedBy: owner,
    } });
    await prisma.opportunityStageHistory.create({ data: { organizationId: orgId, opportunityId: opp.id, toStageId: st.id, toProbability: st.prob, changedBy: owner } });
    if (status === 'open') openOppIds.push({ id: opp.id, owner });
  }

  // ---- activities (some overdue, some upcoming) ----
  const acts: Prisma.ActivityCreateManyInput[] = [];
  openOppIds.forEach((o, i) => {
    acts.push({ organizationId: orgId, type: i % 2 ? 'call' : 'meeting', subject: i % 2 ? 'Follow-up call' : 'Discovery meeting', relatedType: 'opportunity', relatedId: o.id, ownerId: o.owner, dueDate: daysFromNow(i % 3 === 0 ? -2 : 3), priority: 'high', createdBy: o.owner, updatedBy: o.owner });
  });
  await prisma.activity.createMany({ data: acts });

  // ---- commerce: accepted quote → order → invoices → payments ----
  const items = [
    { productId: products[0].id, description: 'HRIS Standard License', quantity: '10', unit: 'license/mo', unitPrice: M('1500.00'), taxRateBp: 1200, discountType: 'none', discountValue: '0' },
    { productId: products[3].id, description: 'Implementation & Setup', quantity: '1', unit: 'project', unitPrice: M('50000.00'), taxRateBp: 1200, discountType: 'percent', discountValue: '10' },
  ];
  const lineResults = items.map((it) => computeQuoteLine({ unitPrice: it.unitPrice, quantity: it.quantity, discountType: it.discountType as any, discountValue: it.discountValue, taxRateBp: it.taxRateBp, currency: CURRENCY }));
  const totals = sumQuoteTotals(lineResults);

  const quote = await prisma.quotation.create({ data: {
    organizationId: orgId, quoteNo: 'Q-00001', accountId: account['ABC Construction'], ownerId: maria.id,
    status: 'accepted', approvalState: 'approved', currency: CURRENCY,
    subtotal: totals.subtotal, discountTotal: totals.discountTotal, taxTotal: totals.taxTotal, grandTotal: totals.grandTotal,
    paymentTerms: '50% down, 50% on delivery', validityDays: 30, submittedBy: maria.id, submittedAt: daysFromNow(-10),
    createdBy: maria.id, updatedBy: maria.id,
    items: { create: items.map((it, i) => ({ organizationId: orgId, productId: it.productId, description: it.description, quantity: new Prisma.Decimal(it.quantity), unit: it.unit, unitPrice: it.unitPrice, discountType: it.discountType, discountValue: new Prisma.Decimal(it.discountValue), discountAmount: lineResults[i].discountAmount, taxRateId: vat.id, taxRateBp: it.taxRateBp, lineSubtotal: lineResults[i].lineSubtotal, lineTax: lineResults[i].lineTax, lineTotal: lineResults[i].lineTotal, sortOrder: i })) },
  } });

  const order = await prisma.salesOrder.create({ data: {
    organizationId: orgId, orderNo: 'SO-00001', accountId: account['ABC Construction'], quotationId: quote.id, ownerId: maria.id,
    status: 'confirmed', billingStatus: 'billed', currency: CURRENCY,
    subtotal: totals.subtotal, discountTotal: totals.discountTotal, taxTotal: totals.taxTotal, grandTotal: totals.grandTotal,
    createdBy: maria.id, updatedBy: maria.id,
    items: { create: items.map((it, i) => ({ organizationId: orgId, productId: it.productId, description: it.description, quantity: new Prisma.Decimal(it.quantity), unit: it.unit, unitPrice: it.unitPrice, discountType: it.discountType, discountValue: new Prisma.Decimal(it.discountValue), discountAmount: lineResults[i].discountAmount, taxRateId: vat.id, taxRateBp: it.taxRateBp, lineSubtotal: lineResults[i].lineSubtotal, lineTax: lineResults[i].lineTax, lineTotal: lineResults[i].lineTotal, sortOrder: i })) },
  } });
  await prisma.quotation.update({ where: { id: quote.id }, data: { salesOrderId: order.id } });

  // Invoice 1: partially paid + overdue. Invoice 2: fully paid.
  async function mkInvoice(no: string, dueDays: number, paid: bigint, status: string, paymentStatus: string) {
    const inv = await prisma.invoice.create({ data: {
      organizationId: orgId, invoiceNo: no, accountId: account['ABC Construction'], salesOrderId: order.id, ownerId: maria.id,
      issueDate: daysFromNow(-20), dueDate: daysFromNow(dueDays), status, paymentStatus, currency: CURRENCY,
      subtotal: totals.subtotal, discountTotal: totals.discountTotal, taxTotal: totals.taxTotal, total: totals.grandTotal, amountPaid: paid,
      createdBy: maria.id, updatedBy: maria.id,
      items: { create: items.map((it, i) => ({ organizationId: orgId, productId: it.productId, description: it.description, quantity: new Prisma.Decimal(it.quantity), unit: it.unit, unitPrice: it.unitPrice, discountAmount: lineResults[i].discountAmount, taxRateBp: it.taxRateBp, lineSubtotal: lineResults[i].lineSubtotal, lineTax: lineResults[i].lineTax, lineTotal: lineResults[i].lineTotal, sortOrder: i })) },
    } });
    return inv;
  }
  const half = totals.grandTotal / 2n;
  const inv1 = await mkInvoice('INV-00001', -5, half, 'partially_paid', 'partial'); // overdue, half paid
  await prisma.payment.create({ data: { organizationId: orgId, paymentRef: 'PAY-00001', invoiceId: inv1.id, accountId: account['ABC Construction'], amount: half, currency: CURRENCY, method: 'bank_transfer', referenceNumber: 'BT-1001', receivedById: guest.id, createdBy: guest.id } });

  console.log('Demo seed complete.');
  console.log(`  Admin login: ${process.env.SEED_ADMIN_EMAIL ?? 'admin@abbadev.com'} / ${process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!'}`);
  console.log(`  DEMO login:  ${process.env.SEED_DEMO_EMAIL ?? 'guest@abbadev.com'} / ${process.env.SEED_DEMO_PASSWORD ?? 'GuestDemo123!'}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
