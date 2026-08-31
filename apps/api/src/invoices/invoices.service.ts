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
  InvoiceStatus,
  INVOICE_TRANSITIONS,
  canTransition,
  toMajorString,
} from '@crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { requireOrgId, currentUserId } from '../common/context/request-context';
import { isOwnScoped, canAccessOwned } from '../common/scope/ownership-scope';
import { UpdateInvoiceDto } from './dto/invoice.dto';

const DEFAULT_DUE_DAYS = 30;
const OPEN_STATUSES = [InvoiceStatus.ISSUED, InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID];

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  async list(params: { q?: string; status?: string; overdue?: boolean; page?: number; limit?: number }) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 25));
    const where: Record<string, unknown> = { ...this.scopeWhere(), deletedAt: null };
    if (params.status) where.status = params.status;
    if (params.overdue) {
      where.status = { in: OPEN_STATUSES };
      where.dueDate = { lt: new Date() };
    }
    if (params.q) {
      where.OR = [
        { invoiceNo: { contains: params.q, mode: 'insensitive' } },
        { account: { name: { contains: params.q, mode: 'insensitive' } } },
      ];
    }
    const [rows, total] = await Promise.all([
      this.prisma.invoice.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit, include: this.refs() }),
      this.prisma.invoice.count({ where }),
    ]);
    return { data: rows.map((r) => this.toDto(r)), pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  /** AR summary: outstanding total and overdue exposure (scope-aware). */
  async summary() {
    const now = new Date();
    const base = { ...this.scopeWhere(), deletedAt: null };
    const open = await this.prisma.invoice.findMany({
      where: { ...base, status: { in: OPEN_STATUSES } },
      select: { total: true, amountPaid: true, dueDate: true },
    });
    let outstanding = 0n;
    let overdueAmount = 0n;
    let overdueCount = 0;
    for (const inv of open) {
      const bal = inv.total - inv.amountPaid;
      outstanding += bal;
      if (inv.dueDate && inv.dueDate < now && bal > 0n) {
        overdueAmount += bal;
        overdueCount += 1;
      }
    }
    return {
      outstanding: toMajorString(outstanding, 'PHP'),
      overdueAmount: toMajorString(overdueAmount, 'PHP'),
      overdueCount,
      openCount: open.length,
    };
  }

  async findOne(id: string) {
    const inv = await this.getScopedOrThrow(id);
    const full = await this.prisma.invoice.findUnique({
      where: { id: inv.id },
      include: {
        ...this.refs(),
        items: { orderBy: { sortOrder: 'asc' } },
        salesOrder: { select: { id: true, orderNo: true } },
        payments: {
          orderBy: { paymentDate: 'desc' },
          include: { receivedBy: { select: { id: true, firstName: true, lastName: true } } },
        },
      },
    });
    return this.toDto(full, true);
  }

  /** Generate an invoice from a sales order (items copied verbatim). */
  async createFromOrder(orderId: string) {
    const organizationId = requireOrgId();
    const order = await this.prisma.salesOrder.findFirst({
      where: { id: orderId, organizationId, deletedAt: null },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!order) throw new NotFoundException('Sales order not found');
    if (isOwnScoped() && !canAccessOwned(order.ownerId)) throw new ForbiddenException('No access to this order');
    if (order.status === 'draft' || order.status === 'cancelled') {
      throw new BadRequestException('Only a confirmed order can be invoiced');
    }
    const existing = await this.prisma.invoice.findFirst({ where: { salesOrderId: order.id, deletedAt: null } });
    if (existing) throw new ConflictException('This order already has an invoice');

    const issueDate = new Date();
    const dueDate = new Date(issueDate.getTime() + DEFAULT_DUE_DAYS * 86400000);

    const invoice = await this.prisma.$transaction(async (tx) => {
      const invoiceNo = await this.nextInvoiceNo(tx, organizationId);
      const created = await tx.invoice.create({
        data: {
          organizationId,
          invoiceNo,
          accountId: order.accountId,
          salesOrderId: order.id,
          contactId: order.contactId,
          ownerId: order.ownerId ?? currentUserId(),
          issueDate,
          dueDate,
          status: InvoiceStatus.ISSUED,
          currency: order.currency,
          subtotal: order.subtotal,
          discountTotal: order.discountTotal,
          taxTotal: order.taxTotal,
          total: order.grandTotal,
          amountPaid: 0n,
          paymentStatus: 'unpaid',
          terms: order.paymentTerms,
          notes: order.notes,
          createdBy: currentUserId(),
          updatedBy: currentUserId(),
          items: {
            create: order.items.map((it) => ({
              organizationId,
              productId: it.productId,
              description: it.description,
              quantity: it.quantity,
              unit: it.unit,
              unitPrice: it.unitPrice,
              discountAmount: it.discountAmount,
              taxRateBp: it.taxRateBp,
              lineSubtotal: it.lineSubtotal,
              lineTax: it.lineTax,
              lineTotal: it.lineTotal,
              sortOrder: it.sortOrder,
            })),
          },
        },
        include: { ...this.refs(), items: { orderBy: { sortOrder: 'asc' } }, salesOrder: { select: { id: true, orderNo: true } } },
      });
      await tx.salesOrder.update({ where: { id: order.id }, data: { billingStatus: 'billed' } });
      return created;
    });

    await this.audit.record({ action: 'invoice.created', entityType: 'invoice', entityId: invoice.id, newValues: { invoiceNo: invoice.invoiceNo, total: invoice.total.toString() } });
    this.emit(DomainEvent.INVOICE_ISSUED, invoice.id, { salesOrderId: order.id });
    return this.toDto(invoice, true);
  }

  async send(id: string) {
    const inv = await this.getScopedOrThrow(id);
    return this.setStatus(inv, InvoiceStatus.SENT);
  }

  async voidInvoice(id: string) {
    const inv = await this.getScopedOrThrow(id);
    if (inv.amountPaid > 0n) throw new BadRequestException('Cannot void an invoice with recorded payments');
    const updated = await this.setStatus(inv, InvoiceStatus.VOID);
    if (inv.salesOrderId) {
      await this.prisma.salesOrder.update({ where: { id: inv.salesOrderId }, data: { billingStatus: 'unbilled' } });
    }
    return updated;
  }

  async update(id: string, dto: UpdateInvoiceDto) {
    const inv = await this.getScopedOrThrow(id);
    const updated = await this.prisma.invoice.update({
      where: { id: inv.id },
      data: {
        ...('dueDate' in dto ? { dueDate: dto.dueDate ? new Date(dto.dueDate) : null } : {}),
        ...('terms' in dto ? { terms: dto.terms ?? null } : {}),
        ...('notes' in dto ? { notes: dto.notes ?? null } : {}),
        updatedBy: currentUserId(),
      },
      include: { ...this.refs(), items: { orderBy: { sortOrder: 'asc' } }, salesOrder: { select: { id: true, orderNo: true } } },
    });
    return this.toDto(updated, true);
  }

  // ---- helpers ----

  private async setStatus(inv: any, status: string) {
    if (!canTransition(INVOICE_TRANSITIONS, inv.status as any, status as any)) {
      throw new BadRequestException(`Illegal invoice transition: ${inv.status} → ${status}`);
    }
    const updated = await this.prisma.invoice.update({
      where: { id: inv.id },
      data: { status, updatedBy: currentUserId() },
      include: { ...this.refs(), items: { orderBy: { sortOrder: 'asc' } }, salesOrder: { select: { id: true, orderNo: true } } },
    });
    await this.audit.record({ action: `invoice.${status}`, entityType: 'invoice', entityId: inv.id, oldValues: { status: inv.status }, newValues: { status } });
    return this.toDto(updated, true);
  }

  private scopeWhere(): Record<string, unknown> {
    const organizationId = requireOrgId();
    if (!isOwnScoped()) return { organizationId };
    return { organizationId, ownerId: currentUserId() };
  }

  private async getScopedOrThrow(id: string) {
    const organizationId = requireOrgId();
    const inv = await this.prisma.invoice.findFirst({ where: { id, organizationId, deletedAt: null } });
    if (!inv) throw new NotFoundException('Invoice not found');
    if (isOwnScoped() && !canAccessOwned(inv.ownerId)) throw new ForbiddenException('You do not have access to this invoice');
    return inv;
  }

  private async nextInvoiceNo(tx: any, organizationId: string): Promise<string> {
    const count = await tx.invoice.count({ where: { organizationId } });
    return `INV-${String(count + 1).padStart(5, '0')}`;
  }

  private refs() {
    return {
      account: { select: { id: true, name: true } },
      contact: { select: { id: true, firstName: true, lastName: true } },
      owner: { select: { id: true, firstName: true, lastName: true } },
    };
  }

  private emit(event: string, entityId: string, data?: unknown) {
    this.events.emit(event, { organizationId: requireOrgId(), actorId: currentUserId(), entityType: 'invoice', entityId, data, at: new Date().toISOString() });
  }

  private toDto(i: any, detailed = false) {
    if (!i) return null;
    const money = (v: bigint) => toMajorString(v, i.currency);
    const outstanding: bigint = (i.total as bigint) - (i.amountPaid as bigint);
    const isOverdue = OPEN_STATUSES.includes(i.status) && i.dueDate && new Date(i.dueDate) < new Date() && outstanding > 0n;
    return {
      id: i.id,
      invoiceNo: i.invoiceNo,
      account: i.account ? { id: i.account.id, name: i.account.name } : null,
      contact: i.contact ? { id: i.contact.id, name: `${i.contact.firstName} ${i.contact.lastName}` } : null,
      owner: i.owner ? { id: i.owner.id, name: `${i.owner.firstName} ${i.owner.lastName}` } : null,
      salesOrder: i.salesOrder ? { id: i.salesOrder.id, orderNo: i.salesOrder.orderNo } : null,
      issueDate: i.issueDate,
      dueDate: i.dueDate,
      status: i.status,
      paymentStatus: i.paymentStatus,
      isOverdue,
      currency: i.currency,
      subtotal: money(i.subtotal),
      discountTotal: money(i.discountTotal),
      taxTotal: money(i.taxTotal),
      total: money(i.total),
      amountPaid: money(i.amountPaid),
      outstanding: money(outstanding),
      terms: i.terms,
      notes: i.notes,
      ...(detailed
        ? {
            items: (i.items ?? []).map((it: any) => ({
              id: it.id,
              description: it.description,
              quantity: it.quantity.toString(),
              unit: it.unit,
              unitPrice: money(it.unitPrice),
              discountAmount: money(it.discountAmount),
              taxRateBp: it.taxRateBp,
              lineTotal: money(it.lineTotal),
            })),
            payments: (i.payments ?? []).map((p: any) => ({
              id: p.id,
              paymentRef: p.paymentRef,
              paymentDate: p.paymentDate,
              amount: money(p.amount),
              method: p.method,
              referenceNumber: p.referenceNumber,
              status: p.status,
              receivedBy: p.receivedBy ? `${p.receivedBy.firstName} ${p.receivedBy.lastName}` : null,
            })),
          }
        : {}),
      createdAt: i.createdAt,
      updatedAt: i.updatedAt,
    };
  }
}
