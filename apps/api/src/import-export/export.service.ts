import { BadRequestException, Injectable } from '@nestjs/common';
import { LeadsService } from '../leads/leads.service';
import { AccountsService } from '../accounts/accounts.service';
import { ContactsService } from '../contacts/contacts.service';
import { ProductsService } from '../products/products.service';
import { toCsv } from './csv.util';

@Injectable()
export class ExportService {
  constructor(
    private readonly leads: LeadsService,
    private readonly accounts: AccountsService,
    private readonly contacts: ContactsService,
    private readonly products: ProductsService,
  ) {}

  async run(entity: string): Promise<{ filename: string; csv: string }> {
    switch (entity) {
      case 'leads': return this.exportLeads();
      case 'accounts': return this.exportAccounts();
      case 'contacts': return this.exportContacts();
      case 'products': return this.exportProducts();
      default: throw new BadRequestException(`Unsupported entity: ${entity}`);
    }
  }

  private async exportLeads() {
    const { data } = await this.leads.list({ limit: 1000 });
    const columns = ['leadNo', 'name', 'company', 'contactPerson', 'email', 'phone', 'mobile', 'source', 'industry', 'interest', 'estimatedBudget', 'location', 'status', 'score', 'classification', 'priority', 'assignedTo', 'createdAt'];
    const rows = data.map((l: any) => ({
      ...l, source: l.source?.label ?? '', assignedTo: l.assignedUser?.name ?? '',
    }));
    return { filename: 'leads.csv', csv: toCsv(columns, rows) };
  }

  private async exportAccounts() {
    const { data } = await this.accounts.list({ limit: 1000 });
    const columns = ['name', 'industry', 'address', 'city', 'country', 'website', 'phone', 'taxId', 'status', 'owner', 'contactCount', 'createdAt'];
    const rows = data.map((a: any) => ({ ...a, owner: a.owner?.name ?? '' }));
    return { filename: 'accounts.csv', csv: toCsv(columns, rows) };
  }

  private async exportContacts() {
    const { data } = await this.contacts.list({ limit: 1000 });
    const columns = ['firstName', 'lastName', 'jobTitle', 'department', 'email', 'phone', 'mobile', 'account', 'isPrimary', 'isDecisionMaker', 'createdAt'];
    const rows = data.map((c: any) => ({ ...c, account: c.account?.name ?? '' }));
    return { filename: 'contacts.csv', csv: toCsv(columns, rows) };
  }

  private async exportProducts() {
    const { data } = await this.products.list({ limit: 1000 });
    const columns = ['sku', 'name', 'category', 'type', 'unit', 'defaultPrice', 'cost', 'taxRate', 'isActive', 'createdAt'];
    const rows = data.map((p: any) => ({ ...p, category: p.category?.name ?? '', taxRate: p.taxRate?.name ?? '' }));
    return { filename: 'products.csv', csv: toCsv(columns, rows) };
  }
}
