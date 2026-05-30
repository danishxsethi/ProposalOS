/**
 * lib/proposal/status.ts
 *
 * Deterministic proposal status promotion logic.
 *
 * A proposal becomes READY only when its QA score meets the minimum threshold
 * AND no hard-fail conditions were triggered. This module is the single source
 * of truth for that decision so the route, the background runner, and the
 * regenerate route all use identical criteria.
 */

import { type QAStatus } from '@/lib/qa/autoQA';

/**
 * Minimum QA score (0–100) required for a proposal to be promoted to READY.
 * Below this threshold the proposal stays DRAFT for human review.
 *
 * Matches the threshold already in use in app/api/audit/[id]/propose/route.ts.
 */
export const PROPOSAL_READY_THRESHOLD = 60;

/**
 * Determine the persisted proposal status based on QA results.
 *
 * Rules:
 * - Any hard-fail in QA forces the score to 0 (handled inside runAutoQA),
 *   so hard-fail proposals always land in DRAFT.
 * - score >= PROPOSAL_READY_THRESHOLD → READY
 * - score <  PROPOSAL_READY_THRESHOLD → DRAFT
 *
 * @param qaStatus - The result of runAutoQA()
 * @returns 'READY' | 'DRAFT'
 */
export function determineProposalStatus(qaStatus: QAStatus): 'READY' | 'DRAFT' {
  return qaStatus.score >= PROPOSAL_READY_THRESHOLD ? 'READY' : 'DRAFT';
}
