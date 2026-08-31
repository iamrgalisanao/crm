import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { toMinor, toMajorString } from '@crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { requireOrgId, currentUserId } from '../common/context/request-context';
import { CreateProductDto, UpdateProductDto, CreateCategoryDto } from './dto/product.dto';

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(params: { q?: string; categoryId?: string; type?: string; active?: string; page?: number; limit?: number }) {
    const organizationId = requireOrgId();
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(200, Math.max(1, params.limit ?? 50));

    const where: Record<string, unknown> = { organizationId, deletedAt: null };
    if (params.categoryId) where.categoryId = params.categoryId;
    if (params.type) where.type = params.type;
    if (params.active === 'true') where.isActive = true;
    if (params.active === 'false') where.isActive = false;
    if (params.q) {
      where.OR = [
        { name: { contains: params.q, mode: 'insensitive' } },
        { sku: { contains: params.q, mode: 'insensitive' } },
        { description: { contains: params.q, mode: 'insensitive' } },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { category: { select: { id: true, name: true } }, taxRate: { select: { id: true, name: true, rateBp: true } } },
      }),
      this.prisma.product.count({ where }),
    ]);
    return {
      data: rows.map((r) => this.toDto(r)),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const organizationId = requireOrgId();
    const product = await this.prisma.product.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: { category: { select: { id: true, name: true } }, taxRate: { select: { id: true, name: true, rateBp: true } } },
    });
    if (!product) throw new NotFoundException('Product not found');
    return this.toDto(product);
  }

  async create(dto: CreateProductDto) {
    const organizationId = requireOrgId();
    const currency = await this.baseCurrency();

    const exists = await this.prisma.product.findFirst({
      where: { organizationId, sku: dto.sku, deletedAt: null },
    });
    if (exists) throw new ConflictException('A product with this SKU already exists');

    const product = await this.prisma.product.create({
      data: {
        organizationId,
        sku: dto.sku,
        name: dto.name,
        categoryId: dto.categoryId ?? null,
        description: dto.description ?? null,
        type: dto.type ?? 'product',
        unit: dto.unit ?? 'unit',
        defaultPrice: dto.defaultPrice ? toMinor(dto.defaultPrice, currency) : 0n,
        cost: dto.cost ? toMinor(dto.cost, currency) : null,
        currency,
        taxRateId: dto.taxRateId ?? null,
        isActive: dto.isActive ?? true,
        createdBy: currentUserId(),
        updatedBy: currentUserId(),
      },
      include: { category: { select: { id: true, name: true } }, taxRate: { select: { id: true, name: true, rateBp: true } } },
    });
    await this.audit.record({ action: 'product.created', entityType: 'product', entityId: product.id, newValues: { sku: product.sku, name: product.name } });
    return this.toDto(product);
  }

  async update(id: string, dto: UpdateProductDto) {
    const organizationId = requireOrgId();
    const existing = await this.prisma.product.findFirst({ where: { id, organizationId, deletedAt: null } });
    if (!existing) throw new NotFoundException('Product not found');

    if (dto.sku && dto.sku !== existing.sku) {
      const clash = await this.prisma.product.findFirst({ where: { organizationId, sku: dto.sku, deletedAt: null, id: { not: id } } });
      if (clash) throw new ConflictException('A product with this SKU already exists');
    }

    const product = await this.prisma.product.update({
      where: { id },
      data: {
        ...('sku' in dto ? { sku: dto.sku } : {}),
        ...('name' in dto ? { name: dto.name } : {}),
        ...('categoryId' in dto ? { categoryId: dto.categoryId ?? null } : {}),
        ...('description' in dto ? { description: dto.description ?? null } : {}),
        ...('type' in dto ? { type: dto.type } : {}),
        ...('unit' in dto ? { unit: dto.unit } : {}),
        ...('defaultPrice' in dto ? { defaultPrice: dto.defaultPrice ? toMinor(dto.defaultPrice, existing.currency) : 0n } : {}),
        ...('cost' in dto ? { cost: dto.cost ? toMinor(dto.cost, existing.currency) : null } : {}),
        ...('taxRateId' in dto ? { taxRateId: dto.taxRateId ?? null } : {}),
        ...('isActive' in dto ? { isActive: dto.isActive } : {}),
        updatedBy: currentUserId(),
      },
      include: { category: { select: { id: true, name: true } }, taxRate: { select: { id: true, name: true, rateBp: true } } },
    });
    await this.audit.record({ action: 'product.updated', entityType: 'product', entityId: product.id });
    return this.toDto(product);
  }

  async remove(id: string) {
    const organizationId = requireOrgId();
    const existing = await this.prisma.product.findFirst({ where: { id, organizationId, deletedAt: null } });
    if (!existing) throw new NotFoundException('Product not found');
    await this.prisma.product.update({ where: { id }, data: { deletedAt: new Date(), isActive: false, updatedBy: currentUserId() } });
    await this.audit.record({ action: 'product.deleted', entityType: 'product', entityId: id });
    return { ok: true };
  }

  // ---- categories & tax rates ----

  async listCategories() {
    const organizationId = requireOrgId();
    return this.prisma.productCategory.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, parentId: true },
    });
  }

  async createCategory(dto: CreateCategoryDto) {
    const organizationId = requireOrgId();
    const category = await this.prisma.productCategory.create({
      data: { organizationId, name: dto.name, parentId: dto.parentId ?? null },
    });
    await this.audit.record({ action: 'product_category.created', entityType: 'product_category', entityId: category.id });
    return { id: category.id, name: category.name, parentId: category.parentId };
  }

  async listTaxRates() {
    const organizationId = requireOrgId();
    return this.prisma.taxRate.findMany({
      where: { organizationId, isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, rateBp: true, isInclusive: true },
    });
  }

  // ---- helpers ----

  private async baseCurrency(): Promise<string> {
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: requireOrgId() },
      select: { baseCurrency: true },
    });
    return org.baseCurrency;
  }

  private toDto(p: any) {
    return {
      id: p.id,
      sku: p.sku,
      name: p.name,
      category: p.category ? { id: p.category.id, name: p.category.name } : null,
      description: p.description,
      type: p.type,
      unit: p.unit,
      defaultPrice: toMajorString(p.defaultPrice, p.currency),
      cost: p.cost != null ? toMajorString(p.cost, p.currency) : null,
      currency: p.currency,
      taxRate: p.taxRate ? { id: p.taxRate.id, name: p.taxRate.name, rateBp: p.taxRate.rateBp } : null,
      isActive: p.isActive,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  }
}
