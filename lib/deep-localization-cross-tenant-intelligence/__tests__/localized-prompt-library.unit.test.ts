/**
 * Unit tests for LocalizedPromptLibrary class (with mocked database)
 *
 * Tests:
 * - getPrompt() - retrieve locale-specific prompt variant with fallback
 * - createVariant() - store new locale variant
 * - submitForApproval() - native speaker review workflow
 * - approveVariant() / rejectVariant() - approval management
 * - getStats() - library statistics
 * - validateCompleteness() - ensure all locales have variants
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LocalizedPromptLibrary } from '../localized-prompt-library';
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
    prompt_text: 'Analysiere die Website auf SEO-Probleme',
    cultural_context: 'German market context',
    approval_status: 'approved',
    native_speaker_review: 'Looks good',
    created_at: new Date('2024-01-01T00:00:00Z'),
    approved_at: new Date('2024-01-02T00:00:00Z'),
    ...overrides,
  };
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('LocalizedPromptLibrary', () => {
  let library: LocalizedPromptLibrary;

  beforeEach(() => {
    vi.clearAllMocks();
    library = new LocalizedPromptLibrary();
  });

  // ── getPrompt ──────────────────────────────────────────────────────────────

  describe('getPrompt', () => {
    it('returns the approved variant for the requested locale', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeRow()] });

      const result = await library.getPrompt('node-seo-analysis', 'de-DE');

      expect(result).not.toBeNull();
      expect(result!.nodeId).toBe('node-seo-analysis');
      expect(result!.locale).toBe('de-DE');
      expect(result!.approvalStatus).toBe('approved');
    });

    it('falls back to en-US when requested locale has no approved variant', async () => {
      // First query (de-DE) returns nothing
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // Fallback query (en-US) returns a row
      mockQuery.mockResolvedValueOnce({ rows: [makeRow({ locale: 'en-US' })] });

      const result = await library.getPrompt('node-seo-analysis', 'de-DE');

      expect(result).not.toBeNull();
      expect(result!.locale).toBe('en-US');
    });

    it('returns null when neither the locale nor en-US has an approved variant', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await library.getPrompt('node-seo-analysis', 'de-DE');

      expect(result).toBeNull();
    });

    it('does not attempt en-US fallback when locale is already en-US', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await library.getPrompt('node-seo-analysis', 'en-US');

      expect(result).toBeNull();
      // Only one query should have been made
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('maps all fields correctly from the database row', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeRow()] });

      const result = await library.getPrompt('node-seo-analysis', 'de-DE');

      expect(result!.id).toBe('uuid-1');
      expect(result!.promptText).toBe('Analysiere die Website auf SEO-Probleme');
      expect(result!.culturalContext).toBe('German market context');
      expect(result!.thinkingBudget).toBe(4096);
      expect(result!.nativeSpeakerReview).toBe('Looks good');
      expect(result!.createdAt).toBeInstanceOf(Date);
    });

    it('returns null and does not throw on database error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB connection failed'));

      const result = await library.getPrompt('node-seo-analysis', 'de-DE');

      expect(result).toBeNull();
    });
  });

  // ── createVariant ──────────────────────────────────────────────────────────

  describe('createVariant', () => {
    it('creates a new variant with pending status', async () => {
      const newRow = makeRow({ approval_status: 'pending', approved_at: null });
      mockQuery.mockResolvedValueOnce({ rows: [newRow] });

      const result = await library.createVariant(
        'node-seo-analysis',
        'de-DE',
        'Analysiere die Website auf SEO-Probleme',
        'German market context'
      );

      expect(result.approvalStatus).toBe('pending');
      expect(result.nodeId).toBe('node-seo-analysis');
      expect(result.locale).toBe('de-DE');
    });

    it('passes cultural context to the database', async () => {
      const newRow = makeRow({ approval_status: 'pending' });
      mockQuery.mockResolvedValueOnce({ rows: [newRow] });

      await library.createVariant(
        'node-seo-analysis',
        'de-DE',
        'Some prompt',
        'Cultural context here'
      );

      const callArgs = mockQuery.mock.calls[0];
      expect(callArgs[1]).toContain('Cultural context here');
    });

    it('works without cultural context (optional parameter)', async () => {
      const newRow = makeRow({ approval_status: 'pending', cultural_context: null });
      mockQuery.mockResolvedValueOnce({ rows: [newRow] });

      const result = await library.createVariant('node-seo-analysis', 'de-DE', 'Some prompt');

      expect(result).toBeDefined();
    });

    it('throws on database error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Unique constraint violation'));

      await expect(
        library.createVariant('node-seo-analysis', 'de-DE', 'Some prompt')
      ).rejects.toThrow('Failed to create variant');
    });

    it('sets thinkingBudget to 4096 on returned variant', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeRow({ approval_status: 'pending' })] });

      const result = await library.createVariant('node-seo-analysis', 'de-DE', 'Some prompt');

      expect(result.thinkingBudget).toBe(4096);
    });
  });

  // ── submitForApproval ──────────────────────────────────────────────────────

  describe('submitForApproval', () => {
    it('stores the native speaker review comment', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'uuid-1' }] });

      await expect(
        library.submitForApproval('uuid-1', 'The German phrasing is natural and accurate.')
      ).resolves.not.toThrow();

      const callArgs = mockQuery.mock.calls[0];
      expect(callArgs[1]).toContain('The German phrasing is natural and accurate.');
    });

    it('throws when variant is not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(library.submitForApproval('nonexistent-id', 'review')).rejects.toThrow(
        'Variant not found'
      );
    });

    it('throws on database error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      await expect(library.submitForApproval('uuid-1', 'review')).rejects.toThrow(
        'Failed to submit for approval'
      );
    });
  });

  // ── approveVariant ─────────────────────────────────────────────────────────

  describe('approveVariant', () => {
    it('approves a variant successfully', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'uuid-1' }] });

      await expect(library.approveVariant('uuid-1')).resolves.not.toThrow();
    });

    it('sets approval_status to approved in the query', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'uuid-1' }] });

      await library.approveVariant('uuid-1');

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain("approval_status = 'approved'");
    });

    it('throws when variant is not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(library.approveVariant('nonexistent-id')).rejects.toThrow(
        'Variant not found'
      );
    });

    it('throws on database error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      await expect(library.approveVariant('uuid-1')).rejects.toThrow('Failed to approve variant');
    });
  });

  // ── rejectVariant ──────────────────────────────────────────────────────────

  describe('rejectVariant', () => {
    it('rejects a variant with a reason', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'uuid-1' }] });

      await expect(
        library.rejectVariant('uuid-1', 'The translation is too literal')
      ).resolves.not.toThrow();
    });

    it('stores the rejection reason in native_speaker_review', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'uuid-1' }] });

      await library.rejectVariant('uuid-1', 'Too literal');

      const callArgs = mockQuery.mock.calls[0];
      expect(callArgs[1]).toContain('Too literal');
    });

    it('sets approval_status to rejected in the query', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'uuid-1' }] });

      await library.rejectVariant('uuid-1', 'reason');

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain("approval_status = 'rejected'");
    });

    it('throws when variant is not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(library.rejectVariant('nonexistent-id', 'reason')).rejects.toThrow(
        'Variant not found'
      );
    });

    it('throws on database error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      await expect(library.rejectVariant('uuid-1', 'reason')).rejects.toThrow(
        'Failed to reject variant'
      );
    });
  });

  // ── getStats ───────────────────────────────────────────────────────────────

  describe('getStats', () => {
    it('returns correct statistics', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: '5' }] })           // totalNodes
        .mockResolvedValueOnce({ rows: [{ locale: 'de-DE' }, { locale: 'en-US' }] }) // locales
        .mockResolvedValueOnce({ rows: [{ total: '3' }] })           // pendingApprovals
        .mockResolvedValueOnce({ rows: [{ total: '12' }] });         // approvedVariants

      const stats = await library.getStats();

      expect(stats.totalNodes).toBe(5);
      expect(stats.localesSupported).toEqual(['de-DE', 'en-US']);
      expect(stats.pendingApprovals).toBe(3);
      expect(stats.approvedVariants).toBe(12);
    });

    it('returns zeros when library is empty', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: '0' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] });

      const stats = await library.getStats();

      expect(stats.totalNodes).toBe(0);
      expect(stats.localesSupported).toEqual([]);
      expect(stats.pendingApprovals).toBe(0);
      expect(stats.approvedVariants).toBe(0);
    });

    it('throws on database error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      await expect(library.getStats()).rejects.toThrow('Failed to get stats');
    });
  });

  // ── validateCompleteness ───────────────────────────────────────────────────

  describe('validateCompleteness', () => {
    it('returns valid when all nodes have approved variants for the locale', async () => {
      // All nodes
      mockQuery
        .mockResolvedValueOnce({ rows: [{ node_id: 'node-1' }, { node_id: 'node-2' }] })
        // Approved nodes for de-DE
        .mockResolvedValueOnce({ rows: [{ node_id: 'node-1' }, { node_id: 'node-2' }] });

      const result = await library.validateCompleteness('de-DE');

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('returns errors for nodes missing approved variants', async () => {
      // All nodes
      mockQuery
        .mockResolvedValueOnce({ rows: [{ node_id: 'node-1' }, { node_id: 'node-2' }] })
        // Approved nodes for de-DE (only node-1)
        .mockResolvedValueOnce({ rows: [{ node_id: 'node-1' }] })
        // Pending check for node-2 (none)
        .mockResolvedValueOnce({ rows: [] });

      const result = await library.validateCompleteness('de-DE');

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('node-2');
    });

    it('returns warnings for nodes with pending (unapproved) variants', async () => {
      // All nodes
      mockQuery
        .mockResolvedValueOnce({ rows: [{ node_id: 'node-1' }] })
        // Approved nodes for de-DE (none)
        .mockResolvedValueOnce({ rows: [] })
        // Pending check for node-1 (found)
        .mockResolvedValueOnce({ rows: [{ id: 'uuid-pending' }] });

      const result = await library.validateCompleteness('de-DE');

      expect(result.isValid).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('pending');
    });

    it('returns valid with a warning when library is empty', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // no nodes

      const result = await library.validateCompleteness('de-DE');

      expect(result.isValid).toBe(true);
      expect(result.warnings).toHaveLength(1);
    });

    it('rejects unsupported locales', async () => {
      const result = await library.validateCompleteness('ja-JP');

      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('not a supported launch locale');
    });

    it('accepts all 7 supported launch locales', async () => {
      const locales = ['en-US', 'en-GB', 'en-CA', 'en-AU', 'de-DE', 'fr-FR', 'es-ES'];

      for (const locale of locales) {
        // Empty library → valid with warning
        mockQuery.mockResolvedValueOnce({ rows: [] });
        const result = await library.validateCompleteness(locale);
        expect(result.isValid).toBe(true);
      }
    });

    it('returns error on database failure', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      const result = await library.validateCompleteness('de-DE');

      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('Failed to validate completeness');
    });
  });

  // ── getLibraryEntry ────────────────────────────────────────────────────────

  describe('getLibraryEntry', () => {
    it('returns null when node has no variants', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await library.getLibraryEntry('nonexistent-node');

      expect(result).toBeNull();
    });

    it('returns entry with variants map and version history', async () => {
      const rows = [
        makeRow({ locale: 'en-US', prompt_text: 'Analyze SEO' }),
        makeRow({ locale: 'de-DE', prompt_text: 'Analysiere SEO' }),
      ];
      mockQuery.mockResolvedValueOnce({ rows });

      const entry = await library.getLibraryEntry('node-seo-analysis');

      expect(entry).not.toBeNull();
      expect(entry!.nodeId).toBe('node-seo-analysis');
      expect(entry!.variants.size).toBe(2);
      expect(entry!.variants.has('en-US')).toBe(true);
      expect(entry!.variants.has('de-DE')).toBe(true);
      expect(entry!.versionHistory).toHaveLength(2);
    });

    it('uses en-US variant as basePrompt', async () => {
      const rows = [makeRow({ locale: 'en-US', prompt_text: 'Analyze SEO' })];
      mockQuery.mockResolvedValueOnce({ rows });

      const entry = await library.getLibraryEntry('node-seo-analysis');

      expect(entry!.basePrompt).toBe('Analyze SEO');
    });
  });

  // ── approval workflow integration ──────────────────────────────────────────

  describe('approval workflow', () => {
    it('full workflow: create → submit → approve', async () => {
      // createVariant
      mockQuery.mockResolvedValueOnce({
        rows: [makeRow({ approval_status: 'pending', approved_at: null })],
      });
      const variant = await library.createVariant(
        'node-seo-analysis',
        'de-DE',
        'Analysiere die Website',
        'German context'
      );
      expect(variant.approvalStatus).toBe('pending');

      // submitForApproval
      mockQuery.mockResolvedValueOnce({ rows: [{ id: variant.id }] });
      await library.submitForApproval(variant.id!, 'Looks great!');

      // approveVariant
      mockQuery.mockResolvedValueOnce({ rows: [{ id: variant.id }] });
      await library.approveVariant(variant.id!);

      // getPrompt should now return the approved variant
      mockQuery.mockResolvedValueOnce({ rows: [makeRow({ approval_status: 'approved' })] });
      const retrieved = await library.getPrompt('node-seo-analysis', 'de-DE');
      expect(retrieved!.approvalStatus).toBe('approved');
    });

    it('full workflow: create → submit → reject', async () => {
      // createVariant
      mockQuery.mockResolvedValueOnce({
        rows: [makeRow({ approval_status: 'pending', approved_at: null })],
      });
      const variant = await library.createVariant(
        'node-seo-analysis',
        'de-DE',
        'Bad translation',
        'context'
      );

      // rejectVariant
      mockQuery.mockResolvedValueOnce({ rows: [{ id: variant.id }] });
      await library.rejectVariant(variant.id!, 'Too literal, needs cultural adaptation');

      // getPrompt should fall back to en-US
      mockQuery.mockResolvedValueOnce({ rows: [] }); // no approved de-DE
      mockQuery.mockResolvedValueOnce({ rows: [makeRow({ locale: 'en-US' })] }); // en-US fallback
      const retrieved = await library.getPrompt('node-seo-analysis', 'de-DE');
      expect(retrieved!.locale).toBe('en-US');
    });
  });
});
