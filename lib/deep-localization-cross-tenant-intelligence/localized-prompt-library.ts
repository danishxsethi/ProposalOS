/**
 * LocalizedPromptLibrary: Stores and manages locale variants of all LangGraph node prompts.
 *
 * Implements:
 * - getPrompt() - retrieve locale-specific prompt variant
 * - createVariant() - store new locale variant
 * - submitForApproval() - native speaker review workflow
 * - approveVariant() / rejectVariant() - approval management
 * - getStats() - library statistics
 * - validateCompleteness() - ensure all locales have variants
 *
 * Requirements: 7.1, 7.4, 7.5, 7.6
 */

import {
  LocalizedPrompt,
  PromptLibraryEntry,
  PromptLibraryStats,
  ValidationResult,
} from './types';
import { query } from './db/connection';

/** Supported launch locales that every node must have variants for */
const SUPPORTED_LAUNCH_LOCALES = [
  'en-US',
  'en-GB',
  'en-CA',
  'en-AU',
  'de-DE',
  'fr-FR',
  'es-ES',
] as const;

export class LocalizedPromptLibrary {
  /**
   * Retrieve the locale-specific prompt variant for a given node.
   * Falls back to en-US if the requested locale variant is not found.
   *
   * Validates: Requirement 7.6
   */
  async getPrompt(nodeId: string, locale: string): Promise<LocalizedPrompt | null> {
    try {
      const result = await query(
        `SELECT id, node_id, locale, prompt_text, cultural_context,
                approval_status, native_speaker_review, created_at, approved_at
         FROM localized_prompts
         WHERE node_id = $1 AND locale = $2 AND approval_status = 'approved'
         ORDER BY created_at DESC
         LIMIT 1`,
        [nodeId, locale]
      );

      if (result.rows.length > 0) {
        return this.rowToLocalizedPrompt(result.rows[0]);
      }

      // Fallback to en-US if requested locale not found
      if (locale !== 'en-US') {
        const fallback = await query(
          `SELECT id, node_id, locale, prompt_text, cultural_context,
                  approval_status, native_speaker_review, created_at, approved_at
           FROM localized_prompts
           WHERE node_id = $1 AND locale = 'en-US' AND approval_status = 'approved'
           ORDER BY created_at DESC
           LIMIT 1`,
          [nodeId]
        );

        if (fallback.rows.length > 0) {
          return this.rowToLocalizedPrompt(fallback.rows[0]);
        }
      }

      return null;
    } catch (error) {
      console.error(`Error retrieving prompt for node ${nodeId}, locale ${locale}:`, error);
      return null;
    }
  }

  /**
   * Store a new locale variant for a node.
   * New variants start with 'pending' approval status.
   *
   * Validates: Requirements 7.1, 7.5
   */
  async createVariant(
    nodeId: string,
    locale: string,
    promptText: string,
    culturalContext?: string
  ): Promise<LocalizedPrompt> {
    try {
      // Upsert: if a variant already exists for this node+locale, update it
      const result = await query(
        `INSERT INTO localized_prompts
           (node_id, locale, prompt_text, cultural_context, approval_status)
         VALUES ($1, $2, $3, $4, 'pending')
         ON CONFLICT (node_id, locale)
         DO UPDATE SET
           prompt_text = EXCLUDED.prompt_text,
           cultural_context = EXCLUDED.cultural_context,
           approval_status = 'pending',
           native_speaker_review = NULL,
           created_at = NOW()
         RETURNING id, node_id, locale, prompt_text, cultural_context,
                   approval_status, native_speaker_review, created_at, approved_at`,
        [nodeId, locale, promptText, culturalContext ?? null]
      );

      return this.rowToLocalizedPrompt(result.rows[0]);
    } catch (error) {
      console.error(`Error creating variant for node ${nodeId}, locale ${locale}:`, error);
      throw new Error(`Failed to create variant: ${(error as Error).message}`);
    }
  }

  /**
   * Submit a variant for native speaker review.
   * Stores the reviewer's feedback and keeps status as 'pending' until approved/rejected.
   *
   * Validates: Requirement 7.4
   */
  async submitForApproval(variantId: string, nativeSpeakerReview: string): Promise<void> {
    try {
      const result = await query(
        `UPDATE localized_prompts
         SET native_speaker_review = $2
         WHERE id = $1
         RETURNING id`,
        [variantId, nativeSpeakerReview]
      );

      if (result.rows.length === 0) {
        throw new Error(`Variant not found: ${variantId}`);
      }
    } catch (error) {
      console.error(`Error submitting variant ${variantId} for approval:`, error);
      throw new Error(`Failed to submit for approval: ${(error as Error).message}`);
    }
  }

  /**
   * Approve a variant, making it available for use in audits.
   * Sets approval_status to 'approved' and records the approval timestamp.
   *
   * Validates: Requirement 7.5
   */
  async approveVariant(variantId: string): Promise<void> {
    try {
      const result = await query(
        `UPDATE localized_prompts
         SET approval_status = 'approved', approved_at = NOW()
         WHERE id = $1
         RETURNING id`,
        [variantId]
      );

      if (result.rows.length === 0) {
        throw new Error(`Variant not found: ${variantId}`);
      }
    } catch (error) {
      console.error(`Error approving variant ${variantId}:`, error);
      throw new Error(`Failed to approve variant: ${(error as Error).message}`);
    }
  }

  /**
   * Reject a variant with a reason, stored in native_speaker_review.
   * Sets approval_status to 'rejected'.
   *
   * Validates: Requirement 7.4
   */
  async rejectVariant(variantId: string, reason: string): Promise<void> {
    try {
      const result = await query(
        `UPDATE localized_prompts
         SET approval_status = 'rejected', native_speaker_review = $2
         WHERE id = $1
         RETURNING id`,
        [variantId, reason]
      );

      if (result.rows.length === 0) {
        throw new Error(`Variant not found: ${variantId}`);
      }
    } catch (error) {
      console.error(`Error rejecting variant ${variantId}:`, error);
      throw new Error(`Failed to reject variant: ${(error as Error).message}`);
    }
  }

  /**
   * Return aggregate statistics about the prompt library.
   *
   * Validates: Requirement 7.1
   */
  async getStats(): Promise<PromptLibraryStats> {
    try {
      const [nodesResult, localesResult, pendingResult, approvedResult] = await Promise.all([
        query(`SELECT COUNT(DISTINCT node_id) AS total FROM localized_prompts`),
        query(`SELECT DISTINCT locale FROM localized_prompts ORDER BY locale`),
        query(
          `SELECT COUNT(*) AS total FROM localized_prompts WHERE approval_status = 'pending'`
        ),
        query(
          `SELECT COUNT(*) AS total FROM localized_prompts WHERE approval_status = 'approved'`
        ),
      ]);

      return {
        totalNodes: parseInt(nodesResult.rows[0]?.total ?? '0', 10),
        localesSupported: localesResult.rows.map((r: any) => r.locale),
        pendingApprovals: parseInt(pendingResult.rows[0]?.total ?? '0', 10),
        approvedVariants: parseInt(approvedResult.rows[0]?.total ?? '0', 10),
      };
    } catch (error) {
      console.error('Error retrieving prompt library stats:', error);
      throw new Error(`Failed to get stats: ${(error as Error).message}`);
    }
  }

  /**
   * Validate that all supported launch locales have at least one approved variant
   * for the given locale (or for all nodes if no locale is specified).
   *
   * When called with a specific locale, checks that every node that has any
   * variant also has an approved variant for that locale.
   *
   * Validates: Requirement 7.1
   */
  async validateCompleteness(locale: string): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Validate the locale itself is a supported launch locale
      if (!(SUPPORTED_LAUNCH_LOCALES as readonly string[]).includes(locale)) {
        return {
          isValid: false,
          errors: [`Locale '${locale}' is not a supported launch locale`],
          warnings: [],
        };
      }

      // Get all distinct node IDs that have any variant
      const allNodesResult = await query(
        `SELECT DISTINCT node_id FROM localized_prompts ORDER BY node_id`
      );
      const allNodeIds: string[] = allNodesResult.rows.map((r: any) => r.node_id);

      if (allNodeIds.length === 0) {
        warnings.push('No nodes found in the prompt library');
        return { isValid: true, errors, warnings };
      }

      // Find nodes that are missing an approved variant for the requested locale
      const approvedResult = await query(
        `SELECT DISTINCT node_id FROM localized_prompts
         WHERE locale = $1 AND approval_status = 'approved'`,
        [locale]
      );
      const approvedNodeIds = new Set<string>(
        approvedResult.rows.map((r: any) => r.node_id)
      );

      for (const nodeId of allNodeIds) {
        if (!approvedNodeIds.has(nodeId)) {
          // Check if there's a pending variant (warning) or none at all (error)
          const pendingResult = await query(
            `SELECT id FROM localized_prompts
             WHERE node_id = $1 AND locale = $2 AND approval_status = 'pending'
             LIMIT 1`,
            [nodeId, locale]
          );

          if (pendingResult.rows.length > 0) {
            warnings.push(
              `Node '${nodeId}' has a pending (unapproved) variant for locale '${locale}'`
            );
          } else {
            errors.push(
              `Node '${nodeId}' is missing an approved variant for locale '${locale}'`
            );
          }
        }
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings,
      };
    } catch (error) {
      console.error(`Error validating completeness for locale ${locale}:`, error);
      return {
        isValid: false,
        errors: [`Failed to validate completeness: ${(error as Error).message}`],
        warnings: [],
      };
    }
  }

  /**
   * Retrieve a full library entry for a node, including all locale variants
   * and version history.
   */
  async getLibraryEntry(nodeId: string): Promise<PromptLibraryEntry | null> {
    try {
      const result = await query(
        `SELECT id, node_id, locale, prompt_text, cultural_context,
                approval_status, native_speaker_review, created_at, approved_at
         FROM localized_prompts
         WHERE node_id = $1
         ORDER BY locale, created_at DESC`,
        [nodeId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const variants = new Map<string, LocalizedPrompt>();
      const versionHistory: LocalizedPrompt[] = [];

      for (const row of result.rows) {
        const prompt = this.rowToLocalizedPrompt(row);
        versionHistory.push(prompt);
        // Keep the most recent variant per locale (rows are ordered by created_at DESC)
        if (!variants.has(row.locale)) {
          variants.set(row.locale, prompt);
        }
      }

      const timestamps = result.rows.map((r: any) => new Date(r.created_at));
      const createdAt = new Date(Math.min(...timestamps.map((d: Date) => d.getTime())));
      const lastUpdated = new Date(Math.max(...timestamps.map((d: Date) => d.getTime())));

      return {
        nodeId,
        variants,
        basePrompt: variants.get('en-US')?.promptText ?? '',
        createdAt,
        lastUpdated,
        versionHistory,
      };
    } catch (error) {
      console.error(`Error retrieving library entry for node ${nodeId}:`, error);
      return null;
    }
  }

  // ============================================================================
  // Private helpers
  // ============================================================================

  private rowToLocalizedPrompt(row: any): LocalizedPrompt {
    return {
      id: row.id,
      nodeId: row.node_id,
      locale: row.locale,
      promptText: row.prompt_text,
      culturalContext: row.cultural_context ?? '',
      thinkingBudget: 4096,
      createdAt: new Date(row.created_at),
      approvalStatus: row.approval_status as 'pending' | 'approved' | 'rejected',
      nativeSpeakerReview: row.native_speaker_review ?? undefined,
    };
  }
}
