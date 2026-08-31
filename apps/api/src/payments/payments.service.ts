import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DomainEvent, InvoiceStatus, toMinor, toMajorString } from '@crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { requireOrgId, currentUserId } from '../common/context/request-context';
import { isOwnScoped, canAccessOwned } from '../common/scope/ownership-scope';
import { CreatePaymentDto } from './dto/payment.dto';

const CLOSED_INVOICE = [InvoiceStatus.VOID, InvoiceStatus.CANCELLED];

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  async list(params: { invoiceId?: string; page?: number; limit?: number }) {
    const organizationId = requireOrgId();
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 50));
    const where: Record<string, unknown> = { organizationId };
    if (params.invoiceId) where.invoiceId = params.invoiceId;

    const [rows, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        orderBy: { paymentDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          invoice: { select: { id: true, invoiceNo: true } },
          account: { select: { id: true, name: true } },
          receivedBy: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.payment.count({ where }),
    ]);
    return { data: rows.map((r) => this.toDto(r)), pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  /** Record a payment and atomically recompute the invoice balance/status. */
  async create(dto: CreatePaymentDto) {
    const organizationId = requireOrgId();
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: dto.invoiceId, organizationId, deletedAt: null },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (isOwnScoped() && !canAccessOwned(invoice.ownerId)) throw new ForbiddenException('No access to this invoice');
    if (CLOSED_INVOICE.includes(invoice.status as any)) {
      throw new BadRequestException(`Cannot record a payment on a ${invoice.status} invoice`);
    }

    const amount = toMinor(dto.amount, invoice.currency);
    if (amount <= 0n) throw new BadRequestException('Payment amount must be greater than zero');
    const outstanding = invoice.total - invoice.amountPaid;
    if (amount > outstanding) {
      throw new BadRequestException(`Payment exceeds the outstanding balance of ${toMajorString(outstanding, invoice.currency)}`);
    }

    const payment = await this.prisma.$transaction(async (tx) => {
      const paymentRef = await this.nextPaymentRef(tx, organizationId);
      const created = await tx.payment.create({
        data: {
          organizationId,
          paymentRef,
          invoiceId: invoice.id,
          accountId: invoice.accountId,
          paymentDate: dto.paymentDate ? new Date(dto.paymentDate) : new Date(),
          amount,
          currency: invoice.currency,
          method: dto.method,
          referenceNumber: dto.referenceNumber ?? null,
          bank: dto.bank ?? null,
          receivedById: currentUserId(),
          notes: dto.notes ?? null,
          createdBy: currentUserId(),
        },
        include: {
          invoice: { select: { id: true, invoiceNo: true } },
          account: { select: { id: true, name: true } },
          receivedBy: { select: { id: true, firstName: true, lastName: true } },
        },
      });
      await this.recomputeInvoice(tx, invoice.id);
      return created;
    });

    await this.audit.record({ action: 'payment.recorded', entityType: 'payment', entityId: payment.id, newValues: { amount: amount.toString(), invoiceId: invoice.id } });
    this.emit(DomainEvent.PAYMENT_RECORDED, payment.id, { invoiceId: invoice.id });
    return this.toDto(payment);
  }

  /** Reverse a payment (compensating entry — never a hard delete). */
  async reverse(id: string) {
    const organizationId = requireOrgId();
    const payment = await this.prisma.payment.findFirst({ where: { id, organizationId } });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status === 'reversed') throw new BadRequestException('Payment already reversed');

    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({ where: { id: payment.id }, data: { status: 'reversed', reversedAt: new Date() } });
      await this.recomputeInvoice(tx, payment.invoiceId);
    });
    await this.audit.record({ action: 'payment.reversed', entityType: 'payment', entityId: payment.id });
    return { ok: true };
  }

  /** Recompute an invoice's amountPaid, payment status and status from recorded payments. */
  private async recomputeInvoice(tx: any, invoiceId: string): Promise<void> {
    const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    const agg = await tx.payment.aggregate({
      where: { invoiceId, status: 'recorded' },
      _sum: { amount: true },
    });
    const amountPaid: bigint = (agg._sum.amount as bigint | null) ?? 0n;

    let paymentStatus = 'unpaid';
    if (amountPaid >= invoice.total && invoice.total > 0n) paymentStatus = 'paid';
    else if (amountPaid > 0n) paymentStatus = 'partial';

    // Only advance status for open invoices; never touch void/cancelled.
    let status = invoice.status;
    if (!CLOSED_INVOICE.includes(invoice.status)) {
      if (paymentStatus === 'paid') status = InvoiceStatus.PAID;
      else if (paymentStatus === 'partial') status = InvoiceStatus.PARTIALLY_PAID;
      else if (invoice.status === InvoiceStatus.PARTIALLY_PAID || invoice.status === InvoiceStatus.PAID) {
        // Payments fully reversed — fall back to sent (or issued if never sent).
        status = InvoiceStatus.SENT;
      }
    }

    await tx.invoice.update({
      where: { id: invoiceId },
      data: { amountPaid, paymentStatus, status, updatedBy: currentUserId() },
    });
  }

  private async nextPaymentRef(tx: any, organizationId: string): Promise<string> {
    const count = await tx.payment.count({ where: { organizationId } });
    return `PAY-${String(count + 1).padStart(5, '0')}`;
  }

  private emit(event: string, entityId: string, data?: unknown) {
    this.events.emit(event, { organizationId: requireOrgId(), actorId: currentUserId(), entityType: 'payment', entityId, data, at: new Date().toISOString() });
  }

  private toDto(p: any) {
    return {
      id: p.id,
      paymentRef: p.paymentRef,
      invoice: p.invoice ? { id: p.invoice.id, invoiceNo: p.invoice.invoiceNo } : null,
      account: p.account ? { id: p.account.id, name: p.account.name } : null,
      paymentDate: p.paymentDate,
      amount: toMajorString(p.amount, p.currency),
      currency: p.currency,
      method: p.method,
      referenceNumber: p.referenceNumber,
      bank: p.bank,
      receivedBy: p.receivedBy ? { id: p.receivedBy.id, name: `${p.receivedBy.firstName} ${p.receivedBy.lastName}` } : null,
      notes: p.notes,
      status: p.status,
      createdAt: p.createdAt,
    };
  }
}
