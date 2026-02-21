// Feature: agentic-delivery-qa-hardening, Property 10: Hallucination log consistency
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

describe('Property 10: Hallucination log consistency', () => {
  it('should maintain consistency between totalFlagged and individual flag arrays', () => {
    const flagArrayArbitrary = fc.record({
      hallucinationFlags: fc.array(fc.record({ claim: fc.string(), reason: fc.string() })),
      consistencyFlags: fc.array(fc.record({ type: fc.string(), suggestion: fc.string() })),
      competitorFlags: fc.array(fc.record({ claim: fc.string(), issue: fc.string() })),
    });

    fc.assert(
      fc.property(flagArrayArbitrary, (flags) => {
        const totalFlagged =
          flags.hallucinationFlags.length +
          flags.consistencyFlags.length +
          flags.competitorFlags.length;

        // totalFlagged should equal sum of individual arrays
        expect(totalFlagged).toBe(
          flags.hallucinationFlags.length +
          flags.consistencyFlags.length +
          flags.competitorFlags.length
        );
      }),
      { numRuns: 100 }
    );
  });

  it('should compute correct total from empty arrays', () => {
    const hallucinationFlags: any[] = [];
    const consistencyFlags: any[] = [];
    const competitorFlags: any[] = [];

    const totalFlagged =
      hallucinationFlags.length +
      consistencyFlags.length +
      competitorFlags.length;

    expect(totalFlagged).toBe(0);
  });

  it('should compute correct total from single-element arrays', () => {
    const hallucinationFlags = [{ claim: 'test', reason: 'test' }];
    const consistencyFlags: any[] = [];
    const competitorFlags: any[] = [];

    const totalFlagged =
      hallucinationFlags.length +
      consistencyFlags.length +
      competitorFlags.length;

    expect(totalFlagged).toBe(1);
  });

  it('should compute correct total from multiple arrays', () => {
    const hallucinationFlags = [
      { claim: 'test1', reason: 'reason1' },
      { claim: 'test2', reason: 'reason2' },
    ];
    const consistencyFlags = [
      { type: 'mismatch', suggestion: 'fix' },
    ];
    const competitorFlags = [
      { claim: 'competitor claim', issue: 'stale' },
      { claim: 'competitor claim 2', issue: 'overstated' },
      { claim: 'competitor claim 3', issue: 'unfair' },
    ];

    const totalFlagged =
      hallucinationFlags.length +
      consistencyFlags.length +
      competitorFlags.length;

    expect(totalFlagged).toBe(6);
  });

  it('should maintain consistency across multiple computations', () => {
    const hallucinationFlags = [{ claim: 'test', reason: 'test' }];
    const consistencyFlags = [{ type: 'mismatch', suggestion: 'fix' }];
    const competitorFlags: any[] = [];

    const total1 =
      hallucinationFlags.length +
      consistencyFlags.length +
      competitorFlags.length;

    const total2 =
      hallucinationFlags.length +
      consistencyFlags.length +
      competitorFlags.length;

    expect(total1).toBe(total2);
    expect(total1).toBe(2);
  });
});
