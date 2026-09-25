import { createHash } from 'node:crypto';

import { groundingForPersistence, ProposalGroundingSchema } from './grounding';

import type { ProposalResult } from './types';

interface EvaluationLike {
  passed: boolean;
  dimensions: unknown;
  overallScore: number;
  feedbackLogs: string[];
  autoQAStatus: {
    status: 'PASS' | 'REVIEW_REQUIRED' | 'FAIL';
    hardFailures: string[];
    clientPerfect: { hardFails: unknown[] };
  };
}

interface PersistedProposalLike {
  auditId: string;
  tenantId: string;
  version?: number;
  status?: string;
  qaResults: unknown;
  publicationFingerprint?: string | null;
}

export function buildPersistedQaResults(
  evaluation: EvaluationLike,
  proposal: ProposalResult,
  proposalVersion?: number
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
    publicationApproval: {
      version: 1,
      decision:
        evaluation.passed &&
        evaluation.autoQAStatus.status === 'PASS' &&
        evaluation.autoQAStatus.hardFailures.length === 0 &&
        evaluation.autoQAStatus.clientPerfect.hardFails.length === 0
          ? 'APPROVED'
          : 'NOT_APPROVED',
      proposalVersion: proposalVersion ?? null,
      qaVersion: 1,
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
  if (!proposal.version || !Number.isInteger(proposal.version) || proposal.version < 1) {
    return ['Proposal version is missing or invalid'];
  }

  const parsed = ProposalGroundingSchema.safeParse(qa.grounding);
  if (!parsed.success) return ['Proposal is legacy/unverified or has invalid grounding metadata'];

  const reasons: string[] = [];
  if (proposal.status && !['READY', 'SENT', 'VIEWED', 'ACCEPTED', 'PAID'].includes(proposal.status)) {
    reasons.push(`Proposal status '${proposal.status}' is not publishable`);
  }
  const approval =
    qa.publicationApproval && typeof qa.publicationApproval === 'object'
      ? (qa.publicationApproval as Record<string, unknown>)
      : null;
  if (approval?.decision !== 'APPROVED') reasons.push('Publication approval is not approved');
  if (approval?.proposalVersion !== proposal.version) {
    reasons.push('Publication approval does not match current proposal version');
  }
  const fingerprint = typeof qa.publicationFingerprint === 'string' ? qa.publicationFingerprint : null;
  if (!fingerprint || approval?.fingerprint !== fingerprint) {
    reasons.push('Publication approval fingerprint is missing or stale');
  }
  if ('publicationFingerprint' in proposal && proposal.publicationFingerprint !== fingerprint) {
    reasons.push('Persisted proposal fingerprint does not match QA approval');
  }
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

  const qaStatus = typeof qa.status === 'string' ? qa.status : null;
  const hardFailures = Array.isArray(qa.hardFailures) ? qa.hardFailures : [];
  if (qaStatus !== 'PASS') reasons.push('Canonical proposal QA status is not PASS');
  if (hardFailures.length > 0) reasons.push('Canonical proposal QA has hard failures');

  return reasons;
}

export function assertProposalPublishable(proposal: PersistedProposalLike): void {
  const reasons = publicationBlockReasons(proposal);
  if (reasons.length > 0) throw new Error(`PROPOSAL_PUBLICATION_BLOCKED: ${reasons.join('; ')}`);
}

export function invalidatePublicationApproval(qaResults: unknown): Record<string, unknown> {
  const qa = qaResults && typeof qaResults === 'object'
    ? { ...(qaResults as Record<string, unknown>) }
    : {};
  delete qa.publicationFingerprint;
  qa.publicationApproval = {
    version: 1,
    decision: 'NOT_APPROVED',
    proposalVersion: null,
    qaVersion: 1,
  };
  return qa;
}

function canonicalJson(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** Hashes the exact customer-facing proposal and its trusted source lineage at approval time. */
export function proposalPublicationFingerprint(state: unknown): string {
  return createHash('sha256').update(canonicalJson(state)).digest('hex');
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
