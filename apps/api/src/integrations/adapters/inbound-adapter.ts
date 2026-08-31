/**
 * Inbound channel adapters (Phase 0 §13). Each provider maps its raw webhook
 * payload to zero-or-more NormalizedMessages. This is the ONLY place provider
 * specifics live — the CRM domain only ever sees the normalized shape.
 */

export interface NormalizedMessage {
  externalId?: string;
  fromName?: string;
  fromHandle?: string;
  subject?: string;
  body?: string;
  receivedAt?: string;
}

export type InboundAdapter = (payload: any) => NormalizedMessage[];

const s = (v: unknown): string | undefined => (v == null ? undefined : String(v));

/** Payload is already normalized (generic webhook / API / import). */
const generic: InboundAdapter = (p) => {
  const items = Array.isArray(p) ? p : Array.isArray(p?.messages) ? p.messages : [p];
  return items
    .map((m: any) => ({
      externalId: s(m.externalId ?? m.id),
      fromName: s(m.fromName ?? m.name),
      fromHandle: s(m.fromHandle ?? m.email ?? m.phone ?? m.handle),
      subject: s(m.subject ?? m.title),
      body: s(m.body ?? m.message ?? m.text),
      receivedAt: s(m.receivedAt),
    }))
    .filter((m: NormalizedMessage) => m.body || m.subject || m.fromName);
};

/** Simplified Facebook/Messenger webhook shape. */
const facebook: InboundAdapter = (p) => {
  const out: NormalizedMessage[] = [];
  for (const entry of p?.entry ?? []) {
    for (const ev of entry.messaging ?? []) {
      if (!ev.message?.text) continue;
      out.push({
        externalId: s(ev.message.mid),
        fromName: s(ev.sender?.name),
        fromHandle: s(ev.sender?.id),
        subject: undefined,
        body: s(ev.message.text),
        receivedAt: ev.timestamp ? new Date(ev.timestamp).toISOString() : undefined,
      });
    }
  }
  return out;
};

/** Website contact form. */
const website: InboundAdapter = (p) => [
  {
    externalId: s(p.id),
    fromName: s(p.name),
    fromHandle: s(p.email ?? p.phone),
    subject: s(p.subject ?? 'Website inquiry'),
    body: s(p.message ?? p.body),
  },
].filter((m) => m.body || m.fromName);

/** Inbound email. */
const email: InboundAdapter = (p) => [
  {
    externalId: s(p.messageId ?? p.id),
    fromName: s(p.fromName ?? p.from),
    fromHandle: s(p.from ?? p.fromEmail),
    subject: s(p.subject),
    body: s(p.text ?? p.body ?? p.html),
  },
].filter((m) => m.body || m.subject);

const ADAPTERS: Record<string, InboundAdapter> = {
  generic,
  api: generic,
  facebook,
  messenger: facebook,
  website,
  email,
  whatsapp: generic,
};

export function normalizeInbound(provider: string, payload: any): NormalizedMessage[] {
  const adapter = ADAPTERS[provider] ?? generic;
  return adapter(payload);
}
