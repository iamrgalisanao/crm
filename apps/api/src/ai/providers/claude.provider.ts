import { Logger } from '@nestjs/common';
import { AiProvider, InquiryAnalysis } from './ai-provider';

/**
 * Claude (Anthropic) text provider. Active only when ANTHROPIC_API_KEY is set.
 * All calls are read-only text generation — the advisory boundary is enforced
 * by the domain (AI never approves, prices, or writes to CRM records).
 */
export class ClaudeProvider implements AiProvider {
  readonly name = 'claude';
  readonly usesLlm = true;
  private readonly logger = new Logger(ClaudeProvider.name);
  private readonly endpoint = 'https://api.anthropic.com/v1/messages';

  constructor(
    private readonly apiKey: string,
    private readonly model = 'claude-sonnet-5',
  ) {}

  async analyzeInquiry(text: string, context: Record<string, unknown> = {}): Promise<InquiryAnalysis> {
    const prompt =
      `You are a B2B sales qualification assistant. Analyze this inbound inquiry and respond ONLY with JSON ` +
      `of shape {"summary": string, "signals": string[], "suggestedReply": string}. ` +
      `Do not include pricing commitments. Inquiry:\n"""${text}"""\nContext: ${JSON.stringify(context)}`;
    const out = await this.complete(prompt, 700);
    try {
      const json = JSON.parse(this.extractJson(out));
      return {
        summary: String(json.summary ?? ''),
        signals: Array.isArray(json.signals) ? json.signals.map(String) : [],
        suggestedReply: String(json.suggestedReply ?? ''),
      };
    } catch {
      return { summary: out.slice(0, 400), signals: [], suggestedReply: '' };
    }
  }

  async draft(kind: string, ctx: Record<string, unknown>): Promise<string> {
    const prompt =
      `Write a concise, professional ${kind.replace(/_/g, ' ')} for a B2B sales context. ` +
      `Do not commit to specific prices or discounts. Keep it ready to send with light editing. ` +
      `Context: ${JSON.stringify(ctx)}`;
    return this.complete(prompt, 500);
  }

  private async complete(prompt: string, maxTokens: number): Promise<string> {
    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      this.logger.error(`Anthropic API ${res.status}: ${body.slice(0, 200)}`);
      throw new Error(`AI provider error (${res.status})`);
    }
    const data: any = await res.json();
    return (data.content ?? []).map((c: any) => c.text ?? '').join('').trim();
  }

  private extractJson(text: string): string {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    return start >= 0 && end > start ? text.slice(start, end + 1) : text;
  }
}
