/**
 * Unit tests for VariantApprovalWorkflow
 *
 * Tests:
 * - getApprovalRecord() - retrieve current approval state
 * - submitReview() - store native speaker review comment
 * - approve() - transition pending → approved
 * - reject() - transition pending → rejected
 * - resubmit() - transition rejected → pending
 * - getPendingVariants() - list variants awaiting review
 * - getApprovedVariants() - list approved variants
 * - getStatusCounts() - count variants by status
 * - State machine: invalid transitions are rejected
 *
 * Requirements: 7.4, 7.5
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VariantApprovalWorkflow } from '../variant-approval-workflow';
import * as dbConnection from '../db/connection';

vi.mock('../db/connection', () => ({
  query: vi.fn(),
}));

const mockQuery = vi.mocked(dbConnection.query);

// ─── helpers ────────────────────────────────────────────────────────────────

function makeRow(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: 'uuid-1',
    node_id: 'node-seo-analysis',
    locale: 'de-DE',
    approval_status: 'pending',
    native_speaker_review: null,
    created_at: new Date('2024-01-01T00:00:00Z'),
    approved_at: null,
    ...overrides,
  };
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('VariantApprovalWorkflow', () => {
  let workflow: VariantApprovalWorkflow;

  beforeEach(() => {
    vi.clearAllMocks();
    workflow = new VariantApprovalWorkflow();
  });

  // ── getApprovalRecord ──────────────────────────────────────────────────────

  describe('getApprovalRecord', () => {
    it('returns the approval record for an existing variant', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeRow()] });

      const record = await workflow.getApprovalRecord('uuid-1');

      expect(record).not.toBeNull();
      expect(record!.id).toBe('uuid-1');
      expect(record!.nodeId).toBe('node-seo-analysis');
      expect(record!.locale).toBe('de-DE');
      expect(record!.approvalStatus).toBe('pending');
      expect(record!.nativeSpeakerReview).toBeNull();
      expect(record!.approvedAt).toBeNull();
    });

    it('returns null when variant does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const record = await workflow.getApprovalRecord('nonexistent');

      expect(record).toBeNull();
    });

    it('maps approved_at correctly when set', async () => {
      const approvedAt = new Date('2024-01-02T00:00:00Z');
      mockQuery.mockResolvedValueOnce({
        rows: [makeRow({ approval_status: 'approved', approved_at: approvedAt })],
      });

      const record = await workflow.getApprovalRecord('uuid-1');

      expect(record!.approvalStatus).toBe('approved');
      expect(record!.approvedAt).toEqual(approvedAt);
    });

    it('maps native_speaker_review when present', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [makeRow({ native_speaker_review: 'Looks great!' })],
      });

      const record = await workflow.getApprovalRecord('uuid-1');

      expect(record!.nativeSpeakerReview).toBe('Looks great!');
    });
  });

  // ── submitReview ───────────────────────────────────────────────────────────

  describe('submitReview', () => {
    it('stores the review comment for a pending variant', async () => {
      // getApprovalRecord call
      mockQuery.mockResolvedValueOnce({ rows: [makeRow({ approval_status: 'pending' })] });
      // UPDATE call
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        workflow.submitReview('uuid-1', 'The German phrasing is natural and accurate.')
      ).resolves.not.toThrow();

      // Verify the review comment was passed to the UPDATE query
      const updateCall = mockQuery.mock.calls[1];
      expect(updateCall[1]).toContain('The German phrasing is natural and accurate.');
    });

    it('trims whitespace from the review comment', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeRow({ approval_status: 'pending' })] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await workflow.submitReview('uuid-1', '  Great translation!  ');

      const updateCall = mockQuery.mock.calls[1];
      expect(updateCall[1]).toContain('Great translation!');
    });

    it('throws when variant is not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(workflow.submitReview('nonexistent', 'review')).rejects.toThrow(
        'Variant not found'
      );
    });

    it('throws when review comment is empty', async () => {
      await expect(workflow.submitReview('uuid-1', '')).rejects.toThrow(
        'Review comment must not be empty'
      );
    });

    it('throws when review comment is whitespace only', async () => {
      await expect(workflow.submitReview('uuid-1', '   ')).rejects.toThrow(
        'Review comment must not be empty'
      );
    });

    it('throws when variant is already approved', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [makeRow({ approval_status: 'approved' })],
      });

      await expect(workflow.submitReview('uuid-1', 'review')).rejects.toThrow(
        "Cannot submit review for variant in 'approved' status"
      );
    });

    it('throws when variant is already rejected', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [makeRow({ approval_status: 'rejected' })],
      });

      await expect(workflow.submitReview('uuid-1', 'review')).rejects.toThrow(
        "Cannot submit review for variant in 'rejected' status"
      );
    });
  });

  // ── approve ────────────────────────────────────────────────────────────────

  describe('approve', () => {
    it('transitions a pending variant to approved', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeRow({ approval_status: 'pending' })] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await workflow.approve('uuid-1');

      expect(result.success).toBe(true);
      expect(result.previousStatus).toBe('pending');
      expect(result.newStatus).toBe('approved');
      expect(result.variantId).toBe('uuid-1');
    });

    it('sets approved_at in the UPDATE query', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeRow({ approval_status: 'pending' })] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await workflow.approve('uuid-1');

      const updateSql = mockQuery.mock.calls[1][0] as string;
      expect(updateSql).toContain('approved_at');
      expect(updateSql).toContain("approval_status = 'approved'");
    });

    it('throws when variant is not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(workflow.approve('nonexistent')).rejects.toThrow('Variant not found');
    });

    it('throws when trying to approve an already-approved variant', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeRow({ approval_status: 'approved' })] });

      await expect(workflow.approve('uuid-1')).rejects.toThrow(
        "Invalid status transition: 'approved' → 'approved'"
      );
    });

    it('throws when trying to approve a rejected variant directly', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeRow({ approval_status: 'rejected' })] });

      await expect(workflow.approve('uuid-1')).rejects.toThrow(
        "Invalid status transition: 'rejected' → 'approved'"
      );
    });
  });

  // ── reject ─────────────────────────────────────────────────────────────────

  describe('reject', () => {
    it('transitions a pending variant to rejected with a reason', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeRow({ approval_status: 'pending' })] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await workflow.reject('uuid-1', 'Too literal, needs cultural adaptation');

      expect(result.success).toBe(true);
      expect(result.previousStatus).toBe('pending');
      expect(result.newStatus).toBe('rejected');
    });

    it('stores the rejection reason in native_speaker_review', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeRow({ approval_status: 'pending' })] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await workflow.reject('uuid-1', 'Too literal');

      const updateCall = mockQuery.mock.calls[1];
      expect(updateCall[1]).toContain('Too literal');
      const sql = updateCall[0] as string;
      expect(sql).toContain("approval_status = 'rejected'");
      expect(sql).toContain('native_speaker_review');
    });

    it('throws when rejection reason is empty', async () => {
      await expect(workflow.reject('uuid-1', '')).rejects.toThrow(
        'Rejection reason must not be empty'
      );
    });

    it('throws when rejection reason is whitespace only', async () => {
      await expect(workflow.reject('uuid-1', '   ')).rejects.toThrow(
        'Rejection reason must not be empty'
      );
    });

    it('throws when variant is not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(workflow.reject('nonexistent', 'reason')).rejects.toThrow('Variant not found');
    });

    it('throws when trying to reject an already-approved variant', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeRow({ approval_status: 'approved' })] });

      await expect(workflow.reject('uuid-1', 'reason')).rejects.toThrow(
        "Invalid status transition: 'approved' → 'rejected'"
      );
    });
  });

  // ── resubmit ───────────────────────────────────────────────────────────────

  describe('resubmit', () => {
    it('transitions a rejected variant back to pending', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeRow({ approval_status: 'rejected' })] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await workflow.resubmit('uuid-1');

      expect(result.success).toBe(true);
      expect(result.previousStatus).toBe('rejected');
      expect(result.newStatus).toBe('pending');
    });

    it('clears the native_speaker_review on resubmit', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [makeRow({ approval_status: 'rejected', native_speaker_review: 'Too literal' })],
      });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await workflow.resubmit('uuid-1');

      const updateSql = mockQuery.mock.calls[1][0] as string;
      expect(updateSql).toContain('native_speaker_review = NULL');
    });

    it('throws when trying to resubmit a pending variant', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeRow({ approval_status: 'pending' })] });

      await expect(workflow.resubmit('uuid-1')).rejects.toThrow(
        "Invalid status transition: 'pending' → 'pending'"
      );
    });

    it('throws when trying to resubmit an approved variant', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeRow({ approval_status: 'approved' })] });

      await expect(workflow.resubmit('uuid-1')).rejects.toThrow(
        "Invalid status transition: 'approved' → 'pending'"
      );
    });

    it('throws when variant is not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(workflow.resubmit('nonexistent')).rejects.toThrow('Variant not found');
    });
  });

  // ── getPendingVariants ─────────────────────────────────────────────────────

  describe('getPendingVariants', () => {
    it('returns all pending variants when no locale filter', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          makeRow({ id: 'uuid-1', locale: 'de-DE' }),
          makeRow({ id: 'uuid-2', locale: 'fr-FR' }),
        ],
      });

      const variants = await workflow.getPendingVariants();

      expect(variants).toHaveLength(2);
      expect(variants[0].approvalStatus).toBe('pending');
      expect(variants[1].approvalStatus).toBe('pending');
    });

    it('filters by locale when provided', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [makeRow({ id: 'uuid-1', locale: 'de-DE' })],
      });

      const variants = await workflow.getPendingVariants('de-DE');

      expect(variants).toHaveLength(1);
      // Verify locale filter was passed to the query
      const params = mockQuery.mock.calls[0][1] as any[];
      expect(params).toContain('de-DE');
    });

    it('returns empty array when no pending variants', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const variants = await workflow.getPendingVariants();

      expect(variants).toHaveLength(0);
    });

    it('SQL includes approval_status = pending filter', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await workflow.getPendingVariants();

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain("approval_status = 'pending'");
    });
  });

  // ── getApprovedVariants ────────────────────────────────────────────────────

  describe('getApprovedVariants', () => {
    it('returns all approved variants when no locale filter', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          makeRow({ id: 'uuid-1', locale: 'de-DE', approval_status: 'approved' }),
          makeRow({ id: 'uuid-2', locale: 'fr-FR', approval_status: 'approved' }),
        ],
      });

      const variants = await workflow.getApprovedVariants();

      expect(variants).toHaveLength(2);
      expect(variants[0].approvalStatus).toBe('approved');
    });

    it('filters by locale when provided', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [makeRow({ id: 'uuid-1', locale: 'fr-FR', approval_status: 'approved' })],
      });

      const variants = await workflow.getApprovedVariants('fr-FR');

      const params = mockQuery.mock.calls[0][1] as any[];
      expect(params).toContain('fr-FR');
    });

    it('SQL includes approval_status = approved filter', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await workflow.getApprovedVariants();

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain("approval_status = 'approved'");
    });
  });

  // ── getStatusCounts ────────────────────────────────────────────────────────

  describe('getStatusCounts', () => {
    it('returns counts for all three statuses', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { approval_status: 'pending', count: '5' },
          { approval_status: 'approved', count: '12' },
          { approval_status: 'rejected', count: '3' },
        ],
      });

      const counts = await workflow.getStatusCounts();

      expect(counts.pending).toBe(5);
      expect(counts.approved).toBe(12);
      expect(counts.rejected).toBe(3);
    });

    it('returns zeros for missing statuses', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ approval_status: 'approved', count: '7' }],
      });

      const counts = await workflow.getStatusCounts();

      expect(counts.pending).toBe(0);
      expect(counts.approved).toBe(7);
      expect(counts.rejected).toBe(0);
    });

    it('filters by locale when provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await workflow.getStatusCounts('de-DE');

      const params = mockQuery.mock.calls[0][1] as any[];
      expect(params).toContain('de-DE');
    });

    it('returns all zeros when library is empty', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const counts = await workflow.getStatusCounts();

      expect(counts.pending).toBe(0);
      expect(counts.approved).toBe(0);
      expect(counts.rejected).toBe(0);
    });
  });

  // ── state machine: full workflow ───────────────────────────────────────────

  describe('approval state machine', () => {
    it('full happy path: pending → review → approved', async () => {
      // submitReview: getApprovalRecord + UPDATE
      mockQuery
        .mockResolvedValueOnce({ rows: [makeRow({ approval_status: 'pending' })] })
        .mockResolvedValueOnce({ rows: [] });
      await workflow.submitReview('uuid-1', 'Excellent German phrasing!');

      // approve: getApprovalRecord + UPDATE
      mockQuery
        .mockResolvedValueOnce({ rows: [makeRow({ approval_status: 'pending' })] })
        .mockResolvedValueOnce({ rows: [] });
      const result = await workflow.approve('uuid-1');

      expect(result.newStatus).toBe('approved');
    });

    it('rejection and resubmission path: pending → rejected → pending', async () => {
      // reject
      mockQuery
        .mockResolvedValueOnce({ rows: [makeRow({ approval_status: 'pending' })] })
        .mockResolvedValueOnce({ rows: [] });
      const rejectResult = await workflow.reject('uuid-1', 'Needs more cultural context');
      expect(rejectResult.newStatus).toBe('rejected');

      // resubmit
      mockQuery
        .mockResolvedValueOnce({ rows: [makeRow({ approval_status: 'rejected' })] })
        .mockResolvedValueOnce({ rows: [] });
      const resubmitResult = await workflow.resubmit('uuid-1');
      expect(resubmitResult.newStatus).toBe('pending');
    });

    it('approved variants cannot be transitioned further', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeRow({ approval_status: 'approved' })] });
      await expect(workflow.approve('uuid-1')).rejects.toThrow('Invalid status transition');

      mockQuery.mockResolvedValueOnce({ rows: [makeRow({ approval_status: 'approved' })] });
      await expect(workflow.reject('uuid-1', 'reason')).rejects.toThrow(
        'Invalid status transition'
      );

      mockQuery.mockResolvedValueOnce({ rows: [makeRow({ approval_status: 'approved' })] });
      await expect(workflow.resubmit('uuid-1')).rejects.toThrow('Invalid status transition');
    });
  });
});
