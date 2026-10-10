// @vitest-environment node
/**
 * lib/security/__tests__/dependencyExceptions.test.ts
 *
 * Qualification for the prepared (NOT auto-approved) dependency-exception
 * gate: only GHSA-vfj7-8cjw-p6xm (braces, dev-only) can ever be excused, and
 * only while owner-approved, unexpired, not production-reachable, and with
 * every other HIGH/CRITICAL advisory still failing.
 */

import { describe, expect, it } from 'vitest';

import {
  evaluateAuditGate,
  PREPARED_EXCEPTIONS,
  type AuditReportLike,
} from '@/lib/security/dependencyExceptions';

const BRACES_VIA = [{ url: 'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm', severity: 'high' }];

function reportWith(
  vulnerabilities: Record<string, any>,
  counts?: { high?: number }
): AuditReportLike {
  return {
    metadata: { vulnerabilities: { high: counts?.high ?? 0, critical: 0 } },
    vulnerabilities,
  };
}

/** The real current shape: braces (high) with transitive chains below it. */
const fullTreeWithBraces = reportWith(
  {
    braces: { severity: 'high', via: BRACES_VIA, isDirect: false },
    micromatch: { severity: 'high', via: ['braces'], isDirect: false },
    'fast-glob': { severity: 'high', via: ['micromatch'], isDirect: false },
    chokidar: { severity: 'high', via: ['micromatch'], isDirect: false },
  },
  { high: 7 }
);

const cleanProduction = reportWith({});
const withinExpiry = new Date('2026-10-10T00:00:00Z');
const pastExpiry = new Date('2026-11-10T00:00:00Z');

describe('prepared dependency exception gate', () => {
  it('declares exactly one narrow exception with the required metadata', () => {
    expect(PREPARED_EXCEPTIONS).toHaveLength(1);
    const exception = PREPARED_EXCEPTIONS[0]!;
    expect(exception.advisoryId).toBe('GHSA-vfj7-8cjw-p6xm');
    expect(exception.packageName).toBe('braces');
    expect(exception.scope).toBe('dev');
    expect(exception.expiry).toBe('2026-11-09');
    expect(exception.transitivePaths.length).toBeGreaterThan(0);
    expect(exception.compensatingControls.length).toBeGreaterThan(0);
  });

  it('fails on braces when the exception is not owner-approved (current CI state)', () => {
    const evaluation = evaluateAuditGate({
      productionReport: cleanProduction,
      fullReport: fullTreeWithBraces,
      exceptionsApproved: false,
      now: withinExpiry,
    });
    expect(evaluation.pass).toBe(false);
    expect(evaluation.exceptionsActive).toBe(false);
    expect(evaluation.failures.some((f) => f.includes('braces'))).toBe(true);
  });

  it('passes with braces excused when owner-approved, unexpired, and dev-only', () => {
    const evaluation = evaluateAuditGate({
      productionReport: cleanProduction,
      fullReport: fullTreeWithBraces,
      exceptionsApproved: true,
      now: withinExpiry,
    });
    expect(evaluation.pass).toBe(true);
    expect(
      evaluation.excusedAdvisories.some((a) => a.toUpperCase() === 'GHSA-VFJ7-8CJW-P6XM')
    ).toBe(true);
    expect(evaluation.exceptionsActive).toBe(true);
  });

  it('still fails on any UNRELATED high advisory even with the exception active', () => {
    const fullTree = reportWith(
      {
        braces: { severity: 'high', via: BRACES_VIA },
        micromatch: { severity: 'high', via: ['braces'] },
        'some-evil-dep': {
          severity: 'high',
          via: [{ url: 'https://github.com/advisories/GHSA-xxxx-yyyy-zzzz', severity: 'high' }],
        },
      },
      { high: 8 }
    );
    const evaluation = evaluateAuditGate({
      productionReport: cleanProduction,
      fullReport: fullTree,
      exceptionsApproved: true,
      now: withinExpiry,
    });
    expect(evaluation.pass).toBe(false);
    expect(evaluation.failures.some((f) => f.includes('some-evil-dep'))).toBe(true);
  });

  it('fails automatically if braces becomes reachable in the production tree', () => {
    const productionWithBraces = reportWith(
      { braces: { severity: 'high', via: BRACES_VIA } },
      { high: 1 }
    );
    const evaluation = evaluateAuditGate({
      productionReport: productionWithBraces,
      fullReport: fullTreeWithBraces,
      exceptionsApproved: true,
      now: withinExpiry,
    });
    expect(evaluation.pass).toBe(false);
    expect(evaluation.failures.some((f) => f.includes('reachable in the production'))).toBe(true);
    expect(
      evaluation.failures.some((f) => f.includes('Production dependency audit has HIGH'))
    ).toBe(true);
  });

  it('fails once the exception expires (2026-11-09)', () => {
    const evaluation = evaluateAuditGate({
      productionReport: cleanProduction,
      fullReport: fullTreeWithBraces,
      exceptionsApproved: true,
      now: pastExpiry,
    });
    expect(evaluation.pass).toBe(false);
    expect(evaluation.expiredExceptions.some((e) => e.includes('GHSA-vfj7-8cjw-p6xm'))).toBe(true);
    expect(evaluation.exceptionsActive).toBe(false);
    expect(evaluation.failures.some((f) => f.includes('braces'))).toBe(true);
  });

  it('never excuses CRITICAL advisories', () => {
    const fullTree = reportWith(
      {
        braces: { severity: 'high', via: BRACES_VIA },
        'critical-dep': {
          severity: 'critical',
          via: [{ url: 'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm', severity: 'critical' }],
        },
      },
      { high: 1 }
    );
    const evaluation = evaluateAuditGate({
      productionReport: cleanProduction,
      fullReport: fullTree,
      exceptionsApproved: true,
      now: withinExpiry,
    });
    expect(evaluation.pass).toBe(false);
    expect(evaluation.failures.some((f) => f.includes('CRITICAL'))).toBe(true);
  });

  it('fails on production HIGH regardless of the exception (production gate is absolute)', () => {
    const evaluation = evaluateAuditGate({
      productionReport: reportWith(
        {
          'unrelated-prod-dep': {
            severity: 'high',
            via: [{ url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc' }],
          },
        },
        { high: 1 }
      ),
      fullReport: fullTreeWithBraces,
      exceptionsApproved: true,
      now: withinExpiry,
    });
    expect(evaluation.pass).toBe(false);
    expect(
      evaluation.failures.some((f) => f.includes('Production dependency audit has HIGH'))
    ).toBe(true);
  });
});
