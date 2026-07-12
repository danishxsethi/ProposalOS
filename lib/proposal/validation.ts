import { Finding } from '@prisma/client';

import { validateProposalGrounding } from './grounding';
import { ProposalResult } from './types';

/**
 * Validate that all claims in the proposal are backed by evidence
 */
export function validateCitations(
  proposal: ProposalResult,
  findings: Finding[]
): { valid: boolean; errors: string[] } {
  const first = findings[0];
  if (!first) return { valid: false, errors: ['Proposal requires at least one validated Finding'] };
  const result = validateProposalGrounding(proposal, {
    auditId: first.auditId,
    tenantId: first.tenantId,
    findings,
  });
  return { valid: result.valid, errors: result.errors };
}

/**
 * Generate standard assumptions
 */
export function generateAssumptions(businessName: string): string[] {
  return [
    `${businessName} must confirm access and implementation prerequisites before work begins`,
    'Package scope and delivery timing require confirmation before approval',
    'Prices shown come from the configured proposal pricing rules',
    'Any outcome estimate requires separately confirmed business inputs',
  ];
}

/**
 * Generate standard disclaimers
 */
export function generateDisclaimers(): string[] {
  return [
    'Audit observations reflect the cited collection time and bounded scan scope',
    'Automated checks do not replace qualified legal, accessibility, or specialist review',
    'Recommendations describe proposed work, not guaranteed outcomes',
    'Unconfirmed business inputs are not used for ROI or performance claims',
  ];
}

/**
 * Generate next steps
 */
export function generateNextSteps(topActionLines: string[] = []): string[] {
  const base = [
    'Review this proposal and approve your preferred tier',
    'Confirm scope, dependencies, pricing, and delivery timing',
    'Request human review for any unsupported or unclear claim',
  ];
  return topActionLines.length > 0 ? [...topActionLines, ...base] : base;
}
