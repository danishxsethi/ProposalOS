/**
 * Property 12: Cross-Tenant Learning Anonymization
 *
 * For any record in the shared intelligence model, it must contain zero
 * tenant-identifiable data: no tenant IDs, business names, contact info,
 * or prospect-specific identifiers.
 *
 * Feature: sprint-5-6-integration-pilot, Property 12: Cross-Tenant Learning Anonymization
 * Validates: Requirements 11.2
 */

import { describe, it } from 'vitest';
import fc from 'fast-check';
import { expect } from 'vitest';
import { ensureAnonymized } from '../crossTenantLearning';
import type { AnonymizedOutcome } from '../types';

/**
 * Derive the anonymized pattern record that aggregatePatterns would produce
 * for a group of outcomes — without touching the database.
 *
 * This mirrors the pure aggregation logic in crossTenantLearning.ts so the
 * property can be verified without any infrastructure dependency.
 */
function buildPatternRecord(outcomes: AnonymizedOutcome[]): Record<string, unknown> {
  const wins = outcomes.filter((o) => o.outcome === 'won').length;
  const total = outcomes.length;
  const winRate = total > 0 ? wins / total : 0;

  const findingCounts = new Map<string, number>();
  const templateCounts = new Map<string, number>();
  const dealValues: number[] = [];

  for (const o of outcomes) {
    for (const ft of o.findingTypes) {
      findingCounts.set(ft, (findingCounts.get(ft) ?? 0) + 1);
    }
    if (o.emailTemplateId) {
      templateCounts.set(o.emailTemplateId, (templateCounts.get(o.emailTemplateId) ?? 0) + 1);
    }
    if (o.outcome === 'won' && o.dealValue !== undefined) {
      dealValues.push(o.dealValue);
    }
  }

  const effectiveFindingTypes = [...findingCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([type]) => type);

  const bestEmailPatterns = [...templateCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);

  const dealMin = dealValues.length > 0 ? Math.min(...dealValues) : 0;
  const dealMax = dealValues.length > 0 ? Math.max(...dealValues) : 0;

  const vertical = outcomes[0].vertical;
  const geoRegion = outcomes[0].geoRegion;
  const version = `v${Date.now()}`;

  return {
    id: `${vertical}-${geoRegion}-${version}`,
    vertical,
    geoRegion,
    patternType: 'win_rate',
    data: {
      winRate,
      effectiveFindingTypes,
      optimalPriceRange: { min: dealMin, max: dealMax },
      bestEmailPatterns,
    },
    sampleSize: total,
    confidence: Math.min(total / 100, 1),
    lastUpdated: new Date(),
    modelVersion: version,
  };
}

describe('Property 12: Cross-Tenant Learning Anonymization', () => {
  /**
   * Property 12: Cross-Tenant Learning Anonymization
   *
   * For any set of AnonymizedOutcome records aggregated into the shared
   * intelligence model, every pattern stored must contain zero
   * tenant-identifiable data.
   *
   * Tag: Feature: sprint-5-6-integration-pilot, Property 12: Cross-Tenant Learning Anonymization
   */
  it(
    'Property 12: every pattern in the shared model contains zero tenant-identifiable data',
    () => {
      fc.assert(
        fc.property(
          // Generate a non-empty array of AnonymizedOutcome records
          fc.array(
            fc.record({
              vertical: fc.constantFrom(
                'dentistry',
                'hvac',
                'plumbing',
                'roofing',
                'landscaping',
                'auto_repair',
                'legal',
                'accounting'
              ),
              geoRegion: fc.constantFrom(
                'New York',
                'Los Angeles',
                'Chicago',
                'Houston',
                'Phoenix'
              ),
              painScore: fc.integer({ min: 0, max: 100 }),
              outcome: fc.constantFrom('won', 'lost', 'ghosted'),
              tierChosen: fc.option(fc.constantFrom('starter', 'growth', 'pro'), { nil: undefined }),
              dealValue: fc.option(fc.integer({ min: 500, max: 50000 }), { nil: undefined }),
              findingTypes: fc.array(
                fc.constantFrom('speed', 'seo', 'mobile', 'reviews', 'gbp', 'ads'),
                { maxLength: 5 }
              ),
              emailTemplateId: fc.option(
                fc.string({ minLength: 1, maxLength: 20 }),
                { nil: undefined }
              ),
            }),
            { minLength: 1, maxLength: 50 }
          ),
          (rawOutcomes) => {
            const outcomes: AnonymizedOutcome[] = rawOutcomes.map((o) => ({
              vertical: o.vertical,
              geoRegion: o.geoRegion,
              painScore: o.painScore,
              outcome: o.outcome as 'won' | 'lost' | 'ghosted',
              tierChosen: o.tierChosen ?? undefined,
              dealValue: o.dealValue ?? undefined,
              findingTypes: o.findingTypes,
              emailTemplateId: o.emailTemplateId ?? undefined,
            }));

            // Build the pattern record the same way aggregatePatterns would
            const pattern = buildPatternRecord(outcomes);

            // Every pattern must pass the anonymization check
            expect(
              ensureAnonymized(pattern),
              `Pattern contains PII: ${JSON.stringify(pattern)}`
            ).toBe(true);

            // Explicitly verify no tenant-identifiable fields exist
            expect(pattern).not.toHaveProperty('tenantId');
            expect(pattern).not.toHaveProperty('tenant_id');
            expect(pattern).not.toHaveProperty('businessName');
            expect(pattern).not.toHaveProperty('business_name');
            expect(pattern).not.toHaveProperty('contactEmail');
            expect(pattern).not.toHaveProperty('email');
            expect(pattern).not.toHaveProperty('phone');
            expect(pattern).not.toHaveProperty('prospectId');
            expect(pattern).not.toHaveProperty('prospect_id');
            expect(pattern).not.toHaveProperty('leadId');
            expect(pattern).not.toHaveProperty('lead_id');
          }
        ),
        { numRuns: 100 }
      );
    }
  );
});
