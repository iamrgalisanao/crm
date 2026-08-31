import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import {
  ALL_PERMISSIONS,
  ROLE_PERMISSIONS,
  ROLE_LABELS,
  RoleKey,
} from '@crm/shared';

const prisma = new PrismaClient();

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function main(): Promise<void> {
  const orgName = process.env.SEED_ORG_NAME ?? 'Demo Company';
  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? 'admin@demo.test').toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!';
  const baseCurrency = process.env.SEED_BASE_CURRENCY ?? 'PHP';

  console.log('Seeding permissions...');
  for (const key of ALL_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key },
      update: {},
      create: { key },
    });
  }
  const permissions = await prisma.permission.findMany();
  const permByKey = new Map(permissions.map((p) => [p.key, p.id]));

  console.log(`Seeding organization "${orgName}"...`);
  const org = await prisma.organization.upsert({
    where: { slug: slugify(orgName) },
    update: {},
    create: {
      name: orgName,
      slug: slugify(orgName),
      baseCurrency,
    },
  });

  console.log('Seeding roles...');
  for (const key of Object.values(RoleKey)) {
    const role = await prisma.role.upsert({
      where: { organizationId_key: { organizationId: org.id, key } },
      update: { name: ROLE_LABELS[key], isSystem: true },
      create: { organizationId: org.id, key, name: ROLE_LABELS[key], isSystem: true },
    });

    // Sync role → permissions.
    const wanted = ROLE_PERMISSIONS[key];
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: wanted
        .map((permKey) => permByKey.get(permKey))
        .filter((id): id is string => Boolean(id))
        .map((permissionId) => ({ roleId: role.id, permissionId })),
      skipDuplicates: true,
    });
  }

  console.log('Seeding lead sources...');
  const LEAD_SOURCES: { key: string; label: string; category: string }[] = [
    { key: 'facebook', label: 'Facebook', category: 'social' },
    { key: 'messenger', label: 'Messenger', category: 'messaging' },
    { key: 'website', label: 'Website', category: 'web' },
    { key: 'email', label: 'Email', category: 'email' },
    { key: 'whatsapp', label: 'WhatsApp', category: 'messaging' },
    { key: 'referral', label: 'Referral', category: 'partner' },
    { key: 'event', label: 'Event', category: 'offline' },
    { key: 'walk_in', label: 'Walk-in', category: 'offline' },
    { key: 'cold_outreach', label: 'Cold Outreach', category: 'other' },
    { key: 'partner', label: 'Partner', category: 'partner' },
    { key: 'manual', label: 'Manual Entry', category: 'other' },
    { key: 'other', label: 'Other', category: 'other' },
  ];
  for (const s of LEAD_SOURCES) {
    await prisma.leadSource.upsert({
      where: { organizationId_key: { organizationId: org.id, key: s.key } },
      update: { label: s.label, category: s.category },
      create: { organizationId: org.id, key: s.key, label: s.label, category: s.category },
    });
  }

  console.log('Seeding default pipeline...');
  const existingPipeline = await prisma.pipeline.findFirst({
    where: { organizationId: org.id, isDefault: true },
  });
  if (!existingPipeline) {
    const pipeline = await prisma.pipeline.create({
      data: { organizationId: org.id, name: 'Standard Sales Pipeline', isDefault: true },
    });
    const STAGES = [
      { name: 'Discovery', defaultProbability: 10, type: 'open' },
      { name: 'Qualification', defaultProbability: 20, type: 'open' },
      { name: 'Solution / Demo', defaultProbability: 40, type: 'open' },
      { name: 'Proposal', defaultProbability: 60, type: 'open' },
      { name: 'Negotiation', defaultProbability: 75, type: 'open' },
      { name: 'Decision', defaultProbability: 90, type: 'open' },
      { name: 'Closed Won', defaultProbability: 100, type: 'won' },
      { name: 'Closed Lost', defaultProbability: 0, type: 'lost' },
    ];
    await prisma.pipelineStage.createMany({
      data: STAGES.map((s, i) => ({
        organizationId: org.id,
        pipelineId: pipeline.id,
        name: s.name,
        sortOrder: i,
        defaultProbability: s.defaultProbability,
        type: s.type,
      })),
    });
  }

  console.log('Seeding tax rates...');
  const TAX_RATES = [
    { name: 'VAT 12%', rateBp: 1200 },
    { name: 'Zero-rated (0%)', rateBp: 0 },
    { name: 'VAT-exempt', rateBp: 0 },
  ];
  for (const t of TAX_RATES) {
    const exists = await prisma.taxRate.findFirst({ where: { organizationId: org.id, name: t.name } });
    if (!exists) {
      await prisma.taxRate.create({ data: { organizationId: org.id, name: t.name, rateBp: t.rateBp } });
    }
  }

  console.log('Seeding approval rules...');
  const existingRules = await prisma.approvalRule.count({ where: { organizationId: org.id } });
  if (existingRules === 0) {
    // Amounts in minor units (centavos). 100k = 10,000,000; 500k = 50,000,000.
    await prisma.approvalRule.createMany({
      data: [
        { organizationId: org.id, name: 'Under ₱100k', minAmount: 0n, maxAmount: 10_000_000n, requiredRoles: ['sales_manager'], sortOrder: 0 },
        { organizationId: org.id, name: '₱100k – ₱500k', minAmount: 10_000_000n, maxAmount: 50_000_000n, requiredRoles: ['sales_manager', 'approver'], sortOrder: 1 },
        { organizationId: org.id, name: 'Over ₱500k', minAmount: 50_000_000n, maxAmount: null, requiredRoles: ['sales_manager', 'approver', 'admin'], sortOrder: 2 },
      ],
    });
  }

  console.log(`Seeding super admin "${adminEmail}"...`);
  const superAdminRole = await prisma.role.findUniqueOrThrow({
    where: { organizationId_key: { organizationId: org.id, key: RoleKey.SUPER_ADMIN } },
  });

  const existing = await prisma.user.findFirst({
    where: { organizationId: org.id, email: adminEmail },
  });
  if (!existing) {
    const passwordHash = await argon2.hash(adminPassword, { type: argon2.argon2id });
    await prisma.user.create({
      data: {
        organizationId: org.id,
        email: adminEmail,
        firstName: 'Super',
        lastName: 'Admin',
        passwordHash,
        isSuperAdmin: true,
        userRoles: { create: [{ roleId: superAdminRole.id }] },
      },
    });
    console.log(`  Created super admin. Login: ${adminEmail} / ${adminPassword}`);
  } else {
    console.log('  Super admin already exists, skipping.');
  }

  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
