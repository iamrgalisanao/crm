/**
 * Lead scoring classification (Phase 0 §4). Scores are 0–100; thresholds map a
 * score to a classification band. Both the API (authoritative) and the web
 * (display) import this so a lead's band never drifts between them.
 */

export const LeadClassification = {
  HOT: 'HOT',
  WARM: 'WARM',
  NURTURE: 'NURTURE',
  LOW: 'LOW',
} as const;
export type LeadClassification = (typeof LeadClassification)[keyof typeof LeadClassification];

/** Default qualification criteria and their max points (configurable later). */
export const DEFAULT_SCORE_CRITERIA = [
  { key: 'need', label: 'Need', max: 25 },
  { key: 'budget', label: 'Budget', max: 20 },
  { key: 'authority', label: 'Authority', max: 20 },
  { key: 'timeline', label: 'Timeline', max: 20 },
  { key: 'fit', label: 'Business Fit', max: 15 },
] as const;

export const MAX_SCORE = DEFAULT_SCORE_CRITERIA.reduce((sum, c) => sum + c.max, 0); // 100

export function classifyScore(score: number): LeadClassification {
  if (score >= 80) return LeadClassification.HOT;
  if (score >= 60) return LeadClassification.WARM;
  if (score >= 40) return LeadClassification.NURTURE;
  return LeadClassification.LOW;
}
