import { Body, Controller, Get, Post } from '@nestjs/common';
import { IsString } from 'class-validator';
import { Permission } from '@crm/shared';
import { ImportService } from './import.service';
import { ExportService } from './export.service';
import { RequirePermissions } from '../common/rbac/permissions.decorator';

class ImportDto {
  @IsString()
  csv!: string;
}

@Controller()
export class ImportExportController {
  constructor(
    private readonly importSvc: ImportService,
    private readonly exportSvc: ExportService,
  ) {}

  // Import — one route per entity so RBAC is explicit per data type.
  @Post('import/leads')
  @RequirePermissions(Permission.LEADS_CREATE)
  importLeads(@Body() dto: ImportDto) { return this.importSvc.run('leads', dto.csv); }

  @Post('import/accounts')
  @RequirePermissions(Permission.ACCOUNTS_CREATE)
  importAccounts(@Body() dto: ImportDto) { return this.importSvc.run('accounts', dto.csv); }

  @Post('import/contacts')
  @RequirePermissions(Permission.CONTACTS_CREATE)
  importContacts(@Body() dto: ImportDto) { return this.importSvc.run('contacts', dto.csv); }

  @Post('import/products')
  @RequirePermissions(Permission.PRODUCTS_MANAGE)
  importProducts(@Body() dto: ImportDto) { return this.importSvc.run('products', dto.csv); }

  // Export.
  @Get('export/leads')
  @RequirePermissions(Permission.LEADS_VIEW)
  exportLeads() { return this.exportSvc.run('leads'); }

  @Get('export/accounts')
  @RequirePermissions(Permission.ACCOUNTS_VIEW)
  exportAccounts() { return this.exportSvc.run('accounts'); }

  @Get('export/contacts')
  @RequirePermissions(Permission.CONTACTS_VIEW)
  exportContacts() { return this.exportSvc.run('contacts'); }

  @Get('export/products')
  @RequirePermissions(Permission.PRODUCTS_VIEW)
  exportProducts() { return this.exportSvc.run('products'); }
}
