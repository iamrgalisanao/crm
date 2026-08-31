import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { requireOrgId, currentUserId } from '../common/context/request-context';
import { isOwnScoped, canAccessOwned } from '../common/scope/ownership-scope';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';

@Injectable()
export class ContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(params: { q?: string; accountId?: string; page?: number; limit?: number }) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 25));

    const where: Record<string, unknown> = { ...this.scopeWhere(), deletedAt: null };
    if (params.accountId) where.accountId = params.accountId;
    if (params.q) {
      where.OR = [
        { firstName: { contains: params.q, mode: 'insensitive' } },
        { lastName: { contains: params.q, mode: 'insensitive' } },
        { email: { contains: params.q, mode: 'insensitive' } },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.contact.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { account: { select: { id: true, name: true } } },
      }),
      this.prisma.contact.count({ where }),
    ]);

    return {
      data: rows.map((r) => this.toDto(r)),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const contact = await this.getScopedOrThrow(id);
    const full = await this.prisma.contact.findUnique({
      where: { id: contact.id },
      include: { account: { select: { id: true, name: true } } },
    });
    return this.toDto(full);
  }

  async create(dto: CreateContactDto) {
    const organizationId = requireOrgId();
    if (dto.accountId) await this.assertAccountAccessible(dto.accountId);

    const contact = await this.prisma.$transaction(async (tx) => {
      if (dto.isPrimary && dto.accountId) {
        await tx.contact.updateMany({
          where: { organizationId, accountId: dto.accountId, deletedAt: null },
          data: { isPrimary: false },
        });
      }
      return tx.contact.create({
        data: {
          organizationId,
          accountId: dto.accountId ?? null,
          firstName: dto.firstName,
          lastName: dto.lastName,
          jobTitle: dto.jobTitle ?? null,
          department: dto.department ?? null,
          email: dto.email ?? null,
          phone: dto.phone ?? null,
          mobile: dto.mobile ?? null,
          isDecisionMaker: dto.isDecisionMaker ?? false,
          isPrimary: dto.isPrimary ?? false,
          commPreference: dto.commPreference ?? null,
          notes: dto.notes ?? null,
          createdBy: currentUserId(),
          updatedBy: currentUserId(),
        },
        include: { account: { select: { id: true, name: true } } },
      });
    });

    await this.audit.record({
      action: 'contact.created',
      entityType: 'contact',
      entityId: contact.id,
      newValues: { name: `${contact.firstName} ${contact.lastName}`, accountId: contact.accountId },
    });
    return this.toDto(contact);
  }

  async update(id: string, dto: UpdateContactDto) {
    const organizationId = requireOrgId();
    const existing = await this.getScopedOrThrow(id);
    if (dto.accountId) await this.assertAccountAccessible(dto.accountId);

    const targetAccountId = 'accountId' in dto ? dto.accountId ?? null : existing.accountId;

    const contact = await this.prisma.$transaction(async (tx) => {
      if (dto.isPrimary && targetAccountId) {
        await tx.contact.updateMany({
          where: {
            organizationId,
            accountId: targetAccountId,
            deletedAt: null,
            id: { not: existing.id },
          },
          data: { isPrimary: false },
        });
      }
      return tx.contact.update({
        where: { id: existing.id },
        data: {
          ...('accountId' in dto ? { accountId: dto.accountId ?? null } : {}),
          ...('firstName' in dto ? { firstName: dto.firstName } : {}),
          ...('lastName' in dto ? { lastName: dto.lastName } : {}),
          ...('jobTitle' in dto ? { jobTitle: dto.jobTitle ?? null } : {}),
          ...('department' in dto ? { department: dto.department ?? null } : {}),
          ...('email' in dto ? { email: dto.email ?? null } : {}),
          ...('phone' in dto ? { phone: dto.phone ?? null } : {}),
          ...('mobile' in dto ? { mobile: dto.mobile ?? null } : {}),
          ...('isDecisionMaker' in dto ? { isDecisionMaker: dto.isDecisionMaker } : {}),
          ...('isPrimary' in dto ? { isPrimary: dto.isPrimary } : {}),
          ...('commPreference' in dto ? { commPreference: dto.commPreference ?? null } : {}),
          ...('notes' in dto ? { notes: dto.notes ?? null } : {}),
          updatedBy: currentUserId(),
        },
        include: { account: { select: { id: true, name: true } } },
      });
    });

    await this.audit.record({
      action: 'contact.updated',
      entityType: 'contact',
      entityId: contact.id,
    });
    return this.toDto(contact);
  }

  async remove(id: string) {
    const existing = await this.getScopedOrThrow(id);
    await this.prisma.contact.update({
      where: { id: existing.id },
      data: { deletedAt: new Date(), updatedBy: currentUserId() },
    });
    await this.audit.record({
      action: 'contact.deleted',
      entityType: 'contact',
      entityId: existing.id,
    });
    return { ok: true };
  }

  /** Tenant + ownership scope expressed through the parent account. */
  private scopeWhere(): Record<string, unknown> {
    const organizationId = requireOrgId();
    if (!isOwnScoped()) return { organizationId };
    const userId = currentUserId();
    return {
      organizationId,
      OR: [
        { account: { ownerId: userId } },
        { accountId: null, createdBy: userId },
      ],
    };
  }

  private async assertAccountAccessible(accountId: string): Promise<void> {
    const organizationId = requireOrgId();
    const account = await this.prisma.account.findFirst({
      where: { id: accountId, organizationId, deletedAt: null },
      select: { id: true, ownerId: true },
    });
    if (!account) throw new BadRequestException('Account not found');
    if (!canAccessOwned(account.ownerId)) {
      throw new ForbiddenException('You do not have access to this account');
    }
  }

  private async getScopedOrThrow(id: string) {
    const organizationId = requireOrgId();
    const contact = await this.prisma.contact.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: { account: { select: { ownerId: true } } },
    });
    if (!contact) throw new NotFoundException('Contact not found');
    if (isOwnScoped()) {
      const ownerId = contact.account?.ownerId ?? null;
      const okViaAccount = ownerId === currentUserId();
      const okViaOrphan = contact.accountId === null && contact.createdBy === currentUserId();
      if (!okViaAccount && !okViaOrphan) {
        throw new ForbiddenException('You do not have access to this contact');
      }
    }
    return contact;
  }

  private toDto(c: any) {
    if (!c) return null;
    return {
      id: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      name: `${c.firstName} ${c.lastName}`,
      jobTitle: c.jobTitle,
      department: c.department,
      email: c.email,
      phone: c.phone,
      mobile: c.mobile,
      isDecisionMaker: c.isDecisionMaker,
      isPrimary: c.isPrimary,
      commPreference: c.commPreference,
      notes: c.notes,
      accountId: c.accountId,
      account: c.account ? { id: c.account.id, name: c.account.name } : null,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    };
  }
}
