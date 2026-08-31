import { Controller, Get } from '@nestjs/common';
import { Permission } from '@crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { requireOrgId } from '../common/context/request-context';
import { RequirePermissions } from '../common/rbac/permissions.decorator';

@Controller('lead-sources')
export class LeadSourcesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions(Permission.LEADS_VIEW)
  async list() {
    const organizationId = requireOrgId();
    const sources = await this.prisma.leadSource.findMany({
      where: { organizationId, isActive: true },
      orderBy: { label: 'asc' },
      select: { id: true, key: true, label: true, category: true },
    });
    return sources;
  }
}
