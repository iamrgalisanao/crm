import { Controller, Get } from '@nestjs/common';
import { Permission } from '@crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { requireOrgId } from '../common/context/request-context';
import { RequirePermissions } from '../common/rbac/permissions.decorator';

@Controller('roles')
export class RolesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions(Permission.ROLES_MANAGE)
  async list() {
    const organizationId = requireOrgId();
    const roles = await this.prisma.role.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'asc' },
      include: { rolePermissions: { include: { permission: true } } },
    });
    return roles.map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      permissions: r.rolePermissions.map((rp) => rp.permission.key),
    }));
  }
}
