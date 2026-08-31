import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  DomainEvent,
  SalesOrderStatus,
  QuotationStatus,
  SALES_ORDER_TRANSITIONS,
  canTransition,
  toMajorString,
} from '@crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { requireOrgId, currentUserId } from '../common/context/request-context';
import { isOwnScoped, canAccessOwned } from '../common/scope/ownership-scope';
import { ChangeOrderStatusDto, SetDeliveryStatusDto, UpdateOrderDto } from './dto/order.dto';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  async list(params: { q?: string; status?: string; page?: number; limit?: number }) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 25));
    const where: Record<string, unknown> = { ...this.scopeWhere(), deletedAt: null };
    if (params.status) where.status = params.status;
    if (params.q) {
      where.OR = [
        { orderNo: { contains: params.q, mode: 'insensitive' } },
        { account: { name: { contains: params.q, mode: 'insensitive' } } },
      ];
    }
    const [rows, total] = await Promise.all([
      this.prisma.salesOrder.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit, include: this.refs() }),
      this.prisma.salesOrder.count({ where }),
    ]);
    return { data: rows.map((r) => this.toDto(r)), pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  async findOne(id: string) {
    const o = await this.getScopedOrThrow(id);
    const full = await this.prisma.salesOrder.findUnique({
      where: { id: o.id },
      include: {
        ...this.refs(),
        items: { orderBy: { sortOrder: 'asc' } },
        quotation: { select: { id: true, quoteNo: true } },
        invoices: { where: { deletedAt: null }, select: { id: true, invoiceNo: true, status: true } },
      },
    });
    return this.toDto(full, true);
  }

  /** Convert an accepted quotation into a sales order (items copied verbatim). */
  async createFromQuotation(quotationId: string) {
    const organizationId = requireOrgId();
    const quote = await this.prisma.quotation.findFirst({
      where: { id: quotationId, organizationId, deletedAt: null },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!quote) throw new NotFoundException('Quotation not found');
    if (isOwnScoped() && !canAccessOwned(quote.ownerId)) throw new ForbiddenException('No access to this quotation');
    if (quote.status !== QuotationStatus.ACCEPTED) {
      throw new BadRequestException('Only an accepted quotation can be converted to a sales order');
    }
    if (quote.salesOrderId) throw new ConflictException('This quotation already has a sales order');

    const order = await this.prisma.$transaction(async (tx) => {
      const orderNo = await this.nextOrderNo(tx, organizationId);
      const created = await tx.salesOrder.create({
        data: {
          organizationId,
          orderNo,
          accountId: quote.accountId,
          quotationId: quote.id,
          contactId: quote.contactId,
          ownerId: quote.ownerId ?? currentUserId(),
          status: SalesOrderStatus.CONFIRMED,
          currency: quote.currency,
          subtotal: quote.subtotal,
          discountTotal: quote.discountTotal,
          taxTotal: quote.taxTotal,
          grandTotal: quote.grandTotal,
          terms: quote.terms,
          paymentTerms: quote.paymentTerms,
          deliveryTerms: quote.deliveryTerms,
          notes: quote.notes,
          createdBy: currentUserId(),
          updatedBy: currentUserId(),
          items: {
            create: quote.items.map((it) => ({
              organizationId,
              productId: it.productId,
              description: it.description,
              quantity: it.quantity,
              unit: it.unit,
              unitPrice: it.unitPrice,
              discountType: it.discountType,
              discountValue: it.discountValue,
              discountAmount: it.discountAmount,
              taxRateId: it.taxRateId,
              taxRateBp: it.taxRateBp,
              lineSubtotal: it.lineSubtotal,
              lineTax: it.lineTax,
              lineTotal: it.lineTotal,
              sortOrder: it.sortOrder,
            })),
          },
        },
        include: { ...this.refs(), items: { orderBy: { sortOrder: 'asc' } }, quotation: { select: { id: true, quoteNo: true } } },
      });
      await tx.quotation.update({ where: { id: quote.id }, data: { salesOrderId: created.id } });
      return created;
    });

    await this.audit.record({ action: 'sales_order.created', entityType: 'sales_order', entityId: order.id, newValues: { orderNo: order.orderNo, fromQuote: quote.quoteNo } });
    this.emit(DomainEvent.SALES_ORDER_CREATED, order.id, { quotationId: quote.id });
    return this.toDto(order, true);
  }

  async changeStatus(id: string, dto: ChangeOrderStatusDto) {
    const existing = await this.getScopedOrThrow(id);
    if (!canTransition(SALES_ORDER_TRANSITIONS, existing.status as any, dto.status as any)) {
      throw new BadRequestException(`Illegal order transition: ${existing.status} → ${dto.status}`);
    }
    const order = await this.prisma.salesOrder.update({
      where: { id: existing.id },
      data: { status: dto.status, updatedBy: currentUserId() },
      include: { ...this.refs(), items: { orderBy: { sortOrder: 'asc' } }, quotation: { select: { id: true, quoteNo: true } } },
    });
    await this.audit.record({ action: `sales_order.${dto.status}`, entityType: 'sales_order', entityId: id, oldValues: { status: existing.status }, newValues: { status: dto.status } });
    return this.toDto(order, true);
  }

  async setDeliveryStatus(id: string, dto: SetDeliveryStatusDto) {
    const existing = await this.getScopedOrThrow(id);
    const order = await this.prisma.salesOrder.update({
      where: { id: existing.id },
      data: { deliveryStatus: dto.deliveryStatus, updatedBy: currentUserId() },
      include: { ...this.refs(), items: { orderBy: { sortOrder: 'asc' } }, quotation: { select: { id: true, quoteNo: true } } },
    });
    await this.audit.record({ action: 'sales_order.delivery_changed', entityType: 'sales_order', entityId: id, newValues: { deliveryStatus: dto.deliveryStatus } });
    return this.toDto(order, true);
  }

  async update(id: string, dto: UpdateOrderDto) {
    const existing = await this.getScopedOrThrow(id);
    const order = await this.prisma.salesOrder.update({
      where: { id: existing.id },
      data: {
        ...('terms' in dto ? { terms: dto.terms ?? null } : {}),
        ...('paymentTerms' in dto ? { paymentTerms: dto.paymentTerms ?? null } : {}),
        ...('deliveryTerms' in dto ? { deliveryTerms: dto.deliveryTerms ?? null } : {}),
        ...('notes' in dto ? { notes: dto.notes ?? null } : {}),
        updatedBy: currentUserId(),
      },
      include: { ...this.refs(), items: { orderBy: { sortOrder: 'asc' } }, quotation: { select: { id: true, quoteNo: true } } },
    });
    return this.toDto(order, true);
  }

  // ---- helpers ----

  private scopeWhere(): Record<string, unknown> {
    const organizationId = requireOrgId();
    if (!isOwnScoped()) return { organizationId };
    return { organizationId, ownerId: currentUserId() };
  }

  private async getScopedOrThrow(id: string) {
    const organizationId = requireOrgId();
    const o = await this.prisma.salesOrder.findFirst({ where: { id, organizationId, deletedAt: null } });
    if (!o) throw new NotFoundException('Sales order not found');
    if (isOwnScoped() && !canAccessOwned(o.ownerId)) throw new ForbiddenException('You do not have access to this order');
    return o;
  }

  private async nextOrderNo(tx: any, organizationId: string): Promise<string> {
    const count = await tx.salesOrder.count({ where: { organizationId } });
    return `SO-${String(count + 1).padStart(5, '0')}`;
  }

  private refs() {
    return {
      account: { select: { id: true, name: true } },
      contact: { select: { id: true, firstName: true, lastName: true } },
      owner: { select: { id: true, firstName: true, lastName: true } },
    };
  }

  private emit(event: string, entityId: string, data?: unknown) {
    this.events.emit(event, { organizationId: requireOrgId(), actorId: currentUserId(), entityType: 'sales_order', entityId, data, at: new Date().toISOString() });
  }

  private toDto(o: any, detailed = false) {
    if (!o) return null;
    const money = (v: bigint) => toMajorString(v, o.currency);
    return {
      id: o.id,
      orderNo: o.orderNo,
      account: o.account ? { id: o.account.id, name: o.account.name } : null,
      contact: o.contact ? { id: o.contact.id, name: `${o.contact.firstName} ${o.contact.lastName}` } : null,
      owner: o.owner ? { id: o.owner.id, name: `${o.owner.firstName} ${o.owner.lastName}` } : null,
      quotation: o.quotation ? { id: o.quotation.id, quoteNo: o.quotation.quoteNo } : null,
      orderDate: o.orderDate,
      status: o.status,
      deliveryStatus: o.deliveryStatus,
      billingStatus: o.billingStatus,
      currency: o.currency,
      subtotal: money(o.subtotal),
      discountTotal: money(o.discountTotal),
      taxTotal: money(o.taxTotal),
      grandTotal: money(o.grandTotal),
      terms: o.terms,
      paymentTerms: o.paymentTerms,
      deliveryTerms: o.deliveryTerms,
      notes: o.notes,
      ...(detailed
        ? {
            items: (o.items ?? []).map((it: any) => ({
              id: it.id,
              description: it.description,
              quantity: it.quantity.toString(),
              unit: it.unit,
              unitPrice: money(it.unitPrice),
              discountAmount: money(it.discountAmount),
              taxRateBp: it.taxRateBp,
              lineTotal: money(it.lineTotal),
            })),
            invoices: (o.invoices ?? []).map((inv: any) => ({ id: inv.id, invoiceNo: inv.invoiceNo, status: inv.status })),
          }
        : {}),
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
    };
  }
}
