import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as argon2 from 'argon2';
import { DomainEvent } from '@crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { requireOrgId, currentUserId } from '../common/context/request-context';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  async list() {
    const organizationId = requireOrgId();
    const users = await this.prisma.user.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      include: { userRoles: { include: { role: true } } },
    });
    return users.map((u) => this.toDto(u));
  }

  /** Minimal id+name list for owner/assignee pickers (any authenticated user). */
  async listAssignable() {
    const organizationId = requireOrgId();
    const users = await this.prisma.user.findMany({
      where: { organizationId, deletedAt: null, status: 'active' },
      orderBy: { firstName: 'asc' },
      select: { id: true, firstName: true, lastName: true },
    });
    return users.map((u) => ({ id: u.id, name: `${u.firstName} ${u.lastName}` }));
  }

  async findOne(id: string) {
    const organizationId = requireOrgId();
    const user = await this.prisma.user.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: { userRoles: { include: { role: true } } },
    });
    if (!user) throw new NotFoundException('User not found');
    return this.toDto(user);
  }

  async create(dto: CreateUserDto) {
    const organizationId = requireOrgId();
    const email = dto.email.toLowerCase();

    const existing = await this.prisma.user.findFirst({
      where: { organizationId, email },
    });
    if (existing) throw new ConflictException('A user with this email already exists');

    const roles = await this.prisma.role.findMany({
      where: { organizationId, key: { in: dto.roleKeys } },
    });
    if (roles.length !== dto.roleKeys.length) {
      throw new BadRequestException('One or more roles do not exist');
    }

    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });

    const user = await this.prisma.user.create({
      data: {
        organizationId,
        email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone ?? null,
        passwordHash,
        userRoles: { create: roles.map((r) => ({ roleId: r.id })) },
      },
      include: { userRoles: { include: { role: true } } },
    });

    await this.audit.record({
      action: 'user.created',
      entityType: 'user',
      entityId: user.id,
      newValues: { email, roleKeys: dto.roleKeys },
    });
    this.events.emit(DomainEvent.USER_CREATED, {
      organizationId,
      actorId: currentUserId(),
      entityType: 'user',
      entityId: user.id,
      at: new Date().toISOString(),
    });

    return this.toDto(user);
  }

  private toDto(user: any) {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      status: user.status,
      isSuperAdmin: user.isSuperAdmin,
      lastLoginAt: user.lastLoginAt,
      roles: user.userRoles.map((ur: any) => ({ key: ur.role.key, name: ur.role.name })),
      createdAt: user.createdAt,
    };
  }
}
