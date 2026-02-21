/**
 * Property-based tests for LocalizedPromptLibrary
 *
 * Feature: deep-localization-cross-tenant-intelligence
 *
 * Properties covered:
 *   Property 25: Locale Variant Requirement
 *   Property 26: Variant Gemini Budget
 *   Property 27: Variant Cultural Rewriting
 *   Property 28: Native Speaker Review Requirement
 *   Property 29: Variant Storage and Versioning
 *   Property 30: Variant Selection Correctness
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { LocalizedPromptLibrary } from '../localized-prompt-library';
import * as dbConnection from '../db/connection';
import { LocalizedPrompt } from '../types';

vi.mock('../db/connection', () => ({
  query: vi.fn(),
}));

const mockQuery = vi.mocked(dbConnection.query);

// ─── Constants ────────────────────────────────────────────────────────────────

const SUPPORTED_LAUNCH_LOCALES = ['en-US', 'en-GB', 'en-CA', 'en-AU', 'de-DE', 'fr-FR', 'es-ES'];

// ─── Arbitraries ─────────────────────────────────────────────────────────────

/** A valid node ID (alphanumeric + hyphens) */
const nodeIdArb = fc
  .stringMatching(/^[a-z][a-z0-9-]{2,30}$/)
  .filter((s) => s.length >= 3);

/** One of the 7 supported launch locales */
const supportedLocaleArb = fc.constantFrom(...SUPPORTED_LAUNCH_LOCALES);

/** A non-empty prompt text */
const promptTextArb = fc.string({ minLength: 10, maxLength: 500 });

/** A non-empty cultural context string */
const culturalContextArb = fc.string({ minLength: 5, maxLength: 300 });

/** A non-empty native speaker review comment */
const reviewCommentArb = fc.string({ minLength: 5, maxLength: 200 });

/** A UUID-like variant ID */
const variantIdArb = fc.uuid();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makePromptRow(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: 'uuid-test-1',
    node_id: 'node-seo-analysis',
    locale: 'de-DE',
    prompt_text: 'Analysiere die Website auf SEO-Probleme',
    cultural_context: 'German market context with GDPR considerations',
    approval_status: 'approved',
    native_speaker_review: 'Reviewed and approved by native speaker',
    created_at: new Date('2024-01-01T00:00:00Z'),
    approved_at: new Date('2024-01-02T00:00:00Z'),
    ...overrides,
  };
}

function makeLocalizedPrompt(overrides: Partial<LocalizedPrompt> = {}): LocalizedPrompt {
  return {
    id: 'uuid-test-1',
    nodeId: 'node-seo-analysis',
    locale: 'de-DE',
    promptText: 'Analysiere die Website auf SEO-Probleme',
    culturalContext: 'German market context',
    thinkingBudget: 4096,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    approvalStatus: 'approved',
    nativeSpeakerReview: 'Approved',
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('LocalizedPromptLibrary - Property-Based Tests', () => {
  let library: LocalizedPromptLibrary;

  beforeEach(() => {
    vi.clearAllMocks();
    library = new LocalizedPromptLibrary();
  });

  // ── Property 25 ─────────────────────────────────────────────────────────────

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 25: Locale Variant Requirement
   *
   * For any new LangGraph node, the System SHALL require locale variants for all
   * supported launch locales (en-US, en-GB, en-CA, en-AU, de-DE, fr-FR, es-ES).
   *
   * Validates: Requirements 7.1
   */
  describe('Property 25: Locale Variant Requirement', () => {
    it('validateCompleteness should reject unsupported locales for every node', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string().filter((s) => !SUPPORTED_LAUNCH_LOCALES.includes(s) && s.length > 0),
          async (unsupportedLocale) => {
            // No DB calls needed – validation short-circuits for unsupported locales
            const result = await library.validateCompleteness(unsupportedLocale);

            expect(result.isValid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
            expect(result.errors[0]).toMatch(/not a supported launch locale/i);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('validateCompleteness should accept all 7 supported launch locales', async () => {
      await fc.assert(
        fc.asyncProperty(supportedLocaleArb, async (locale) => {
          // Empty library → valid with a warning (no nodes yet)
          mockQuery.mockResolvedValueOnce({ rows: [] });

          const result = await library.validateCompleteness(locale);

          // An empty library is valid (no nodes to check)
          expect(result.isValid).toBe(true);
          expect(result.errors).toHaveLength(0);
        }),
        { numRuns: 100 }
      );
    });

    it('should report missing variants as errors for nodes that lack them', async () => {
      await fc.assert(
        fc.asyncProperty(
          nodeIdArb,
          supportedLocaleArb,
          async (nodeId, locale) => {
            // All nodes: one node exists
            mockQuery
              .mockResolvedValueOnce({ rows: [{ node_id: nodeId }] })
              // Approved nodes for locale: none
              .mockResolvedValueOnce({ rows: [] })
              // Pending check: none
              .mockResolvedValueOnce({ rows: [] });

            const result = await library.validateCompleteness(locale);

            expect(result.isValid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
            expect(result.errors[0]).toContain(nodeId);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should report pending variants as warnings, not errors', async () => {
      await fc.assert(
        fc.asyncProperty(
          nodeIdArb,
          supportedLocaleArb,
          async (nodeId, locale) => {
            // All nodes: one node exists
            mockQuery
              .mockResolvedValueOnce({ rows: [{ node_id: nodeId }] })
              // Approved nodes for locale: none
              .mockResolvedValueOnce({ rows: [] })
              // Pending check: found
              .mockResolvedValueOnce({ rows: [{ id: 'pending-uuid' }] });

            const result = await library.validateCompleteness(locale);

            // Pending variant → valid (no hard error), but warning
            expect(result.isValid).toBe(true);
            expect(result.warnings.length).toBeGreaterThan(0);
            expect(result.warnings[0]).toMatch(/pending/i);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ── Property 26 ─────────────────────────────────────────────────────────────

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 26: Variant Gemini Budget
   *
   * For any locale variant creation, the Localization_Engine SHALL use Gemini with
   * 4,096 tokens for thinking budget.
   *
   * Validates: Requirements 7.2
   */
  describe('Property 26: Variant Gemini Budget', () => {
    it('every created variant should have thinkingBudget of exactly 4,096', async () => {
      await fc.assert(
        fc.asyncProperty(
          nodeIdArb,
          supportedLocaleArb,
          promptTextArb,
          fc.option(culturalContextArb),
          async (nodeId, locale, promptText, culturalContext) => {
            const row = makePromptRow({
              node_id: nodeId,
              locale,
              prompt_text: promptText,
              cultural_context: culturalContext ?? null,
              approval_status: 'pending',
              approved_at: null,
            });
            mockQuery.mockResolvedValueOnce({ rows: [row] });

            const variant = await library.createVariant(
              nodeId,
              locale,
              promptText,
              culturalContext ?? undefined
            );

            // The thinking budget must always be exactly 4,096
            expect(variant.thinkingBudget).toBe(4096);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('every retrieved prompt should carry thinkingBudget of 4,096', async () => {
      await fc.assert(
        fc.asyncProperty(
          nodeIdArb,
          supportedLocaleArb,
          async (nodeId, locale) => {
            const row = makePromptRow({ node_id: nodeId, locale });
            mockQuery.mockResolvedValueOnce({ rows: [row] });

            const prompt = await library.getPrompt(nodeId, locale);

            expect(prompt).not.toBeNull();
            expect(prompt!.thinkingBudget).toBe(4096);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ── Property 27 ─────────────────────────────────────────────────────────────

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 27: Variant Cultural Rewriting
   *
   * For any created locale variant, the variant SHALL include cultural context
   * appropriate to the target locale.
   *
   * Validates: Requirements 7.3
   */
  describe('Property 27: Variant Cultural Rewriting', () => {
    it('createVariant should persist and return the cultural context', async () => {
      await fc.assert(
        fc.asyncProperty(
          nodeIdArb,
          supportedLocaleArb,
          promptTextArb,
          culturalContextArb,
          async (nodeId, locale, promptText, culturalContext) => {
            const row = makePromptRow({
              node_id: nodeId,
              locale,
              prompt_text: promptText,
              cultural_context: culturalContext,
              approval_status: 'pending',
            });
            mockQuery.mockResolvedValueOnce({ rows: [row] });

            const variant = await library.createVariant(nodeId, locale, promptText, culturalContext);

            // Cultural context must be present and non-empty
            expect(variant.culturalContext).toBeDefined();
            expect(variant.culturalContext.length).toBeGreaterThan(0);
            expect(variant.culturalContext).toBe(culturalContext);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('cultural context is passed to the database on createVariant', async () => {
      await fc.assert(
        fc.asyncProperty(
          nodeIdArb,
          supportedLocaleArb,
          promptTextArb,
          // Use printable ASCII strings to avoid whitespace-only edge cases
          fc.string({ minLength: 5, maxLength: 100 }).filter((s) => s.trim().length > 0),
          async (nodeId, locale, promptText, culturalContext) => {
            vi.clearAllMocks();
            const row = makePromptRow({
              node_id: nodeId,
              locale,
              cultural_context: culturalContext,
              approval_status: 'pending',
            });
            mockQuery.mockResolvedValueOnce({ rows: [row] });

            await library.createVariant(nodeId, locale, promptText, culturalContext);

            // The cultural context must have been passed as a query parameter
            const lastCall = mockQuery.mock.calls[mockQuery.mock.calls.length - 1];
            expect(lastCall[1]).toContain(culturalContext);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('retrieved approved variant should carry cultural context', async () => {
      await fc.assert(
        fc.asyncProperty(
          nodeIdArb,
          supportedLocaleArb,
          culturalContextArb,
          async (nodeId, locale, culturalContext) => {
            const row = makePromptRow({
              node_id: nodeId,
              locale,
              cultural_context: culturalContext,
              approval_status: 'approved',
            });
            mockQuery.mockResolvedValueOnce({ rows: [row] });

            const prompt = await library.getPrompt(nodeId, locale);

            expect(prompt).not.toBeNull();
            expect(prompt!.culturalContext).toBeDefined();
            expect(prompt!.culturalContext.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ── Property 28 ─────────────────────────────────────────────────────────────

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 28: Native Speaker Review Requirement
   *
   * For any locale variant for a launch locale, the System SHALL require native
   * speaker review before approval.
   *
   * Validates: Requirements 7.4
   */
  describe('Property 28: Native Speaker Review Requirement', () => {
    it('newly created variants must start in pending status (not approved)', async () => {
      await fc.assert(
        fc.asyncProperty(
          nodeIdArb,
          supportedLocaleArb,
          promptTextArb,
          async (nodeId, locale, promptText) => {
            const row = makePromptRow({
              node_id: nodeId,
              locale,
              prompt_text: promptText,
              approval_status: 'pending',
              approved_at: null,
              native_speaker_review: null,
            });
            mockQuery.mockResolvedValueOnce({ rows: [row] });

            const variant = await library.createVariant(nodeId, locale, promptText);

            // Must start as pending – cannot be auto-approved
            expect(variant.approvalStatus).toBe('pending');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('submitForApproval should store the native speaker review comment', async () => {
      await fc.assert(
        fc.asyncProperty(
          variantIdArb,
          // Use non-whitespace-only strings
          fc.string({ minLength: 5, maxLength: 200 }).filter((s) => s.trim().length > 0),
          async (variantId, reviewComment) => {
            vi.clearAllMocks();
            mockQuery.mockResolvedValueOnce({ rows: [{ id: variantId }] });

            await expect(
              library.submitForApproval(variantId, reviewComment)
            ).resolves.not.toThrow();

            // The review comment must be passed to the DB
            const lastCall = mockQuery.mock.calls[mockQuery.mock.calls.length - 1];
            expect(lastCall[1]).toContain(reviewComment);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('approveVariant should set approval_status to approved in the SQL', async () => {
      await fc.assert(
        fc.asyncProperty(variantIdArb, async (variantId) => {
          mockQuery.mockResolvedValueOnce({ rows: [{ id: variantId }] });

          await library.approveVariant(variantId);

          const sql = mockQuery.mock.calls[0][0] as string;
          expect(sql).toContain("approval_status = 'approved'");
        }),
        { numRuns: 100 }
      );
    });

    it('rejectVariant should set approval_status to rejected and store the reason', async () => {
      await fc.assert(
        fc.asyncProperty(
          variantIdArb,
          // Use non-whitespace-only strings
          fc.string({ minLength: 5, maxLength: 200 }).filter((s) => s.trim().length > 0),
          async (variantId, reason) => {
            vi.clearAllMocks();
            mockQuery.mockResolvedValueOnce({ rows: [{ id: variantId }] });

            await library.rejectVariant(variantId, reason);

            const lastCall = mockQuery.mock.calls[mockQuery.mock.calls.length - 1];
            const sql = lastCall[0] as string;
            const params = lastCall[1] as any[];
            expect(sql).toContain("approval_status = 'rejected'");
            expect(params).toContain(reason);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('getPrompt should only return approved variants (not pending or rejected)', async () => {
      await fc.assert(
        fc.asyncProperty(
          nodeIdArb,
          supportedLocaleArb,
          fc.constantFrom('pending', 'rejected'),
          async (nodeId, locale, nonApprovedStatus) => {
            // First query returns nothing (no approved variant for locale)
            mockQuery.mockResolvedValueOnce({ rows: [] });
            // Fallback en-US also returns nothing
            if (locale !== 'en-US') {
              mockQuery.mockResolvedValueOnce({ rows: [] });
            }

            const prompt = await library.getPrompt(nodeId, locale);

            // No approved variant → null
            expect(prompt).toBeNull();

            // Verify the SQL query filters by approval_status = 'approved'
            const sql = mockQuery.mock.calls[0][0] as string;
            expect(sql).toContain("approval_status = 'approved'");
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ── Property 29 ─────────────────────────────────────────────────────────────

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 29: Variant Storage and Versioning
   *
   * For any approved locale variant, the System SHALL store it in the
   * Localized_Prompt_Library with complete version tracking information.
   *
   * Validates: Requirements 7.5
   */
  describe('Property 29: Variant Storage and Versioning', () => {
    it('getLibraryEntry should include versionHistory for every stored variant', async () => {
      await fc.assert(
        fc.asyncProperty(
          nodeIdArb,
          fc.array(supportedLocaleArb, { minLength: 1, maxLength: 7 }),
          async (nodeId, locales) => {
            const uniqueLocales = [...new Set(locales)];
            const rows = uniqueLocales.map((locale) =>
              makePromptRow({ node_id: nodeId, locale })
            );
            mockQuery.mockResolvedValueOnce({ rows });

            const entry = await library.getLibraryEntry(nodeId);

            expect(entry).not.toBeNull();
            // Version history must contain all stored rows
            expect(entry!.versionHistory.length).toBe(rows.length);
            // Each history entry must have required fields
            for (const histEntry of entry!.versionHistory) {
              expect(histEntry.nodeId).toBe(nodeId);
              expect(histEntry.locale).toBeDefined();
              expect(histEntry.promptText).toBeDefined();
              expect(histEntry.createdAt).toBeInstanceOf(Date);
              expect(histEntry.approvalStatus).toBeDefined();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('getLibraryEntry should track createdAt and lastUpdated timestamps', async () => {
      await fc.assert(
        fc.asyncProperty(
          nodeIdArb,
          fc.array(
            fc.record({
              locale: supportedLocaleArb,
              createdAt: fc.date({ min: new Date('2020-01-01'), max: new Date('2024-12-31') }),
            }),
            { minLength: 1, maxLength: 5 }
          ),
          async (nodeId, entries) => {
            const rows = entries.map(({ locale, createdAt }) =>
              makePromptRow({ node_id: nodeId, locale, created_at: createdAt })
            );
            mockQuery.mockResolvedValueOnce({ rows });

            const entry = await library.getLibraryEntry(nodeId);

            expect(entry).not.toBeNull();
            expect(entry!.createdAt).toBeInstanceOf(Date);
            expect(entry!.lastUpdated).toBeInstanceOf(Date);
            // lastUpdated must be >= createdAt
            expect(entry!.lastUpdated.getTime()).toBeGreaterThanOrEqual(
              entry!.createdAt.getTime()
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    it('createVariant should persist all required fields to the database', async () => {
      await fc.assert(
        fc.asyncProperty(
          nodeIdArb,
          supportedLocaleArb,
          promptTextArb,
          culturalContextArb,
          async (nodeId, locale, promptText, culturalContext) => {
            const row = makePromptRow({
              node_id: nodeId,
              locale,
              prompt_text: promptText,
              cultural_context: culturalContext,
              approval_status: 'pending',
            });
            mockQuery.mockResolvedValueOnce({ rows: [row] });

            const variant = await library.createVariant(nodeId, locale, promptText, culturalContext);

            // All required fields must be present on the returned variant
            expect(variant.nodeId).toBe(nodeId);
            expect(variant.locale).toBe(locale);
            expect(variant.promptText).toBe(promptText);
            expect(variant.culturalContext).toBe(culturalContext);
            expect(variant.approvalStatus).toBe('pending');
            expect(variant.createdAt).toBeInstanceOf(Date);
            expect(variant.thinkingBudget).toBe(4096);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('approveVariant SQL should set approved_at timestamp', async () => {
      await fc.assert(
        fc.asyncProperty(variantIdArb, async (variantId) => {
          mockQuery.mockResolvedValueOnce({ rows: [{ id: variantId }] });

          await library.approveVariant(variantId);

          const sql = mockQuery.mock.calls[0][0] as string;
          // Must record the approval timestamp for version tracking
          expect(sql).toContain('approved_at');
        }),
        { numRuns: 100 }
      );
    });
  });

  // ── Property 30 ─────────────────────────────────────────────────────────────

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 30: Variant Selection Correctness
   *
   * For any audit execution, the System SHALL select the appropriate prompt variant
   * based on the detected locale.
   *
   * Validates: Requirements 7.6
   */
  describe('Property 30: Variant Selection Correctness', () => {
    it('getPrompt should return the variant matching the requested locale', async () => {
      await fc.assert(
        fc.asyncProperty(
          nodeIdArb,
          supportedLocaleArb,
          promptTextArb,
          culturalContextArb,
          async (nodeId, locale, promptText, culturalContext) => {
            const row = makePromptRow({
              node_id: nodeId,
              locale,
              prompt_text: promptText,
              cultural_context: culturalContext,
              approval_status: 'approved',
            });
            mockQuery.mockResolvedValueOnce({ rows: [row] });

            const prompt = await library.getPrompt(nodeId, locale);

            expect(prompt).not.toBeNull();
            // The returned variant must match the requested locale
            expect(prompt!.locale).toBe(locale);
            expect(prompt!.nodeId).toBe(nodeId);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('getPrompt should fall back to en-US when the requested locale has no approved variant', async () => {
      await fc.assert(
        fc.asyncProperty(
          nodeIdArb,
          // Only non-en-US locales can fall back to en-US
          fc.constantFrom('en-GB', 'en-CA', 'en-AU', 'de-DE', 'fr-FR', 'es-ES'),
          promptTextArb,
          async (nodeId, locale, promptText) => {
            // No approved variant for the requested locale
            mockQuery.mockResolvedValueOnce({ rows: [] });
            // en-US fallback exists
            const fallbackRow = makePromptRow({
              node_id: nodeId,
              locale: 'en-US',
              prompt_text: promptText,
              approval_status: 'approved',
            });
            mockQuery.mockResolvedValueOnce({ rows: [fallbackRow] });

            const prompt = await library.getPrompt(nodeId, locale);

            expect(prompt).not.toBeNull();
            // Fallback must be en-US
            expect(prompt!.locale).toBe('en-US');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('getPrompt should return null when neither the locale nor en-US has an approved variant', async () => {
      await fc.assert(
        fc.asyncProperty(
          nodeIdArb,
          fc.constantFrom('en-GB', 'en-CA', 'en-AU', 'de-DE', 'fr-FR', 'es-ES'),
          async (nodeId, locale) => {
            // No approved variant for requested locale
            mockQuery.mockResolvedValueOnce({ rows: [] });
            // No en-US fallback either
            mockQuery.mockResolvedValueOnce({ rows: [] });

            const prompt = await library.getPrompt(nodeId, locale);

            expect(prompt).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('getPrompt for en-US should not attempt a second fallback query', async () => {
      await fc.assert(
        fc.asyncProperty(nodeIdArb, async (nodeId) => {
          vi.clearAllMocks();
          // No approved en-US variant
          mockQuery.mockResolvedValueOnce({ rows: [] });

          const prompt = await library.getPrompt(nodeId, 'en-US');

          expect(prompt).toBeNull();
          // Only one DB query should have been made (no redundant fallback)
          expect(mockQuery).toHaveBeenCalledTimes(1);
        }),
        { numRuns: 100 }
      );
    });

    it('getPrompt SQL should query by both nodeId and locale', async () => {
      await fc.assert(
        fc.asyncProperty(
          nodeIdArb,
          supportedLocaleArb,
          async (nodeId, locale) => {
            vi.clearAllMocks();
            mockQuery.mockResolvedValueOnce({ rows: [] });
            if (locale !== 'en-US') {
              mockQuery.mockResolvedValueOnce({ rows: [] });
            }

            await library.getPrompt(nodeId, locale);

            // The first query must filter by both node_id and locale
            const firstCallParams = mockQuery.mock.calls[0][1] as any[];
            expect(firstCallParams).toContain(nodeId);
            expect(firstCallParams).toContain(locale);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
