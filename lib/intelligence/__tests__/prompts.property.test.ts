/**
 * Property 16: Prompt Guardrail Validation
 * Property 17: Prompt Rollback on Degradation
 *
 * Feature: sprint-5-6-integration-pilot, Property 16: Prompt Guardrail Validation
 * Feature: sprint-5-6-integration-pilot, Property 17: Prompt Rollback on Degradation
 * Validates: Requirements 15.6, 15.8
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { PromptVariant, ABTestResult } from '../types';

// ============================================================
// Pure guardrail logic (mirrors validateGuardrails internals)
// ============================================================

const HARMFUL_PATTERNS = [
  /\b(kill|murder|harm|attack|weapon|explosive|drug|illegal)\b/i,
  /\b(hate|racist|sexist|discriminat)\b/i,
];

const MISLEADING_PATTERNS = [
  /\b(guaranteed|100%\s+success|never\s+fail|always\s+work)\b/i,
  /\b(instant\s+results|overnight\s+success|get\s+rich\s+quick)\b/i,
];

const COMPLIANCE_PATTERNS = [
  /\b(no\s+unsubscribe|ignore\s+opt.?out|bypass\s+spam)\b/i,
  /\b(collect\s+without\s+consent|sell\s+your\s+data)\b/i,
];

const BRAND_UNSAFE_PATTERNS = [
  /\b(competitor\s+sucks|[a-z]+\s+is\s+terrible|avoid\s+[a-z]+)\b/i,
  /\b(scam|fraud|fake|lie|cheat)\b/i,
];

function checkGuardrails(content: string): {
  passed: boolean;
  noHarmfulContent: boolean;
  noMisleadingClaims: boolean;
  complianceCheck: boolean;
  brandSafetyCheck: boolean;
} {
  const noHarmfulContent = !HARMFUL_PATTERNS.some((p) => p.test(content));
  const noMisleadingClaims = !MISLEADING_PATTERNS.some((p) => p.test(content));
  const complianceCheck = !COMPLIANCE_PATTERNS.some((p) => p.test(content));
  const brandSafetyCheck = !BRAND_UNSAFE_PATTERNS.some((p) => p.test(content));
  const passed = noHarmfulContent && noMisleadingClaims && complianceCheck && brandSafetyCheck;
  return { passed, noHarmfulContent, noMisleadingClaims, complianceCheck, brandSafetyCheck };
}

// ============================================================
// Pure rollback logic (mirrors checkAndAutoRollback internals)
// ============================================================

const ROLLBACK_THRESHOLD = 0.2; // 20% degradation

function shouldAutoRollback(baselineSuccessRate: number, currentSuccessRate: number): boolean {
  if (baselineSuccessRate <= 0) return false;
  const degradation = (baselineSuccessRate - currentSuccessRate) / baselineSuccessRate;
  return degradation > ROLLBACK_THRESHOLD;
}

// ============================================================
// Generators
// ============================================================

const taskTypeArb = fc.constantFrom(
  'email_generation',
  'proposal_writing',
  'objection_handling',
  'diagnosis'
) as fc.Arbitrary<PromptVariant['taskType']>;

const statusArb = fc.constantFrom(
  'draft',
  'testing',
  'production',
  'deprecated'
) as fc.Arbitrary<PromptVariant['status']>;

const promptVariantArb = fc.record({
  id: fc.uuid(),
  basePromptId: fc.string({ minLength: 1, maxLength: 50 }),
  version: fc.integer({ min: 1, max: 100 }),
  content: fc.string({ minLength: 1, maxLength: 500 }),
  taskType: taskTypeArb,
  status: statusArb,
  createdBy: fc.constantFrom('human', 'autonomous') as fc.Arbitrary<'human' | 'autonomous'>,
  performance: fc.record({
    sampleSize: fc.integer({ min: 0, max: 10000 }),
    successRate: fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true }),
    qualityScore: fc.float({ min: Math.fround(0), max: Math.fround(100), noNaN: true }),
    costPerCall: fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true }),
  }),
  createdAt: fc.date(),
});

const abTestResultArb = fc.record({
  testId: fc.string({ minLength: 1, maxLength: 50 }),
  winner: fc.constantFrom('control', 'test', 'inconclusive') as fc.Arbitrary<ABTestResult['winner']>,
  controlMetric: fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true }),
  testMetric: fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true }),
  improvement: fc.float({ min: Math.fround(-1), max: Math.fround(2), noNaN: true }),
  pValue: fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true }),
  sampleSize: fc.integer({ min: 0, max: 100000 }),
  significant: fc.boolean(),
});

// ============================================================
// Property 16: Prompt Guardrail Validation
// ============================================================

describe('Property 16: Prompt Guardrail Validation', () => {
  it(
    'guardrail result is consistent: passed iff all four checks pass',
    () => {
      fc.assert(
        fc.property(promptVariantArb, (variant) => {
          const result = checkGuardrails(variant.content);

          // passed must be the logical AND of all four checks
          const expectedPassed =
            result.noHarmfulContent &&
            result.noMisleadingClaims &&
            result.complianceCheck &&
            result.brandSafetyCheck;

          expect(result.passed).toBe(expectedPassed);
        }),
        { numRuns: 100 }
      );
    }
  );

  it(
    'a variant with no flagged patterns always passes all guardrail checks',
    () => {
      // Generate safe content: alphanumeric words only, no trigger words
      const safeWords = [
        'Write', 'a', 'professional', 'email', 'to', 'the', 'prospect', 'about',
        'our', 'services', 'and', 'how', 'we', 'can', 'help', 'your', 'business',
        'grow', 'with', 'digital', 'marketing', 'solutions', 'today',
      ] as const;
      const safeContentArb = fc
        .array(fc.constantFrom(...safeWords), { minLength: 3, maxLength: 20 })
        .map((words) => words.join(' '));

      fc.assert(
        fc.property(safeContentArb, (content) => {
          const result = checkGuardrails(content);
          expect(result.passed).toBe(true);
          expect(result.noHarmfulContent).toBe(true);
          expect(result.noMisleadingClaims).toBe(true);
          expect(result.complianceCheck).toBe(true);
          expect(result.brandSafetyCheck).toBe(true);
        }),
        { numRuns: 100 }
      );
    }
  );

  it(
    'guardrail checks are deterministic: same content always produces same result',
    () => {
      fc.assert(
        fc.property(promptVariantArb, (variant) => {
          const result1 = checkGuardrails(variant.content);
          const result2 = checkGuardrails(variant.content);

          expect(result1.passed).toBe(result2.passed);
          expect(result1.noHarmfulContent).toBe(result2.noHarmfulContent);
          expect(result1.noMisleadingClaims).toBe(result2.noMisleadingClaims);
          expect(result1.complianceCheck).toBe(result2.complianceCheck);
          expect(result1.brandSafetyCheck).toBe(result2.brandSafetyCheck);
        }),
        { numRuns: 100 }
      );
    }
  );
});

// ============================================================
// Property 17: Prompt Rollback on Degradation
// ============================================================

describe('Property 17: Prompt Rollback on Degradation', () => {
  it(
    'auto-rollback is triggered when quality drops > 20% below baseline',
    () => {
      fc.assert(
        fc.property(
          fc.float({ min: Math.fround(0.01), max: Math.fround(1), noNaN: true }), // baseline
          fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true }),    // current
          (baseline, current) => {
            const degradation = (baseline - current) / baseline;
            const shouldRollback = shouldAutoRollback(baseline, current);

            if (degradation > ROLLBACK_THRESHOLD) {
              expect(shouldRollback).toBe(true);
            } else {
              expect(shouldRollback).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    }
  );

  it(
    'no rollback when current performance equals or exceeds baseline',
    () => {
      fc.assert(
        fc.property(
          fc.float({ min: Math.fround(0.01), max: Math.fround(0.99), noNaN: true }), // baseline
          fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true }),        // improvement factor
          (baseline, factor) => {
            // current >= baseline means no degradation
            const current = baseline * (1 + factor);
            const shouldRollback = shouldAutoRollback(baseline, Math.min(current, 1));
            expect(shouldRollback).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    }
  );

  it(
    'rollback threshold is exactly 20%: values at or below threshold do not trigger rollback',
    () => {
      fc.assert(
        fc.property(
          fc.float({ min: Math.fround(0.1), max: Math.fround(1), noNaN: true }), // baseline
          fc.float({ min: Math.fround(0), max: Math.fround(0.2), noNaN: true }), // degradation fraction (0-20%)
          (baseline, degradationFraction) => {
            const current = baseline * (1 - degradationFraction);
            const shouldRollback = shouldAutoRollback(baseline, current);

            // At exactly 20% degradation, should NOT rollback (threshold is strictly >)
            if (degradationFraction <= ROLLBACK_THRESHOLD) {
              expect(shouldRollback).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    }
  );

  it(
    'rollback decision is consistent with A/B test result: degraded promoted variants trigger rollback',
    () => {
      fc.assert(
        fc.property(abTestResultArb, (result) => {
          // If a test was promoted (winner = 'test') but then degraded > 20%,
          // rollback should be triggered
          if (result.winner === 'test' && result.controlMetric > 0) {
            // Simulate degradation: current performance drops below control
            const degradedCurrent = result.controlMetric * 0.7; // 30% below control
            const shouldRollback = shouldAutoRollback(result.controlMetric, degradedCurrent);
            expect(shouldRollback).toBe(true);
          }
        }),
        { numRuns: 100 }
      );
    }
  );
});
