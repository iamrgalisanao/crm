import { Controller, Get } from '@nestjs/common';
import { Permission } from '@crm/shared';
import { DashboardService } from './dashboard.service';
import { RequirePermissions } from '../common/rbac/permissions.decorator';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('summary')
  @RequirePermissions(Permission.DASHBOARD_VIEW)
  summary() {
    return this.dashboard.summary();
  }
}
