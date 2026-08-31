import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  DomainEvent,
  QuotationStatus,
  QUOTATION_TRANSITIONS,
  canTransition,
  toMinor,
  toMajorString,
  computeQuoteLine,
  sumQuoteTotals,
  QuoteLineResult,
} from '@crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import {
  requireOrgId,
  currentUserId,
  currentRoleKeys,
  isSuperAdmin,
} from '../common/context/request-context';
import { isOwnScoped, canAccessOwned } from '../common/scope/ownership-scope';
import {
  CreateQuotationDto,
  UpdateQuotationHeaderDto,
  QuotationItemDto,
} from './dto/quotation.dto';

@Injectable()
export class QuotationsService {
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
        { quoteNo: { contains: params.q, mode: 'insensitive' } },
        { account: { name: { contains: params.q, mode: 'insensitive' } } },
      ];
    }
    const [rows, total] = await Promise.all([
      this.prisma.quotation.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: this.refs(),
      }),
      this.prisma.quotation.count({ where }),
    ]);
    return {
      data: rows.map((r) => this.toDto(r)),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const q = await this.getScopedOrThrow(id);
    const full = await this.prisma.quotation.findUnique({
      where: { id: q.id },
      include: this.detailInclude(),
    });
    return this.toDto(full, true);
  }

  private detailInclude() {
    return {
      ...this.refs(),
      items: { orderBy: { sortOrder: 'asc' as const } },
      approvals: {
        orderBy: { tier: 'asc' as const },
        include: { approver: { select: { id: true, firstName: true, lastName: true } } },
      },
    };
  }

  async create(dto: CreateQuotationDto) {
    const organizationId = requireOrgId();
    const currency = await this.baseCurrency();
    if (dto.accountId) await this.assertAccountAccessible(dto.accountId);

    const quotation = await this.prisma.$transaction(async (tx) => {
      const quoteNo = await this.nextQuoteNo(tx, organizationId);
      const { rows, totals } = await this.resolveLines(tx, dto.items, currency);
      const issueDate = dto.issueDate ? new Date(dto.issueDate) : new Date();
      const expiryDate = dto.expiryDate
        ? new Date(dto.expiryDate)
        : dto.validityDays
          ? new Date(issueDate.getTime() + dto.validityDays * 86400000)
          : null;

      return tx.quotation.create({
        data: {
          organizationId,
          quoteNo,
          accountId: dto.accountId ?? null,
          opportunityId: dto.opportunityId ?? null,
          contactId: dto.contactId ?? null,
          ownerId: currentUserId(),
          issueDate,
          expiryDate,
          validityDays: dto.validityDays ?? null,
          currency,
          subtotal: totals.subtotal,
          discountTotal: totals.discountTotal,
          taxTotal: totals.taxTotal,
          grandTotal: totals.grandTotal,
          terms: dto.terms ?? null,
          paymentTerms: dto.paymentTerms ?? null,
          deliveryTerms: dto.deliveryTerms ?? null,
          notes: dto.notes ?? null,
          createdBy: currentUserId(),
          updatedBy: currentUserId(),
          items: { create: rows.map((r) => ({ ...r, organizationId })) },
        },
        include: { ...this.refs(), items: { orderBy: { sortOrder: 'asc' } } },
      });
    });

    await this.audit.record({ action: 'quotation.created', entityType: 'quotation', entityId: quotation.id, newValues: { quoteNo: quotation.quoteNo, grandTotal: quotation.grandTotal.toString() } });
    return this.toDto(quotation, true);
  }

  async updateHeader(id: string, dto: UpdateQuotationHeaderDto) {
    const existing = await this.getScopedOrThrow(id);
    this.assertDraft(existing);
    if (dto.accountId) await this.assertAccountAccessible(dto.accountId);
    const q = await this.prisma.quotation.update({
      where: { id: existing.id },
      data: {
        ...('accountId' in dto ? { accountId: dto.accountId ?? null } : {}),
        ...('opportunityId' in dto ? { opportunityId: dto.opportunityId ?? null } : {}),
        ...('contactId' in dto ? { contactId: dto.contactId ?? null } : {}),
        ...('issueDate' in dto ? { issueDate: dto.issueDate ? new Date(dto.issueDate) : new Date() } : {}),
        ...('expiryDate' in dto ? { expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null } : {}),
        ...('validityDays' in dto ? { validityDays: dto.validityDays ?? null } : {}),
        ...('terms' in dto ? { terms: dto.terms ?? null } : {}),
        ...('paymentTerms' in dto ? { paymentTerms: dto.paymentTerms ?? null } : {}),
        ...('deliveryTerms' in dto ? { deliveryTerms: dto.deliveryTerms ?? null } : {}),
        ...('notes' in dto ? { notes: dto.notes ?? null } : {}),
        updatedBy: currentUserId(),
      },
      include: { ...this.refs(), items: { orderBy: { sortOrder: 'asc' } } },
    });
    return this.toDto(q, true);
  }

  /** Replace all line items and recompute totals server-side. Draft only. */
  async setItems(id: string, items: QuotationItemDto[]) {
    const existing = await this.getScopedOrThrow(id);
    this.assertDraft(existing);
    const currency = existing.currency;

    const q = await this.prisma.$transaction(async (tx) => {
      const { rows, totals } = await this.resolveLines(tx, items, currency);
      await tx.quotationItem.deleteMany({ where: { quotationId: existing.id } });
      await tx.quotationItem.createMany({
        data: rows.map((r) => ({ ...r, quotationId: existing.id, organizationId: existing.organizationId })),
      });
      return tx.quotation.update({
        where: { id: existing.id },
        data: {
          subtotal: totals.subtotal,
          discountTotal: totals.discountTotal,
          taxTotal: totals.taxTotal,
          grandTotal: totals.grandTotal,
          updatedBy: currentUserId(),
        },
        include: { ...this.refs(), items: { orderBy: { sortOrder: 'asc' } } },
      });
    });
    await this.audit.record({ action: 'quotation.items_changed', entityType: 'quotation', entityId: existing.id, newValues: { grandTotal: q.grandTotal.toString() } });
    return this.toDto(q, true);
  }

  async remove(id: string) {
    const existing = await this.getScopedOrThrow(id);
    await this.prisma.quotation.update({ where: { id: existing.id }, data: { deletedAt: new Date(), updatedBy: currentUserId() } });
    await this.audit.record({ action: 'quotation.deleted', entityType: 'quotation', entityId: existing.id });
    return { ok: true };
  }

  // ---- status actions ----

  /**
   * Submit for approval. The grand total selects the applicable approval rule
   * (Phase 0 §11 thresholds); its ordered roles become the approval tiers.
   */
  async submit(id: string) {
    const q = await this.getScopedOrThrow(id);
    this.assertTransition(q.status, QuotationStatus.FOR_APPROVAL);
    const count = await this.prisma.quotationItem.count({ where: { quotationId: q.id } });
    if (count === 0) throw new BadRequestException('Add at least one line item before submitting');

    const rule = await this.findApprovalRule(q.grandTotal);
    const tiers = rule?.requiredRoles ?? [];

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.quotationApproval.deleteMany({ where: { quotationId: q.id } });
      if (tiers.length === 0) {
        // No approver required at this amount — auto-approve.
        return tx.quotation.update({
          where: { id: q.id },
          data: { status: QuotationStatus.APPROVED, approvalState: 'approved', submittedBy: currentUserId(), submittedAt: new Date(), updatedBy: currentUserId() },
          include: this.detailInclude(),
        });
      }
      await tx.quotationApproval.createMany({
        data: tiers.map((role, tier) => ({ organizationId: q.organizationId, quotationId: q.id, tier, requiredRole: role })),
      });
      return tx.quotation.update({
        where: { id: q.id },
        data: { status: QuotationStatus.FOR_APPROVAL, approvalState: 'pending', submittedBy: currentUserId(), submittedAt: new Date(), updatedBy: currentUserId() },
        include: this.detailInclude(),
      });
    });

    await this.audit.record({ action: 'quotation.submitted', entityType: 'quotation', entityId: q.id, newValues: { tiers, ruleId: rule?.id } });
    this.emit(DomainEvent.QUOTATION_SUBMITTED, q.id);
    return this.toDto(updated, true);
  }

  /** Approve the current actionable tier. All tiers approved → quote approved. */
  async approve(id: string, comments?: string) {
    const q = await this.getScopedOrThrow(id);
    if (q.status !== QuotationStatus.FOR_APPROVAL) {
      throw new BadRequestException('Only a quote awaiting approval can be approved');
    }
    const tier = await this.actionableTier(q.id);

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.quotationApproval.update({
        where: { id: tier.id },
        data: { decision: 'approved', approverId: currentUserId(), decidedAt: new Date(), comments: comments ?? null },
      });
      const remaining = await tx.quotationApproval.count({ where: { quotationId: q.id, decision: 'pending' } });
      if (remaining === 0) {
        return tx.quotation.update({
          where: { id: q.id },
          data: { status: QuotationStatus.APPROVED, approvalState: 'approved', updatedBy: currentUserId() },
          include: this.detailInclude(),
        });
      }
      return tx.quotation.findUnique({ where: { id: q.id }, include: this.detailInclude() });
    });

    await this.audit.record({ action: 'quotation.tier_approved', entityType: 'quotation', entityId: q.id, newValues: { tier: tier.tier, role: tier.requiredRole } });
    if (updated?.status === QuotationStatus.APPROVED) this.emit(DomainEvent.QUOTATION_APPROVED, q.id);
    return this.toDto(updated, true);
  }

  /** Reject the current actionable tier — returns the quote to draft as a new version. */
  async reject(id: string, reason: string) {
    const q = await this.getScopedOrThrow(id);
    if (q.status !== QuotationStatus.FOR_APPROVAL) {
      throw new BadRequestException('Only a quote awaiting approval can be rejected');
    }
    const tier = await this.actionableTier(q.id);

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.quotationApproval.update({
        where: { id: tier.id },
        data: { decision: 'rejected', approverId: currentUserId(), decidedAt: new Date(), comments: reason },
      });
      return tx.quotation.update({
        where: { id: q.id },
        data: { status: QuotationStatus.DRAFT, approvalState: 'rejected', rejectionReason: reason, version: { increment: 1 }, updatedBy: currentUserId() },
        include: this.detailInclude(),
      });
    });

    await this.audit.record({ action: 'quotation.rejected', entityType: 'quotation', entityId: q.id, newValues: { reason, tier: tier.tier } });
    this.emit(DomainEvent.QUOTATION_REJECTED, q.id, { reason });
    return this.toDto(updated, true);
  }

  async listApprovalRules() {
    const organizationId = requireOrgId();
    const rules = await this.prisma.approvalRule.findMany({
      where: { organizationId, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    return rules.map((r) => ({
      id: r.id,
      name: r.name,
      minAmount: toMajorString(r.minAmount, 'PHP'),
      maxAmount: r.maxAmount != null ? toMajorString(r.maxAmount, 'PHP') : null,
      requiredRoles: r.requiredRoles,
    }));
  }

  /** Find the pending tier a user may act on next (lowest-tier, must be pending). */
  private async actionableTier(quotationId: string) {
    const pending = await this.prisma.quotationApproval.findFirst({
      where: { quotationId, decision: 'pending' },
      orderBy: { tier: 'asc' },
    });
    if (!pending) throw new BadRequestException('No pending approval tier');
    const roles = currentRoleKeys();
    const canAct = isSuperAdmin() || roles.has('admin') || roles.has(pending.requiredRole);
    if (!canAct) {
      throw new ForbiddenException(`This tier must be approved by: ${pending.requiredRole}`);
    }
    return pending;
  }

  private async findApprovalRule(grandTotal: bigint) {
    const organizationId = requireOrgId();
    const rules = await this.prisma.approvalRule.findMany({
      where: { organizationId, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    return rules.find(
      (r) => grandTotal >= r.minAmount && (r.maxAmount == null || grandTotal < r.maxAmount),
    );
  }

  async send(id: string) {
    const q = await this.getScopedOrThrow(id);
    this.assertTransition(q.status, QuotationStatus.SENT);
    return this.setStatus(q, QuotationStatus.SENT);
  }

  async markViewed(id: string) {
    const q = await this.getScopedOrThrow(id);
    this.assertTransition(q.status, QuotationStatus.VIEWED);
    return this.setStatus(q, QuotationStatus.VIEWED);
  }

  async accept(id: string) {
    const q = await this.getScopedOrThrow(id);
    this.assertTransition(q.status, QuotationStatus.ACCEPTED);
    const updated = await this.setStatus(q, QuotationStatus.ACCEPTED);
    this.emit(DomainEvent.QUOTATION_ACCEPTED, q.id);
    return updated;
  }

  async decline(id: string) {
    const q = await this.getScopedOrThrow(id);
    this.assertTransition(q.status, QuotationStatus.REJECTED);
    return this.setStatus(q, QuotationStatus.REJECTED);
  }

  async cancel(id: string) {
    const q = await this.getScopedOrThrow(id);
    this.assertTransition(q.status, QuotationStatus.CANCELLED);
    return this.setStatus(q, QuotationStatus.CANCELLED);
  }

  // ---- helpers ----

  private async resolveLines(tx: any, items: QuotationItemDto[], currency: string) {
    if (!items || items.length === 0) {
      return { rows: [] as any[], totals: { subtotal: 0n, discountTotal: 0n, taxTotal: 0n, grandTotal: 0n } };
    }
    const organizationId = requireOrgId();
    const productIds = items.map((i) => i.productId).filter(Boolean) as string[];

    const products = productIds.length
      ? await tx.product.findMany({ where: { id: { in: productIds }, organizationId, deletedAt: null } })
      : [];
    const productMap = new Map(products.map((p: any) => [p.id, p]));
    const taxes = await tx.taxRate.findMany({ where: { organizationId } });
    const taxMap = new Map(taxes.map((t: any) => [t.id, t.rateBp]));

    const rows: any[] = [];
    const results: QuoteLineResult[] = [];
    items.forEach((item, index) => {
      const product: any = item.productId ? productMap.get(item.productId) : null;
      if (item.productId && !product) throw new BadRequestException('Product not found in catalog');

      const description = item.description ?? product?.name;
      if (!description) throw new BadRequestException('Each line needs a description (or a product)');

      const unitPrice = item.unitPrice != null
        ? toMinor(item.unitPrice, currency)
        : (product?.defaultPrice as bigint | undefined);
      if (unitPrice == null) throw new BadRequestException('Each line needs a unit price (or a product)');

      const taxRateId = item.taxRateId ?? product?.taxRateId ?? null;
      const taxRateBp = taxRateId ? Number(taxMap.get(taxRateId) ?? 0) : 0;
      const quantity = item.quantity ?? '1';
      const discountType = item.discountType ?? 'none';
      const discountValue = item.discountValue ?? '0';

      const line = computeQuoteLine({ unitPrice, quantity, discountType, discountValue, taxRateBp, currency });
      results.push(line);
      rows.push({
        productId: item.productId ?? null,
        description,
        quantity,
        unit: item.unit ?? product?.unit ?? 'unit',
        unitPrice,
        discountType,
        discountValue,
        discountAmount: line.discountAmount,
        taxRateId,
        taxRateBp,
        lineSubtotal: line.lineSubtotal,
        lineTax: line.lineTax,
        lineTotal: line.lineTotal,
        sortOrder: index,
      });
    });

    return { rows, totals: sumQuoteTotals(results) };
  }

  private assertDraft(q: any) {
    if (q.status !== QuotationStatus.DRAFT) {
      throw new BadRequestException('Only draft quotations can be edited');
    }
  }

  private assertTransition(from: string, to: string) {
    if (!canTransition(QUOTATION_TRANSITIONS, from as any, to as any)) {
      throw new BadRequestException(`Illegal quotation transition: ${from} → ${to}`);
    }
  }

  private async setStatus(q: any, status: string, extra: Record<string, unknown> = {}) {
    const updated = await this.prisma.quotation.update({
      where: { id: q.id },
      data: { status, ...extra, updatedBy: currentUserId() },
      include: { ...this.refs(), items: { orderBy: { sortOrder: 'asc' } } },
    });
    await this.audit.record({
      action: `quotation.${status}`,
      entityType: 'quotation',
      entityId: q.id,
      oldValues: { status: q.status },
      newValues: { status },
    });
    return this.toDto(updated, true);
  }

  private scopeWhere(): Record<string, unknown> {
    const organizationId = requireOrgId();
    if (!isOwnScoped()) return { organizationId };
    return { organizationId, ownerId: currentUserId() };
  }

  private async getScopedOrThrow(id: string) {
    const organizationId = requireOrgId();
    const q = await this.prisma.quotation.findFirst({ where: { id, organizationId, deletedAt: null } });
    if (!q) throw new NotFoundException('Quotation not found');
    if (isOwnScoped() && !canAccessOwned(q.ownerId)) {
      throw new ForbiddenException('You do not have access to this quotation');
    }
    return q;
  }

  private async assertAccountAccessible(accountId: string): Promise<void> {
    const organizationId = requireOrgId();
    const acc = await this.prisma.account.findFirst({ where: { id: accountId, organizationId, deletedAt: null }, select: { ownerId: true } });
    if (!acc) throw new BadRequestException('Account not found');
    if (!canAccessOwned(acc.ownerId)) throw new ForbiddenException('No access to that account');
  }

  private async nextQuoteNo(tx: any, organizationId: string): Promise<string> {
    const count = await tx.quotation.count({ where: { organizationId } });
    return `Q-${String(count + 1).padStart(5, '0')}`;
  }

  private async baseCurrency(): Promise<string> {
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: requireOrgId() }, select: { baseCurrency: true } });
    return org.baseCurrency;
  }

  private refs() {
    return {
      account: { select: { id: true, name: true } },
      opportunity: { select: { id: true, name: true } },
      contact: { select: { id: true, firstName: true, lastName: true } },
      owner: { select: { id: true, firstName: true, lastName: true } },
    };
  }

  private emit(event: string, entityId: string, data?: unknown) {
    this.events.emit(event, {
      organizationId: requireOrgId(),
      actorId: currentUserId(),
      entityType: 'quotation',
      entityId,
      data,
      at: new Date().toISOString(),
    });
  }

  private toDto(q: any, detailed = false) {
    if (!q) return null;
    const money = (v: bigint) => toMajorString(v, q.currency);
    return {
      id: q.id,
      quoteNo: q.quoteNo,
      account: q.account ? { id: q.account.id, name: q.account.name } : null,
      opportunity: q.opportunity ? { id: q.opportunity.id, name: q.opportunity.name } : null,
      contact: q.contact ? { id: q.contact.id, name: `${q.contact.firstName} ${q.contact.lastName}` } : null,
      owner: q.owner ? { id: q.owner.id, name: `${q.owner.firstName} ${q.owner.lastName}` } : null,
      issueDate: q.issueDate,
      expiryDate: q.expiryDate,
      validityDays: q.validityDays,
      status: q.status,
      approvalState: q.approvalState,
      rejectionReason: q.rejectionReason,
      submittedAt: q.submittedAt,
      salesOrderId: q.salesOrderId,
      version: q.version,
      currency: q.currency,
      subtotal: money(q.subtotal),
      discountTotal: money(q.discountTotal),
      taxTotal: money(q.taxTotal),
      grandTotal: money(q.grandTotal),
      terms: q.terms,
      paymentTerms: q.paymentTerms,
      deliveryTerms: q.deliveryTerms,
      notes: q.notes,
      ...(detailed
        ? {
            items: (q.items ?? []).map((it: any) => ({
              id: it.id,
              productId: it.productId,
              description: it.description,
              quantity: it.quantity.toString(),
              unit: it.unit,
              unitPrice: money(it.unitPrice),
              discountType: it.discountType,
              discountValue: it.discountValue.toString(),
              discountAmount: money(it.discountAmount),
              taxRateId: it.taxRateId,
              taxRateBp: it.taxRateBp,
              lineSubtotal: money(it.lineSubtotal),
              lineTax: money(it.lineTax),
              lineTotal: money(it.lineTotal),
            })),
            approvals: (q.approvals ?? []).map((a: any) => ({
              id: a.id,
              tier: a.tier,
              requiredRole: a.requiredRole,
              decision: a.decision,
              comments: a.comments,
              decidedAt: a.decidedAt,
              approver: a.approver ? { id: a.approver.id, name: `${a.approver.firstName} ${a.approver.lastName}` } : null,
            })),
          }
        : {}),
      createdAt: q.createdAt,
      updatedAt: q.updatedAt,
    };
  }
}
