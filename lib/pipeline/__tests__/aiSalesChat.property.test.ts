/**
 * Property-based tests for AI Sales Chat
 * 
 * Tests Property 37: AI Sales Chat escalates on low confidence
 * 
 * Feature: autonomous-proposal-engine
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { shouldEscalate } from '../aiSalesChat';

describe('AI Sales Chat - Property Tests', () => {
  /**
   * Property 37: AI Sales Chat escalates on low confidence
   * 
   * For any AI Sales Chat response with a confidence score below the configured
   * threshold (default: 70%), the chat must escalate to the Human Review Queue
   * and must not present a definitive answer to the prospect.
   * 
   * **Validates: Requirements 15.5**
   */
  it('Property 37: escalates when confidence is below threshold', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: 1 }), // confidence score
        fc.float({ min: 0, max: 1 }), // threshold
        (confidence, threshold) => {
          const result = shouldEscalate(confidence, { threshold });

          // Property: escalate if and only if confidence < threshold
          if (confidence < threshold) {
            expect(result).toBe(true);
          } else {
            expect(result).toBe(false);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 37: always escalates when confidence is 0', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(0.01), max: Math.fround(1) }), // threshold > 0
        (threshold) => {
          const result = shouldEscalate(0, { threshold });
          expect(result).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 37: never escalates when confidence is 1 and threshold < 1', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(0), max: Math.fround(0.99) }), // threshold < 1
        (threshold) => {
          const result = shouldEscalate(1, { threshold });
          expect(result).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 37: escalation is deterministic for same inputs', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: 1 }),
        fc.float({ min: 0, max: 1 }),
        (confidence, threshold) => {
          const result1 = shouldEscalate(confidence, { threshold });
          const result2 = shouldEscalate(confidence, { threshold });
          expect(result1).toBe(result2);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 37: default threshold of 0.7 escalates low confidence', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(0), max: Math.fround(0.69), noNaN: true }), // confidence < 0.7
        (confidence) => {
          const result = shouldEscalate(confidence, { threshold: 0.7 });
          expect(result).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 37: default threshold of 0.7 does not escalate high confidence', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(0.71), max: Math.fround(1), noNaN: true }), // confidence > 0.7 (avoid boundary)
        (confidence) => {
          const result = shouldEscalate(confidence, { threshold: 0.7 });
          expect(result).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});
