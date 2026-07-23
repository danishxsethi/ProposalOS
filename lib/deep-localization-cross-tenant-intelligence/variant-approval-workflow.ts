/**
 * VariantApprovalWorkflow: Dedicated module for managing the approval lifecycle
 * of localized prompt variants.
 *
 * Approval state machine:
 *   pending → (submit for review) → pending (with review comment)
 *   pending → (approve)           → approved
 *   pending → (reject)            → rejected
 *   rejected → (resubmit)         → pending
 *
 * Requirements: 7.4, 7.5
 */

import { query } from './db/connection';

// ============================================================================
// Types
// ============================================================================

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface ApprovalRecord {
  id: string;
  nodeId: string;
  locale: string;
  approvalStatus: ApprovalStatus;
  nativeSpeakerReview: string | null;
  createdAt: Date;
  approvedAt: Date | null;
}

export interface ApprovalTransitionResult {
  success: boolean;
  previousStatus: ApprovalStatus;
  newStatus: ApprovalStatus;
  variantId: string;
}

// ============================================================================
// Valid transitions
// ============================================================================

/** Allowed status transitions in the approval state machine */
const VALID_TRANSITIONS: Record<ApprovalStatus, ApprovalStatus[]> = {
  pending: ['approved', 'rejected'],
  approved: [],          // terminal state – cannot transition out
  rejected: ['pending'], // can be resubmitted
};

// ============================================================================
// VariantApprovalWorkflow
// ============================================================================

export class VariantApprovalWorkflow {
  /**
   * Retrieve the current approval record for a variant.
   * Returns null if the variant does not exist.
   */
  async getApprovalRecord(variantId: string): Promise<ApprovalRecord | null> {
    const result = await query(
      `SELECT id, node_id, locale, approval_status, native_speaker_review,
              created_at, approved_at
       FROM localized_prompts
       WHERE id = $1`,
      [variantId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToApprovalRecord(result.rows[0]);
  }

  /**
   * Store a native speaker review comment on a pending variant.
   * The variant must exist and be in 'pending' status.
   *
   * Validates: Requirement 7.4
   */
  async submitReview(variantId: string, reviewComment: string): Promise<void> {
    if (!reviewComment || reviewComment.trim().length === 0) {
      throw new Error('Review comment must not be empty');
    }

    const record = await this.getApprovalRecord(variantId);
    if (!record) {
      throw new Error(`Variant not found: ${variantId}`);
    }

    if (record.approvalStatus !== 'pending') {
      throw new Error(
        `Cannot submit review for variant in '${record.approvalStatus}' status. ` +
          `Only 'pending' variants can receive reviews.`
      );
    }

    await query(
      `UPDATE localized_prompts
       SET native_speaker_review = $2
       WHERE id = $1`,
      [variantId, reviewComment.trim()]
    );
  }

  /**
   * Transition a variant from 'pending' to 'approved'.
   * Records the approval timestamp for version tracking.
   *
   * Validates: Requirement 7.5
   */
  async approve(variantId: string): Promise<ApprovalTransitionResult> {
    return this.transition(variantId, 'approved');
  }

  /**
   * Transition a variant from 'pending' to 'rejected'.
   * Stores the rejection reason in native_speaker_review.
   *
   * Validates: Requirement 7.4
   */
  async reject(variantId: string, reason: string): Promise<ApprovalTransitionResult> {
    if (!reason || reason.trim().length === 0) {
      throw new Error('Rejection reason must not be empty');
    }

    const record = await this.getApprovalRecord(variantId);
    if (!record) {
      throw new Error(`Variant not found: ${variantId}`);
    }

    this.assertValidTransition(record.approvalStatus, 'rejected');

    await query(
      `UPDATE localized_prompts
       SET approval_status = 'rejected',
           native_speaker_review = $2
       WHERE id = $1`,
      [variantId, reason.trim()]
    );

    return {
      success: true,
      previousStatus: record.approvalStatus,
      newStatus: 'rejected',
      variantId,
    };
  }

  /**
   * Resubmit a rejected variant for review (transitions rejected → pending).
   * Clears the previous rejection reason.
   *
   * Validates: Requirement 7.4
   */
  async resubmit(variantId: string): Promise<ApprovalTransitionResult> {
    return this.transition(variantId, 'pending');
  }

  /**
   * Retrieve all variants pending review for a given locale.
   * Useful for native speaker review queues.
   */
  async getPendingVariants(locale?: string): Promise<ApprovalRecord[]> {
    const params: any[] = [];
    let sql = `SELECT id, node_id, locale, approval_status, native_speaker_review,
                      created_at, approved_at
               FROM localized_prompts
               WHERE approval_status = 'pending'`;

    if (locale) {
      params.push(locale);
      sql += ` AND locale = $${params.length}`;
    }

    sql += ` ORDER BY created_at ASC`;

    const result = await query(sql, params);
    return result.rows.map((row: any) => this.rowToApprovalRecord(row));
  }

  /**
   * Retrieve all approved variants for a given locale.
   */
  async getApprovedVariants(locale?: string): Promise<ApprovalRecord[]> {
    const params: any[] = [];
    let sql = `SELECT id, node_id, locale, approval_status, native_speaker_review,
                      created_at, approved_at
               FROM localized_prompts
               WHERE approval_status = 'approved'`;

    if (locale) {
      params.push(locale);
      sql += ` AND locale = $${params.length}`;
    }

    sql += ` ORDER BY approved_at DESC`;

    const result = await query(sql, params);
    return result.rows.map((row: any) => this.rowToApprovalRecord(row));
  }

  /**
   * Count variants by approval status, optionally filtered by locale.
   */
  async getStatusCounts(locale?: string): Promise<Record<ApprovalStatus, number>> {
    const params: any[] = [];
    let sql = `SELECT approval_status, COUNT(*) AS count
               FROM localized_prompts`;

    if (locale) {
      params.push(locale);
      sql += ` WHERE locale = $${params.length}`;
    }

    sql += ` GROUP BY approval_status`;

    const result = await query(sql, params);

    const counts: Record<ApprovalStatus, number> = {
      pending: 0,
      approved: 0,
      rejected: 0,
    };

    for (const row of result.rows) {
      const status = row.approval_status as ApprovalStatus;
      if (status in counts) {
        counts[status] = parseInt(row.count, 10);
      }
    }

    return counts;
  }

  // ============================================================================
  // Private helpers
  // ============================================================================

  /**
   * Generic status transition with validation.
   * For 'approved' transitions, also sets approved_at.
   */
  private async transition(
    variantId: string,
    targetStatus: ApprovalStatus
  ): Promise<ApprovalTransitionResult> {
    const record = await this.getApprovalRecord(variantId);
    if (!record) {
      throw new Error(`Variant not found: ${variantId}`);
    }

    this.assertValidTransition(record.approvalStatus, targetStatus);

    if (targetStatus === 'approved') {
      await query(
        `UPDATE localized_prompts
         SET approval_status = 'approved',
             approved_at = NOW()
         WHERE id = $1`,
        [variantId]
      );
    } else {
      await query(
        `UPDATE localized_prompts
         SET approval_status = $2,
             native_speaker_review = NULL
         WHERE id = $1`,
        [variantId, targetStatus]
      );
    }

    return {
      success: true,
      previousStatus: record.approvalStatus,
      newStatus: targetStatus,
      variantId,
    };
  }

  /**
   * Assert that a status transition is valid, throwing if not.
   */
  private assertValidTransition(from: ApprovalStatus, to: ApprovalStatus): void {
    const allowed = VALID_TRANSITIONS[from];
    if (!allowed.includes(to)) {
      throw new Error(
        `Invalid status transition: '${from}' → '${to}'. ` +
          `Allowed transitions from '${from}': [${allowed.join(', ') || 'none'}]`
      );
    }
  }

  private rowToApprovalRecord(row: any): ApprovalRecord {
    return {
      id: row.id,
      nodeId: row.node_id,
      locale: row.locale,
      approvalStatus: row.approval_status as ApprovalStatus,
      nativeSpeakerReview: row.native_speaker_review ?? null,
      createdAt: new Date(row.created_at),
      approvedAt: row.approved_at ? new Date(row.approved_at) : null,
    };
  }
}
