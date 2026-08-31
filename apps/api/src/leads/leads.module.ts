import { Module } from '@nestjs/common';
import { LeadsService } from './leads.service';
import { LeadsController } from './leads.controller';
import { LeadSourcesController } from './lead-sources.controller';
import { OpportunitiesModule } from '../opportunities/opportunities.module';

@Module({
  imports: [OpportunitiesModule],
  providers: [LeadsService],
  controllers: [LeadsController, LeadSourcesController],
  exports: [LeadsService],
})
export class LeadsModule {}
