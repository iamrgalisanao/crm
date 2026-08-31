import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as crypto from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { requireOrgId, currentUserId } from '../common/context/request-context';
import { LeadsService } from '../leads/leads.service';
import { normalizeInbound } from './adapters/inbound-adapter';

const PROVIDERS = ['generic', 'facebook', 'messenger', 'website', 'email', 'whatsapp', 'api'];
const PROVIDER_SOURCE_KEY: Record<string, string> = {
  facebook: 'facebook', messenger: 'messenger', website: 'website',
  email: 'email', whatsapp: 'whatsapp', generic: 'manual', api: 'manual',
};

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly leads: LeadsService,
  ) {}

  // ---- channels ----

  async listChannels() {
    const organizationId = requireOrgId();
    const channels = await this.prisma.integrationChannel.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { messages: true } } },
    });
    return channels.map((c) => this.channelDto(c));
  }

  async createChannel(dto: { provider: string; name: string }) {
    const organizationId = requireOrgId();
    if (!PROVIDERS.includes(dto.provider)) throw new BadRequestException('Unknown provider');
    const secret = crypto.randomBytes(24).toString('hex');
    const channel = await this.prisma.integrationChannel.create({
      data: { organizationId, provider: dto.provider, name: dto.name, secret, createdBy: currentUserId() },
      include: { _count: { select: { messages: true } } },
    });
    await this.audit.record({ action: 'channel.created', entityType: 'integration_channel', entityId: channel.id, newValues: { provider: dto.provider, name: dto.name } });
    return this.channelDto(channel, true);
  }

  async setChannelStatus(id: string, status: 'active' | 'disabled') {
    const organizationId = requireOrgId();
    const existing = await this.prisma.integrationChannel.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException('Channel not found');
    const channel = await this.prisma.integrationChannel.update({
      where: { id }, data: { status },
      include: { _count: { select: { messages: true } } },
    });
    return this.channelDto(channel);
  }

  async deleteChannel(id: string) {
    const organizationId = requireOrgId();
    const existing = await this.prisma.integrationChannel.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException('Channel not found');
    await this.prisma.integrationChannel.delete({ where: { id } });
    return { ok: true };
  }

  // ---- webhook ingest (public; verified by channel secret) ----

  async ingest(channelId: string, providedSecret: string | undefined, payload: any) {
    const channel = await this.prisma.integrationChannel.findUnique({ where: { id: channelId } });
    if (!channel) throw new NotFoundException('Channel not found');
    if (!this.verifySecret(channel.secret, providedSecret)) {
      throw new UnauthorizedException('Invalid webhook secret');
    }
    if (channel.status !== 'active') throw new ForbiddenException('Channel is disabled');

    const messages = normalizeInbound(channel.provider, payload);
    let accepted = 0;
    let deduped = 0;
    for (const m of messages) {
      if (m.externalId) {
        const existing = await this.prisma.inboundMessage.findUnique({
          where: { channelId_externalId: { channelId, externalId: m.externalId } },
        });
        if (existing) { deduped++; continue; }
      }
      await this.prisma.inboundMessage.create({
        data: {
          organizationId: channel.organizationId,
          channelId,
          externalId: m.externalId ?? null,
          fromName: m.fromName ?? null,
          fromHandle: m.fromHandle ?? null,
          subject: m.subject ?? null,
          body: m.body ?? null,
          receivedAt: m.receivedAt ? new Date(m.receivedAt) : new Date(),
          raw: payload,
        },
      });
      accepted++;
    }
    return { accepted, deduped, received: messages.length };
  }

  // ---- inbox ----

  async listInbox(params: { status?: string; page?: number; limit?: number }) {
    const organizationId = requireOrgId();
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 30));
    const where: Record<string, unknown> = { organizationId };
    where.status = params.status ?? 'new';

    const [rows, total, newCount] = await Promise.all([
      this.prisma.inboundMessage.findMany({
        where, orderBy: { receivedAt: 'desc' }, skip: (page - 1) * limit, take: limit,
        include: { channel: { select: { id: true, name: true, provider: true } } },
      }),
      this.prisma.inboundMessage.count({ where }),
      this.prisma.inboundMessage.count({ where: { organizationId, status: 'new' } }),
    ]);
    return {
      data: rows.map((m) => this.messageDto(m)),
      newCount,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  async convert(messageId: string) {
    const organizationId = requireOrgId();
    const msg = await this.prisma.inboundMessage.findFirst({
      where: { id: messageId, organizationId },
      include: { channel: true },
    });
    if (!msg) throw new NotFoundException('Message not found');
    if (msg.status === 'converted') throw new BadRequestException('Message already converted');

    const sourceKey = PROVIDER_SOURCE_KEY[msg.channel.provider] ?? 'other';
    const source = await this.prisma.leadSource.findFirst({ where: { organizationId, key: sourceKey }, select: { id: true } });

    const handle = msg.fromHandle ?? '';
    const isEmail = /@/.test(handle);
    const isPhone = /^\+?[0-9\s-]{6,}$/.test(handle);

    const lead = await this.leads.create({
      name: msg.fromName || 'Inbox lead',
      email: isEmail ? handle : undefined,
      phone: isPhone ? handle : undefined,
      interest: msg.subject ?? undefined,
      notes: msg.body ?? undefined,
      sourceId: source?.id,
    } as any);
    if (!lead) throw new BadRequestException('Failed to create lead from message');

    await this.prisma.inboundMessage.update({
      where: { id: msg.id },
      data: { status: 'converted', linkedLeadId: lead.id },
    });
    await this.audit.record({ action: 'inbound_message.converted', entityType: 'inbound_message', entityId: msg.id, newValues: { leadId: lead.id } });
    return { leadId: lead.id };
  }

  async ignore(messageId: string) {
    const organizationId = requireOrgId();
    const res = await this.prisma.inboundMessage.updateMany({
      where: { id: messageId, organizationId }, data: { status: 'ignored' },
    });
    if (res.count === 0) throw new NotFoundException('Message not found');
    return { ok: true };
  }

  // ---- helpers ----

  private verifySecret(expected: string, provided: string | undefined): boolean {
    if (!provided) return false;
    const a = Buffer.from(expected);
    const b = Buffer.from(provided);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }

  private channelDto(c: any, includeSecret = false) {
    return {
      id: c.id,
      provider: c.provider,
      name: c.name,
      status: c.status,
      messageCount: c._count?.messages ?? 0,
      webhookPath: `/api/webhooks/${c.id}`,
      ...(includeSecret ? { secret: c.secret } : {}),
      createdAt: c.createdAt,
    };
  }

  private messageDto(m: any) {
    return {
      id: m.id,
      channel: m.channel ? { id: m.channel.id, name: m.channel.name, provider: m.channel.provider } : null,
      fromName: m.fromName,
      fromHandle: m.fromHandle,
      subject: m.subject,
      body: m.body,
      receivedAt: m.receivedAt,
      status: m.status,
      linkedLeadId: m.linkedLeadId,
    };
  }
}
