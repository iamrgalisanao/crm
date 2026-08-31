import { Module } from '@nestjs/common';
import { ImportService } from './import.service';
import { ExportService } from './export.service';
import { ImportExportController } from './import-export.controller';
import { LeadsModule } from '../leads/leads.module';
import { AccountsModule } from '../accounts/accounts.module';
import { ContactsModule } from '../contacts/contacts.module';
import { ProductsModule } from '../products/products.module';

@Module({
  imports: [LeadsModule, AccountsModule, ContactsModule, ProductsModule],
  providers: [ImportService, ExportService],
  controllers: [ImportExportController],
})
export class ImportExportModule {}
