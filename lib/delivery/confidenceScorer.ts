import { Finding } from '@prisma/client';

export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';

interface ConfidenceRule {
  level: ConfidenceLevel;
  condition: (finding: Finding) => boolean;
}

/**
 * Scores a finding's confidence level based on evidence quality.
 * 
 * Rules (evaluated in order, first match wins):
 * - HIGH: finding.evidence contains at least one entry with a valid pointer + collected_at
 * - MEDIUM: finding.evidence is non-empty but lacks a direct measurement pointer
 * - LOW: finding.evidence is empty or all entries are inferred/estimated
 */
export function scoreConfidence(finding: Finding): ConfidenceLevel {
  const evidence = Array.isArray(finding.evidence) ? finding.evidence : [];

  // HIGH: Direct measurement with pointer and timestamp
  const hasDirectMeasurement = evidence.some((e: any) => {
    return e && typeof e === 'object' && e.pointer && e.pointer.length > 0 && e.collected_at;
  });

  if (hasDirectMeasurement) {
    return 'HIGH';
  }

  // MEDIUM: Non-empty evidence but no direct measurement
  if (evidence.length > 0) {
    return 'MEDIUM';
  }

  // LOW: Empty evidence or all inferred/estimated
  return 'LOW';
}

/**
 * Language softening map for LOW-confidence claims.
 * Replaces assertive phrasing with qualified language.
 */
const SOFTENING_PATTERNS: Array<[RegExp, string]> = [
  [/your\s+(\w+)\s+is\s+(\w+)/gi, 'estimated $1: ~$2 (modeled)'],
  [/(\w+)\s+costs?\s+you\s+\$(\d+(?:,\d{3})*(?:\.\d{2})?)(\/month|\/year)?/gi, 'estimated monthly impact: ~$$$2 (modeled)'],
  [/competitors?\s+(?:are\s+)?outperforming/gi, 'competitors may be outperforming (as of last audit)'],
  [/you\s+(?:are\s+)?losing\s+(\$[\d,]+)/gi, 'estimated loss: ~$1 (modeled)'],
  [/your\s+traffic\s+loss\s+is\s+(\$[\d,]+)/gi, 'estimated traffic impact: ~$1 (modeled)'],
];

/**
 * Applies language softening to LOW-confidence claims.
 * Replaces assertive phrasing with qualified language like "estimated", "modeled", "as of last audit".
 */
export function softenLanguage(text: string, level: ConfidenceLevel): string {
  if (level !== 'LOW') {
    return text;
  }

  let softened = text;
  for (const [pattern, replacement] of SOFTENING_PATTERNS) {
    softened = softened.replace(pattern, replacement);
  }

  return softened;
}
