import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import {
  requireOrgId,
  currentUserId,
} from '../common/context/request-context';
import { scopedWhere, canAccessOwned } from '../common/scope/ownership-scope';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';

export interface ListAccountsParams {
  q?: string;
  status?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(params: ListAccountsParams) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 25));

    const where: Record<string, unknown> = { ...scopedWhere('ownerId'), deletedAt: null };
    if (params.status) where.status = params.status;
    if (params.q) {
      where.OR = [
        { name: { contains: params.q, mode: 'insensitive' } },
        { industry: { contains: params.q, mode: 'insensitive' } },
        { city: { contains: params.q, mode: 'insensitive' } },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.account.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          owner: { select: { id: true, firstName: true, lastName: true } },
          _count: { select: { contacts: true } },
        },
      }),
      this.prisma.account.count({ where }),
    ]);

    return {
      data: rows.map((r) => this.toDto(r)),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const account = await this.getScopedOrThrow(id);
    const full = await this.prisma.account.findUnique({
      where: { id: account.id },
      include: {
        owner: { select: { id: true, firstName: true, lastName: true } },
        contacts: {
          where: { deletedAt: null },
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        },
      },
    });
    return this.toDto(full);
  }

  async create(dto: CreateAccountDto) {
    const organizationId = requireOrgId();
    const account = await this.prisma.account.create({
      data: {
        organizationId,
        name: dto.name,
        industry: dto.industry ?? null,
        address: dto.address ?? null,
        city: dto.city ?? null,
        country: dto.country ?? null,
        website: dto.website ?? null,
        phone: dto.phone ?? null,
        taxId: dto.taxId ?? null,
        status: dto.status ?? 'prospect',
        // Default owner to the creator so reps immediately see their own record.
        ownerId: dto.ownerId ?? currentUserId(),
        tags: dto.tags ?? [],
        notes: dto.notes ?? null,
        createdBy: currentUserId(),
        updatedBy: currentUserId(),
      },
    });

    await this.audit.record({
      action: 'account.created',
      entityType: 'account',
      entityId: account.id,
      newValues: { name: account.name, status: account.status },
    });
    return this.toDto(account);
  }

  async update(id: string, dto: UpdateAccountDto) {
    const existing = await this.getScopedOrThrow(id);

    const account = await this.prisma.account.update({
      where: { id: existing.id },
      data: {
        ...('name' in dto ? { name: dto.name } : {}),
        ...('industry' in dto ? { industry: dto.industry ?? null } : {}),
        ...('address' in dto ? { address: dto.address ?? null } : {}),
        ...('city' in dto ? { city: dto.city ?? null } : {}),
        ...('country' in dto ? { country: dto.country ?? null } : {}),
        ...('website' in dto ? { website: dto.website ?? null } : {}),
        ...('phone' in dto ? { phone: dto.phone ?? null } : {}),
        ...('taxId' in dto ? { taxId: dto.taxId ?? null } : {}),
        ...('status' in dto ? { status: dto.status } : {}),
        ...('ownerId' in dto ? { ownerId: dto.ownerId ?? null } : {}),
        ...('tags' in dto ? { tags: dto.tags ?? [] } : {}),
        ...('notes' in dto ? { notes: dto.notes ?? null } : {}),
        updatedBy: currentUserId(),
      },
    });

    await this.audit.record({
      action: 'account.updated',
      entityType: 'account',
      entityId: account.id,
      oldValues: { name: existing.name, status: existing.status },
      newValues: { name: account.name, status: account.status },
    });
    return this.toDto(account);
  }

  async remove(id: string) {
    const existing = await this.getScopedOrThrow(id);
    await this.prisma.account.update({
      where: { id: existing.id },
      data: { deletedAt: new Date(), updatedBy: currentUserId() },
    });
    await this.audit.record({
      action: 'account.deleted',
      entityType: 'account',
      entityId: existing.id,
    });
    return { ok: true };
  }

  /** Loads an account within tenant + ownership scope, or throws 404/403. */
  private async getScopedOrThrow(id: string) {
    const organizationId = requireOrgId();
    const account = await this.prisma.account.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    if (!account) throw new NotFoundException('Account not found');
    if (!canAccessOwned(account.ownerId)) {
      throw new ForbiddenException('You do not have access to this account');
    }
    return account;
  }

  private toDto(a: any) {
    if (!a) return null;
    return {
      id: a.id,
      name: a.name,
      industry: a.industry,
      address: a.address,
      city: a.city,
      country: a.country,
      website: a.website,
      phone: a.phone,
      taxId: a.taxId,
      status: a.status,
      ownerId: a.ownerId,
      owner: a.owner
        ? { id: a.owner.id, name: `${a.owner.firstName} ${a.owner.lastName}` }
        : null,
      tags: a.tags ?? [],
      notes: a.notes,
      customerSince: a.customerSince,
      contactCount: a._count?.contacts,
      contacts: a.contacts?.map((c: any) => ({
        id: c.id,
        name: `${c.firstName} ${c.lastName}`,
        jobTitle: c.jobTitle,
        email: c.email,
        phone: c.phone,
        isPrimary: c.isPrimary,
        isDecisionMaker: c.isDecisionMaker,
      })),
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    };
  }
}
