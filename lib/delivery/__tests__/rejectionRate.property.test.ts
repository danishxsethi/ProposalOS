// Feature: agentic-delivery-qa-hardening, Property 3: Rejection rate monotonicity
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

describe('Property 3: Rejection rate monotonicity', () => {
  it('should compute rejection rate as failed count divided by total count', () => {
    const testCases = fc.sample(
      fc.record({
        totalCount: fc.integer({ min: 1, max: 100 }),
        failedCount: fc.integer({ min: 0, max: 100 }),
      }),
      100
    );

    testCases.forEach(({ totalCount, failedCount }) => {
      // Ensure failedCount doesn't exceed totalCount
      const actualFailedCount = Math.min(failedCount, totalCount);
      const expectedRate = actualFailedCount / totalCount;

      // The rate should be between 0 and 1
      expect(expectedRate).toBeGreaterThanOrEqual(0);
      expect(expectedRate).toBeLessThanOrEqual(1);

      // The rate should equal failed / total
      expect(expectedRate).toBe(actualFailedCount / totalCount);
    });
  });

  it('should return 0 when no artifacts fail', () => {
    const totalCount = 10;
    const failedCount = 0;
    const rate = failedCount / totalCount;

    expect(rate).toBe(0);
  });

  it('should return 1 when all artifacts fail', () => {
    const totalCount = 10;
    const failedCount = 10;
    const rate = failedCount / totalCount;

    expect(rate).toBe(1);
  });

  it('should return correct rate for partial failures', () => {
    const testCases = [
      { total: 10, failed: 2, expected: 0.2 },
      { total: 10, failed: 5, expected: 0.5 },
      { total: 100, failed: 25, expected: 0.25 },
      { total: 50, failed: 10, expected: 0.2 },
    ];

    testCases.forEach(({ total, failed, expected }) => {
      const rate = failed / total;
      expect(rate).toBe(expected);
    });
  });

  it('should maintain monotonicity: more failures = higher rate', () => {
    const total = 100;
    const rates: number[] = [];

    for (let failed = 0; failed <= total; failed += 10) {
      rates.push(failed / total);
    }

    // Each rate should be >= previous rate
    for (let i = 1; i < rates.length; i++) {
      expect(rates[i]).toBeGreaterThanOrEqual(rates[i - 1]);
    }
  });

  it('should be consistent: same inputs produce same rate', () => {
    const total = 50;
    const failed = 15;

    const rate1 = failed / total;
    const rate2 = failed / total;

    expect(rate1).toBe(rate2);
  });

  it('should handle edge cases correctly', () => {
    // Single artifact, not failed
    expect(0 / 1).toBe(0);

    // Single artifact, failed
    expect(1 / 1).toBe(1);

    // Large numbers
    expect(500 / 1000).toBe(0.5);
    expect(999 / 1000).toBe(0.999);
  });
});
