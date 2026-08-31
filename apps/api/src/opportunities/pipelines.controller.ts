import { Controller, Get } from '@nestjs/common';
import { Permission } from '@crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { requireOrgId } from '../common/context/request-context';
import { RequirePermissions } from '../common/rbac/permissions.decorator';

@Controller('pipelines')
export class PipelinesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions(Permission.OPPORTUNITIES_VIEW)
  async list() {
    const organizationId = requireOrgId();
    const pipelines = await this.prisma.pipeline.findMany({
      where: { organizationId, isActive: true },
      orderBy: { createdAt: 'asc' },
      include: { stages: { orderBy: { sortOrder: 'asc' } } },
    });
    return pipelines.map((p) => ({
      id: p.id,
      name: p.name,
      isDefault: p.isDefault,
      stages: p.stages.map((s) => ({
        id: s.id,
        name: s.name,
        type: s.type,
        sortOrder: s.sortOrder,
        defaultProbability: s.defaultProbability,
      })),
    }));
  }
}
