import { AiProvider, InquiryAnalysis } from './ai-provider';

/**
 * Self-contained fallback provider — no external calls, no API key. Uses simple
 * keyword rules and templates so every AI feature works out of the box.
 */
export class HeuristicProvider implements AiProvider {
  readonly name = 'heuristic';
  readonly usesLlm = false;

  async analyzeInquiry(text: string): Promise<InquiryAnalysis> {
    const t = (text || '').toLowerCase();
    const signals: string[] = [];
    const sizeMatch = t.match(/(\d{2,5})\s*(employees|staff|people|headcount)/);
    if (sizeMatch) signals.push(`Company size: ~${sizeMatch[1]} employees`);
    const needs = ['hris', 'payroll', 'crm', 'inventory', 'accounting', 'pos', 'erp', 'leave', 'attendance'];
    const found = needs.filter((n) => t.includes(n));
    if (found.length) signals.push(`Interested in: ${found.join(', ').toUpperCase()}`);
    if (/(urgent|asap|immediately|this (week|month))/.test(t)) signals.push('Timeline: urgent');
    if (/(budget|price|quote|proposal|cost)/.test(t)) signals.push('Budget/pricing intent detected');
    if (/(demo|trial|meeting|call)/.test(t)) signals.push('Requesting a demo/meeting');

    return {
      summary: signals.length ? signals.join('. ') + '.' : 'General inquiry — limited signals detected.',
      signals,
      suggestedReply:
        'Hi, thanks for reaching out! Based on what you shared, we can help. ' +
        'Could we set up a short discovery call this week to understand your needs and send a tailored proposal?',
    };
  }

  async draft(kind: string, ctx: Record<string, any>): Promise<string> {
    switch (kind) {
      case 'followup_message':
        return `Hi ${ctx.contactName ?? 'there'}, just following up on ${ctx.subject ?? 'our conversation'}. ` +
          `Happy to answer any questions or set up a quick call. Is there anything you need from us to move forward?`;
      case 'quote_description':
        return `${ctx.productName ?? 'Solution'} — ${ctx.notes ?? 'tailored to your requirements, including setup and support.'}`;
      case 'opportunity_next_step':
        return `Reach out to ${ctx.contactName ?? 'the decision maker'} to confirm timeline and next steps on ${ctx.name ?? 'this opportunity'}.`;
      default:
        return `Draft for "${kind}" — please review and personalize before sending.`;
    }
  }
}
