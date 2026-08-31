import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { requireOrgId } from '../common/context/request-context';
import { LeadsService } from '../leads/leads.service';
import { AccountsService } from '../accounts/accounts.service';
import { ContactsService } from '../contacts/contacts.service';
import { ProductsService } from '../products/products.service';
import { parseCsv } from './csv.util';

export interface ImportResult {
  imported: number;
  failed: number;
  total: number;
  errors: { row: number; message: string }[];
}

const MONEY = /^\d+(\.\d{1,2})?$/;

function pick(row: Record<string, string>, ...aliases: string[]): string | undefined {
  const lower: Record<string, string> = {};
  for (const k of Object.keys(row)) lower[k.toLowerCase().replace(/[\s_]/g, '')] = row[k];
  for (const a of aliases) {
    const key = a.toLowerCase().replace(/[\s_]/g, '');
    if (lower[key] != null && lower[key] !== '') return lower[key];
  }
  return undefined;
}

@Injectable()
export class ImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leads: LeadsService,
    private readonly accounts: AccountsService,
    private readonly contacts: ContactsService,
    private readonly products: ProductsService,
  ) {}

  async run(entity: string, csv: string): Promise<ImportResult> {
    const { rows } = parseCsv(csv);
    const result: ImportResult = { imported: 0, failed: 0, total: rows.length, errors: [] };
    if (rows.length === 0) return result;

    // Pre-load lookups shared across rows.
    const organizationId = requireOrgId();
    const sourceMap = entity === 'leads' ? await this.buildSourceMap(organizationId) : null;

    for (let i = 0; i < rows.length; i++) {
      const line = i + 2; // header is line 1
      try {
        await this.importRow(entity, rows[i], { organizationId, sourceMap });
        result.imported++;
      } catch (err: any) {
        result.failed++;
        result.errors.push({ row: line, message: this.msg(err) });
      }
    }
    return result;
  }

  private async importRow(entity: string, row: Record<string, string>, ctx: any): Promise<void> {
    switch (entity) {
      case 'leads': return this.importLead(row, ctx);
      case 'accounts': return this.importAccount(row);
      case 'contacts': return this.importContact(row);
      case 'products': return this.importProduct(row);
      default: throw new Error(`Unsupported entity: ${entity}`);
    }
  }

  private async importLead(row: Record<string, string>, ctx: any): Promise<void> {
    const name = pick(row, 'name', 'leadname', 'fullname');
    if (!name) throw new Error('Missing required "name"');
    const budget = pick(row, 'estimatedbudget', 'budget');
    if (budget && !MONEY.test(budget)) throw new Error(`Invalid budget "${budget}"`);
    const sourceLabel = pick(row, 'source');
    const sourceId = sourceLabel ? ctx.sourceMap?.get(sourceLabel.toLowerCase()) : undefined;

    await this.leads.create({
      name,
      company: pick(row, 'company'),
      contactPerson: pick(row, 'contactperson', 'contact'),
      email: pick(row, 'email'),
      phone: pick(row, 'phone'),
      mobile: pick(row, 'mobile'),
      industry: pick(row, 'industry'),
      interest: pick(row, 'interest', 'interestedin', 'product'),
      estimatedBudget: budget,
      location: pick(row, 'location', 'city'),
      priority: this.enumOrUndef(pick(row, 'priority'), ['low', 'medium', 'high', 'urgent']) as any,
      sourceId,
    } as any);
  }

  private async importAccount(row: Record<string, string>): Promise<void> {
    const name = pick(row, 'name', 'company', 'companyname');
    if (!name) throw new Error('Missing required "name"');
    await this.accounts.create({
      name,
      industry: pick(row, 'industry'),
      address: pick(row, 'address'),
      city: pick(row, 'city'),
      country: pick(row, 'country'),
      website: pick(row, 'website'),
      phone: pick(row, 'phone'),
      status: this.enumOrUndef(pick(row, 'status'), ['prospect', 'active', 'inactive', 'churned']) as any,
    } as any);
  }

  private async importContact(row: Record<string, string>): Promise<void> {
    const firstName = pick(row, 'firstname', 'first');
    const lastName = pick(row, 'lastname', 'last', 'surname');
    if (!firstName || !lastName) throw new Error('Missing required "firstName" and "lastName"');

    let accountId: string | undefined;
    const accountName = pick(row, 'account', 'accountname', 'company');
    if (accountName) {
      const acc = await this.prisma.account.findFirst({ where: { organizationId: requireOrgId(), name: accountName, deletedAt: null }, select: { id: true } });
      accountId = acc?.id;
    }
    await this.contacts.create({
      firstName, lastName,
      jobTitle: pick(row, 'jobtitle', 'title'),
      department: pick(row, 'department'),
      email: pick(row, 'email'),
      phone: pick(row, 'phone'),
      mobile: pick(row, 'mobile'),
      accountId,
    } as any);
  }

  private async importProduct(row: Record<string, string>): Promise<void> {
    const sku = pick(row, 'sku', 'code');
    const name = pick(row, 'name', 'productname');
    if (!sku || !name) throw new Error('Missing required "sku" and "name"');
    const price = pick(row, 'defaultprice', 'price');
    if (price && !MONEY.test(price)) throw new Error(`Invalid price "${price}"`);
    const cost = pick(row, 'cost');
    if (cost && !MONEY.test(cost)) throw new Error(`Invalid cost "${cost}"`);

    // Resolve or create category by name.
    let categoryId: string | undefined;
    const categoryName = pick(row, 'category');
    if (categoryName) {
      const organizationId = requireOrgId();
      let cat = await this.prisma.productCategory.findFirst({ where: { organizationId, name: categoryName }, select: { id: true } });
      if (!cat) cat = await this.prisma.productCategory.create({ data: { organizationId, name: categoryName }, select: { id: true } });
      categoryId = cat.id;
    }

    await this.products.create({
      sku, name,
      type: this.enumOrUndef(pick(row, 'type'), ['product', 'service', 'subscription', 'custom']) as any,
      unit: pick(row, 'unit'),
      defaultPrice: price,
      cost,
      categoryId,
    } as any);
  }

  private async buildSourceMap(organizationId: string): Promise<Map<string, string>> {
    const sources = await this.prisma.leadSource.findMany({ where: { organizationId }, select: { id: true, key: true, label: true } });
    const map = new Map<string, string>();
    for (const s of sources) {
      map.set(s.key.toLowerCase(), s.id);
      map.set(s.label.toLowerCase(), s.id);
    }
    return map;
  }

  private enumOrUndef(value: string | undefined, allowed: string[]): string | undefined {
    if (!value) return undefined;
    const v = value.toLowerCase();
    return allowed.includes(v) ? v : undefined;
  }

  private msg(err: any): string {
    const m = err?.response?.message ?? err?.message ?? 'Unknown error';
    return Array.isArray(m) ? m.join(', ') : String(m);
  }
}
