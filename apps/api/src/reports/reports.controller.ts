import { Controller, Get, Query } from '@nestjs/common';
import { Permission } from '@crm/shared';
import { ReportsService } from './reports.service';
import { RequirePermissions } from '../common/rbac/permissions.decorator';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('overview')
  @RequirePermissions(Permission.REPORTS_VIEW)
  overview(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('ownerId') ownerId?: string,
  ) {
    return this.reports.overview({ from, to, ownerId });
  }
}
