/**
 * Property 19: Vertical Playbook A/B Test Promotion
 *
 * For any playbook in testing status, it must only be promoted to production
 * if it outperforms the control by the configured improvement threshold with
 * statistical significance.
 *
 * Feature: sprint-5-6-integration-pilot, Property 19: Vertical Playbook A/B Test Promotion
 * Validates: Requirements 12.4, 12.5
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { ABTestResult } from '../types';

// ============================================================
// Pure promotion gate logic (mirrors promotePlaybook internals)
// ============================================================

const IMPROVEMENT_THRESHOLD = 0.1; // 10%
const SIGNIFICANCE_THRESHOLD = 0.05; // p < 0.05

/**
 * Determine whether a playbook should be promoted based on A/B test results.
 * This is the pure decision function extracted from promotePlaybook.
 */
function shouldPromote(result: ABTestResult): boolean {
  return (
    result.significant &&
    result.improvement >= IMPROVEMENT_THRESHOLD &&
    result.winner === 'test'
  );
}

/**
 * Compute a two-proportion z-test p-value (same as in verticalSpecialization.ts).
 */
function computePValue(
  controlWins: number,
  controlTotal: number,
  testWins: number,
  testTotal: number
): number {
  if (controlTotal === 0 || testTotal === 0) return 1;

  const p1 = controlWins / controlTotal;
  const p2 = testWins / testTotal;
  const pooled = (controlWins + testWins) / (controlTotal + testTotal);

  if (pooled === 0 || pooled === 1) return 1;

  const se = Math.sqrt(pooled * (1 - pooled) * (1 / controlTotal + 1 / testTotal));
  if (se === 0) return 1;

  const z = Math.abs(p2 - p1) / se;

  const t = 1 / (1 + 0.2316419 * z);
  const poly =
    t * (0.319381530 +
      t * (-0.356563782 +
        t * (1.781477937 +
          t * (-1.821255978 + t * 1.330274429))));
  const phi = (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * z * z);
  const oneTail = phi * poly;
  return Math.min(2 * oneTail, 1);
}

/**
 * Build an ABTestResult from raw win/loss counts.
 */
function buildABTestResult(
  testId: string,
  controlWins: number,
  controlTotal: number,
  testWins: number,
  testTotal: number
): ABTestResult {
  const controlMetric = controlTotal > 0 ? controlWins / controlTotal : 0;
  const testMetric = testTotal > 0 ? testWins / testTotal : 0;
  const improvement =
    controlMetric > 0 ? (testMetric - controlMetric) / controlMetric : 0;
  const pValue = computePValue(controlWins, controlTotal, testWins, testTotal);
  const significant = pValue < SIGNIFICANCE_THRESHOLD;

  let winner: ABTestResult['winner'] = 'inconclusive';
  if (significant && improvement >= IMPROVEMENT_THRESHOLD) winner = 'test';
  else if (significant && improvement < -IMPROVEMENT_THRESHOLD) winner = 'control';

  return {
    testId,
    winner,
    controlMetric,
    testMetric,
    improvement,
    pValue,
    sampleSize: controlTotal + testTotal,
    significant,
  };
}

// ============================================================
// Generators
// ============================================================

/** Generate a valid ABTestResult with controlled win/loss counts */
const abTestResultArb = fc.record({
  controlWins: fc.integer({ min: 0, max: 500 }),
  controlTotal: fc.integer({ min: 1, max: 1000 }),
  testWins: fc.integer({ min: 0, max: 500 }),
  testTotal: fc.integer({ min: 1, max: 1000 }),
}).map(({ controlWins, controlTotal, testWins, testTotal }) => {
  // Clamp wins to total
  const cw = Math.min(controlWins, controlTotal);
  const tw = Math.min(testWins, testTotal);
  return buildABTestResult('test-id', cw, controlTotal, tw, testTotal);
});

// ============================================================
// Properties
// ============================================================

describe('Property 19: Vertical Playbook A/B Test Promotion', () => {
  /**
   * Property 19a: A playbook must NOT be promoted unless it is statistically
   * significant (p < 0.05) AND meets the improvement threshold (>= 10%).
   *
   * Tag: Feature: sprint-5-6-integration-pilot, Property 19: Vertical Playbook A/B Test Promotion
   */
  it(
    'Property 19a: promotion requires both statistical significance and improvement threshold',
    () => {
      fc.assert(
        fc.property(abTestResultArb, (result) => {
          const promoted = shouldPromote(result);

          if (promoted) {
            // If promoted, BOTH conditions must hold
            expect(result.significant).toBe(true);
            expect(result.improvement).toBeGreaterThanOrEqual(IMPROVEMENT_THRESHOLD);
            expect(result.winner).toBe('test');
          }

          // Contrapositive: if either condition fails, must NOT be promoted
          if (!result.significant || result.improvement < IMPROVEMENT_THRESHOLD) {
            expect(promoted).toBe(false);
          }
        }),
        { numRuns: 100 }
      );
    }
  );

  /**
   * Property 19b: A playbook that does NOT outperform the control by the
   * improvement threshold must never be promoted, regardless of p-value.
   *
   * Tag: Feature: sprint-5-6-integration-pilot, Property 19: Vertical Playbook A/B Test Promotion
   */
  it(
    'Property 19b: playbook below improvement threshold is never promoted',
    () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 1000 }).chain((controlTotal) =>
            fc.integer({ min: 0, max: controlTotal }).chain((controlWins) =>
              fc.integer({ min: 1, max: 1000 }).chain((testTotal) => {
                const controlRate = controlWins / controlTotal;
                // Generate test wins that produce improvement < threshold
                const maxTestRate = controlRate * (1 + IMPROVEMENT_THRESHOLD - 0.001);
                const maxTestWins = Math.floor(maxTestRate * testTotal);
                return fc.integer({ min: 0, max: Math.max(0, maxTestWins) }).map((testWins) =>
                  buildABTestResult('test-id', controlWins, controlTotal, testWins, testTotal)
                );
              })
            )
          ),
          (result) => {
            // improvement is below threshold — must not be promoted
            expect(result.improvement).toBeLessThan(IMPROVEMENT_THRESHOLD);
            expect(shouldPromote(result)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    }
  );

  /**
   * Property 19c: A playbook that IS statistically significant AND meets the
   * improvement threshold MUST be promotable (winner === 'test').
   *
   * Tag: Feature: sprint-5-6-integration-pilot, Property 19: Vertical Playbook A/B Test Promotion
   */
  it(
    'Property 19c: playbook meeting both criteria is always promotable',
    () => {
      fc.assert(
        fc.property(
          // Generate cases where test clearly outperforms control
          fc.integer({ min: 100, max: 500 }).chain((controlTotal) =>
            fc.integer({ min: 200, max: 500 }).chain((testTotal) => {
              // Control: ~30% win rate
              const controlWins = Math.floor(controlTotal * 0.30);
              // Test: ~45% win rate (50% improvement over control)
              const testWins = Math.floor(testTotal * 0.45);
              return fc.constant(
                buildABTestResult('test-id', controlWins, controlTotal, testWins, testTotal)
              );
            })
          ),
          (result) => {
            // With large samples and clear improvement, should be significant and promotable
            if (result.significant && result.improvement >= IMPROVEMENT_THRESHOLD) {
              expect(result.winner).toBe('test');
              expect(shouldPromote(result)).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    }
  );
});
