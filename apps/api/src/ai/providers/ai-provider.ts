/**
 * Provider-agnostic text AI. Deterministic scoring/risk live in AiService; this
 * interface covers only free-text work (analysis + drafting) so the underlying
 * model can be swapped (heuristic ↔ Claude ↔ others) without touching callers.
 * Nothing here mutates domain data — outputs are advisory only.
 */
export interface InquiryAnalysis {
  summary: string;
  signals: string[];
  suggestedReply: string;
}

export interface AiProvider {
  readonly name: string;
  readonly usesLlm: boolean;
  analyzeInquiry(text: string, context?: Record<string, unknown>): Promise<InquiryAnalysis>;
  draft(kind: string, context: Record<string, unknown>): Promise<string>;
}
