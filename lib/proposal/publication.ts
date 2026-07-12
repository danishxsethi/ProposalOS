import { groundingForPersistence, ProposalGroundingSchema } from './grounding';

import type { ProposalResult } from './types';

interface EvaluationLike {
  passed: boolean;
  dimensions: unknown;
  overallScore: number;
  feedbackLogs: string[];
  autoQAStatus: object;
}

interface PersistedProposalLike {
  auditId: string;
  tenantId: string;
  status?: string;
  qaResults: unknown;
}

export function buildPersistedQaResults(
  evaluation: EvaluationLike,
  proposal: ProposalResult
): Record<string, unknown> {
  const grounding = groundingForPersistence(proposal);
  return {
    ...evaluation.autoQAStatus,
    evaluation: {
      dimensions: evaluation.dimensions,
      overallScore: evaluation.overallScore,
      feedbackLogs: evaluation.feedbackLogs,
      passed: evaluation.passed,
      metadataStatus: evaluation.passed ? 'ready' : 'in_review',
    },
    claimPolicy: {
      version: 1,
      valid: true,
      reasons: evaluation.feedbackLogs,
    },
    grounding,
  };
}

export function publicationBlockReasons(proposal: PersistedProposalLike): string[] {
  const qa =
    proposal.qaResults && typeof proposal.qaResults === 'object'
      ? (proposal.qaResults as Record<string, unknown>)
      : null;
  if (!qa) return ['Proposal has no persisted QA result'];

  const parsed = ProposalGroundingSchema.safeParse(qa.grounding);
  if (!parsed.success) return ['Proposal is legacy/unverified or has invalid grounding metadata'];

  const reasons: string[] = [];
  if (parsed.data.auditId !== proposal.auditId) reasons.push('Grounding audit identity mismatch');
  if (parsed.data.tenantId !== proposal.tenantId)
    reasons.push('Grounding tenant identity mismatch');

  const evaluation =
    qa.evaluation && typeof qa.evaluation === 'object'
      ? (qa.evaluation as Record<string, unknown>)
      : null;
  if (evaluation?.passed !== true) reasons.push('Proposal QA has not passed');

  const claimPolicy =
    qa.claimPolicy && typeof qa.claimPolicy === 'object'
      ? (qa.claimPolicy as Record<string, unknown>)
      : null;
  if (claimPolicy?.valid !== true) reasons.push('Claim-policy validation has not passed');

  return reasons;
}

export function assertProposalPublishable(proposal: PersistedProposalLike): void {
  const reasons = publicationBlockReasons(proposal);
  if (reasons.length > 0) throw new Error(`PROPOSAL_PUBLICATION_BLOCKED: ${reasons.join('; ')}`);
}

export function publicProposalCitations(qaResults: unknown) {
  const qa =
    qaResults && typeof qaResults === 'object' ? (qaResults as Record<string, unknown>) : null;
  const parsed = ProposalGroundingSchema.safeParse(qa?.grounding);
  if (!parsed.success) {
    return { status: 'legacy_unverified' as const, claims: [] };
  }
  return {
    status: 'verified' as const,
    claims: parsed.data.claims.map((claim) => ({
      claimId: claim.claimId,
      text: claim.text,
      claimType: claim.claimType,
      sourceFindingIds: claim.sourceFindingIds,
      estimate: claim.estimate,
      recommendation: claim.recommendation,
      assumptions: claim.assumptions,
    })),
  };
}
