import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { requireOrgId } from '../common/context/request-context';

@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('current')
  async current() {
    const id = requireOrgId();
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id },
      select: {
        id: true,
        name: true,
        legalName: true,
        slug: true,
        timezone: true,
        baseCurrency: true,
        status: true,
        plan: true,
      },
    });
    return org;
  }
}
