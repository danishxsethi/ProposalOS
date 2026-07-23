/**
 * Unit tests for Revenue Streams
 *
 * Covers:
 *  - calculateOutcomeShare: correct percentage, auditable line items (Req 19.1)
 *  - generateBenchmarkReport: anonymized output, no PII/tenant identifiers (Req 19.2)
 *  - Fintech referral tracking: conversion events with correct attribution (Req 19.3)
 *
 * Requirements: 19.1, 19.2, 19.6
 */

import { describe, it, expect, beforeEach } from 'vitest';

import {
  trackOutcomeRevenue,
  calculateOutcomeShare,
  generateOutcomeInvoice,
  _clearStore as clearOutcomeStore,
} from '../billing/outcomePricing';

import {
  generateBenchmarkReport,
  addAnonymizedAuditRecord,
  _clearStore as clearDataStore,
} from '../data/dataLicensing';

import {
  trackReferral,
  recordConversion,
  getReferralStats,
  _clearStore as clearFintechStore,
} from '../partners/fintech';

// ─── Outcome-Based Pricing ────────────────────────────────────────────────────

describe('calculateOutcomeShare', () => {
  beforeEach(() => clearOutcomeStore());

  // Use a period that always covers "now" since trackOutcomeRevenue stamps events with new Date()
  function nowPeriod() {
    return {
      start: new Date(Date.now() - 60_000),
      end: new Date(Date.now() + 60_000),
    };
  }

  it('applies the default 10% share percentage', () => {
    trackOutcomeRevenue('client-1', 100_00); // $100.00
    const share = calculateOutcomeShare('client-1', nowPeriod());
    expect(share.sharePercent).toBe(10);
    expect(share.shareAmount).toBe(10_00); // $10.00
    expect(share.totalRevenue).toBe(100_00);
  });

  it('applies a custom share percentage', () => {
    trackOutcomeRevenue('client-2', 200_00); // $200.00
    const share = calculateOutcomeShare('client-2', nowPeriod(), { sharePercent: 15 });
    expect(share.sharePercent).toBe(15);
    expect(share.shareAmount).toBe(30_00); // $30.00
  });

  it('sums multiple revenue events in the period', () => {
    trackOutcomeRevenue('client-3', 50_00);
    trackOutcomeRevenue('client-3', 75_00);
    trackOutcomeRevenue('client-3', 25_00);
    const share = calculateOutcomeShare('client-3', nowPeriod());
    expect(share.totalRevenue).toBe(150_00);
    expect(share.shareAmount).toBe(15_00);
    expect(share.eventCount).toBe(3);
  });

  it('returns zero share when no events exist in the period', () => {
    // Use a past period that has no events
    const pastPeriod = { start: new Date('2020-01-01'), end: new Date('2020-01-31') };
    const share = calculateOutcomeShare('client-no-events', pastPeriod);
    expect(share.totalRevenue).toBe(0);
    expect(share.shareAmount).toBe(0);
    expect(share.eventCount).toBe(0);
  });

  it('excludes events outside the billing period', () => {
    trackOutcomeRevenue('client-4', 500_00);
    // Past period should not include the event recorded now
    const pastPeriod = { start: new Date('2020-01-01'), end: new Date('2020-12-31') };
    const sharePast = calculateOutcomeShare('client-4', pastPeriod);
    expect(sharePast.eventCount).toBe(0);
    // Current period should include it
    const shareNow = calculateOutcomeShare('client-4', nowPeriod());
    expect(shareNow.eventCount).toBe(1);
    expect(shareNow.totalRevenue).toBe(500_00);
  });

  it('returns the correct clientId in the result', () => {
    trackOutcomeRevenue('client-5', 1000_00);
    const share = calculateOutcomeShare('client-5', nowPeriod());
    expect(share.clientId).toBe('client-5');
  });

  it('rounds share amount to the nearest cent', () => {
    // 333 cents * 10% = 33.3 → rounds to 33
    trackOutcomeRevenue('client-6', 333);
    const share = calculateOutcomeShare('client-6', nowPeriod());
    expect(share.shareAmount).toBe(33);
  });
});

// ─── Outcome Invoice (auditable line items) ───────────────────────────────────

describe('generateOutcomeInvoice', () => {
  beforeEach(() => clearOutcomeStore());

  it('produces one line item per revenue event', () => {
    trackOutcomeRevenue('inv-client', 100_00, 'rec-1');
    trackOutcomeRevenue('inv-client', 200_00, 'rec-2');
    const invoice = generateOutcomeInvoice('inv-client', {
      start: new Date(Date.now() - 60_000),
      end: new Date(Date.now() + 60_000),
    });
    expect(invoice.lineItems).toHaveLength(2);
  });

  it('each line item carries the recommendation ID for attribution', () => {
    trackOutcomeRevenue('inv-client-2', 50_00, 'rec-abc');
    const invoice = generateOutcomeInvoice('inv-client-2', {
      start: new Date(Date.now() - 60_000),
      end: new Date(Date.now() + 60_000),
    });
    expect(invoice.lineItems[0].recommendationId).toBe('rec-abc');
  });

  it('each line item shows individual share amount', () => {
    trackOutcomeRevenue('inv-client-3', 100_00);
    const invoice = generateOutcomeInvoice(
      'inv-client-3',
      { start: new Date(Date.now() - 60_000), end: new Date(Date.now() + 60_000) },
      { sharePercent: 20 },
    );
    expect(invoice.lineItems[0].shareAmount).toBe(20_00);
  });

  it('totalShareAmount equals sum of line item share amounts', () => {
    trackOutcomeRevenue('inv-client-4', 100_00);
    trackOutcomeRevenue('inv-client-4', 300_00);
    const invoice = generateOutcomeInvoice('inv-client-4', {
      start: new Date(Date.now() - 60_000),
      end: new Date(Date.now() + 60_000),
    });
    const summedShare = invoice.lineItems.reduce((s, li) => s + li.shareAmount, 0);
    expect(invoice.totalShareAmount).toBe(summedShare);
  });

  it('invoice status defaults to draft', () => {
    const invoice = generateOutcomeInvoice('inv-client-5', {
      start: new Date(Date.now() - 60_000),
      end: new Date(Date.now() + 60_000),
    });
    expect(invoice.status).toBe('draft');
  });

  it('invoice has a unique ID', () => {
    const a = generateOutcomeInvoice('inv-client-6', {
      start: new Date(Date.now() - 60_000),
      end: new Date(Date.now() + 60_000),
    });
    const b = generateOutcomeInvoice('inv-client-6', {
      start: new Date(Date.now() - 60_000),
      end: new Date(Date.now() + 60_000),
    });
    expect(a.id).not.toBe(b.id);
  });
});

// ─── Benchmark Report (anonymized, no PII) ────────────────────────────────────

describe('generateBenchmarkReport', () => {
  beforeEach(() => clearDataStore());

  const dateRange = {
    start: new Date('2024-01-01T00:00:00Z'),
    end: new Date('2024-12-31T23:59:59Z'),
  };

  function addRecord(vertical: string, outcome: 'won' | 'lost' | 'ghosted' = 'won') {
    addAnonymizedAuditRecord({
      vertical,
      recordedAt: new Date('2024-06-15T12:00:00Z'),
      scoresByCategory: { seo: 70, speed: 80, reputation: 60 },
      findingTypes: ['missing-meta', 'slow-lcp'],
      outcome,
    });
  }

  it('returns the correct vertical in the report', () => {
    addRecord('restaurant');
    const report = generateBenchmarkReport('restaurant', dateRange);
    expect(report.vertical).toBe('restaurant');
  });

  it('calculates win rate correctly', () => {
    addRecord('dental', 'won');
    addRecord('dental', 'won');
    addRecord('dental', 'lost');
    const report = generateBenchmarkReport('dental', dateRange);
    // 2 won out of 3 total
    expect(report.winRate).toBeCloseTo(2 / 3);
  });

  it('returns 0 win rate when no records exist', () => {
    const report = generateBenchmarkReport('plumbing', dateRange);
    expect(report.winRate).toBe(0);
    expect(report.sampleSize).toBe(0);
  });

  it('averages scores by category across records', () => {
    addAnonymizedAuditRecord({
      vertical: 'hvac',
      recordedAt: new Date('2024-06-01T00:00:00Z'),
      scoresByCategory: { seo: 60, speed: 80 },
      findingTypes: [],
      outcome: 'won',
    });
    addAnonymizedAuditRecord({
      vertical: 'hvac',
      recordedAt: new Date('2024-06-02T00:00:00Z'),
      scoresByCategory: { seo: 80, speed: 60 },
      findingTypes: [],
      outcome: 'lost',
    });
    const report = generateBenchmarkReport('hvac', dateRange);
    expect(report.averageScoresByCategory.seo).toBeCloseTo(70);
    expect(report.averageScoresByCategory.speed).toBeCloseTo(70);
  });

  it('counts finding type frequencies', () => {
    addAnonymizedAuditRecord({
      vertical: 'law',
      recordedAt: new Date('2024-03-01T00:00:00Z'),
      scoresByCategory: {},
      findingTypes: ['missing-meta', 'slow-lcp'],
      outcome: 'won',
    });
    addAnonymizedAuditRecord({
      vertical: 'law',
      recordedAt: new Date('2024-03-02T00:00:00Z'),
      scoresByCategory: {},
      findingTypes: ['missing-meta'],
      outcome: 'lost',
    });
    const report = generateBenchmarkReport('law', dateRange);
    expect(report.commonFindingsFrequency['missing-meta']).toBe(2);
    expect(report.commonFindingsFrequency['slow-lcp']).toBe(1);
  });

  it('report contains no tenant identifiers or PII fields', () => {
    addRecord('retail');
    const report = generateBenchmarkReport('retail', dateRange);
    const reportStr = JSON.stringify(report);
    // Ensure none of the PII/tenant fields are present
    expect(reportStr).not.toMatch(/tenantId/);
    expect(reportStr).not.toMatch(/clientId/);
    expect(reportStr).not.toMatch(/businessName/);
    expect(reportStr).not.toMatch(/contactEmail/);
    expect(reportStr).not.toMatch(/phone/);
    expect(reportStr).not.toMatch(/address/);
  });

  it('report only includes records within the date range', () => {
    addAnonymizedAuditRecord({
      vertical: 'gym',
      recordedAt: new Date('2023-12-31T23:59:59Z'), // before range
      scoresByCategory: { seo: 50 },
      findingTypes: ['old-finding'],
      outcome: 'won',
    });
    addAnonymizedAuditRecord({
      vertical: 'gym',
      recordedAt: new Date('2024-06-01T00:00:00Z'), // within range
      scoresByCategory: { seo: 90 },
      findingTypes: ['new-finding'],
      outcome: 'won',
    });
    const report = generateBenchmarkReport('gym', dateRange);
    expect(report.sampleSize).toBe(1);
    expect(report.commonFindingsFrequency['old-finding']).toBeUndefined();
    expect(report.commonFindingsFrequency['new-finding']).toBe(1);
  });

  it('throws when vertical is empty', () => {
    expect(() => generateBenchmarkReport('', dateRange)).toThrow('vertical is required');
  });

  it('throws when dateRange.start is after dateRange.end', () => {
    expect(() =>
      generateBenchmarkReport('restaurant', {
        start: new Date('2024-12-31'),
        end: new Date('2024-01-01'),
      }),
    ).toThrow();
  });
});

// ─── Fintech Referral Tracking ────────────────────────────────────────────────

describe('trackReferral', () => {
  beforeEach(() => clearFintechStore());

  it('creates a referral with pending status', () => {
    const ref = trackReferral('client-a', 'stripe_capital', 'REF-001');
    expect(ref.status).toBe('pending');
    expect(ref.clientId).toBe('client-a');
    expect(ref.partner).toBe('stripe_capital');
    expect(ref.referralCode).toBe('REF-001');
  });

  it('assigns a unique ID to each referral', () => {
    const r1 = trackReferral('client-b', 'clearco', 'REF-A');
    const r2 = trackReferral('client-b', 'clearco', 'REF-B');
    expect(r1.id).not.toBe(r2.id);
  });

  it('throws when clientId is missing', () => {
    expect(() => trackReferral('', 'kabbage', 'REF-X')).toThrow('clientId is required');
  });

  it('throws when referralCode is missing', () => {
    expect(() => trackReferral('client-c', 'fundbox', '')).toThrow('referralCode is required');
  });
});

describe('recordConversion', () => {
  beforeEach(() => clearFintechStore());

  it('marks a referral as converted with the loan amount', () => {
    const ref = trackReferral('client-d', 'stripe_capital', 'REF-002');
    const converted = recordConversion(ref.id, 50_000_00); // $50,000
    expect(converted.status).toBe('converted');
    expect(converted.loanAmount).toBe(50_000_00);
    expect(converted.convertedAt).toBeInstanceOf(Date);
  });

  it('preserves original referral fields after conversion', () => {
    const ref = trackReferral('client-e', 'clearco', 'REF-003');
    const converted = recordConversion(ref.id, 10_000_00);
    expect(converted.clientId).toBe('client-e');
    expect(converted.partner).toBe('clearco');
    expect(converted.referralCode).toBe('REF-003');
  });

  it('throws when referral ID does not exist', () => {
    expect(() => recordConversion('nonexistent-id', 1000_00)).toThrow('Referral not found');
  });

  it('throws when attempting to convert an already-converted referral', () => {
    const ref = trackReferral('client-f', 'kabbage', 'REF-004');
    recordConversion(ref.id, 5_000_00);
    expect(() => recordConversion(ref.id, 5_000_00)).toThrow('already converted');
  });

  it('throws when loanAmount is negative', () => {
    const ref = trackReferral('client-g', 'fundbox', 'REF-005');
    expect(() => recordConversion(ref.id, -100)).toThrow('loanAmount must be non-negative');
  });
});

describe('getReferralStats', () => {
  beforeEach(() => clearFintechStore());

  it('returns zero stats when no referrals exist for a partner', () => {
    const stats = getReferralStats('stripe_capital');
    expect(stats.totalReferrals).toBe(0);
    expect(stats.conversions).toBe(0);
    expect(stats.conversionRate).toBe(0);
    expect(stats.totalLoanVolume).toBe(0);
  });

  it('calculates conversion rate correctly', () => {
    const r1 = trackReferral('c1', 'clearco', 'R1');
    const r2 = trackReferral('c2', 'clearco', 'R2');
    const r3 = trackReferral('c3', 'clearco', 'R3');
    recordConversion(r1.id, 20_000_00);
    // r2 and r3 remain pending
    const stats = getReferralStats('clearco');
    expect(stats.totalReferrals).toBe(3);
    expect(stats.conversions).toBe(1);
    expect(stats.conversionRate).toBeCloseTo(1 / 3);
  });

  it('sums total loan volume across all conversions', () => {
    const r1 = trackReferral('c4', 'kabbage', 'R4');
    const r2 = trackReferral('c5', 'kabbage', 'R5');
    recordConversion(r1.id, 10_000_00);
    recordConversion(r2.id, 30_000_00);
    const stats = getReferralStats('kabbage');
    expect(stats.totalLoanVolume).toBe(40_000_00);
  });

  it('calculates average loan amount correctly', () => {
    const r1 = trackReferral('c6', 'fundbox', 'R6');
    const r2 = trackReferral('c7', 'fundbox', 'R7');
    recordConversion(r1.id, 10_000_00);
    recordConversion(r2.id, 20_000_00);
    const stats = getReferralStats('fundbox');
    expect(stats.averageLoanAmount).toBe(15_000_00);
  });

  it('isolates stats by partner — does not mix partners', () => {
    const r1 = trackReferral('c8', 'stripe_capital', 'R8');
    trackReferral('c9', 'clearco', 'R9');
    recordConversion(r1.id, 5_000_00);
    const stripeStats = getReferralStats('stripe_capital');
    const clearcoStats = getReferralStats('clearco');
    expect(stripeStats.totalReferrals).toBe(1);
    expect(stripeStats.conversions).toBe(1);
    expect(clearcoStats.totalReferrals).toBe(1);
    expect(clearcoStats.conversions).toBe(0);
  });

  it('filters stats by date range', () => {
    const r1 = trackReferral('c10', 'stripe_capital', 'R10');
    recordConversion(r1.id, 8_000_00);
    // Stats for a past date range should not include the referral created now
    const pastRange = {
      start: new Date('2020-01-01'),
      end: new Date('2020-12-31'),
    };
    const stats = getReferralStats('stripe_capital', pastRange);
    expect(stats.totalReferrals).toBe(0);
    expect(stats.conversions).toBe(0);
  });

  it('attribution: converted referral carries the correct referral code', () => {
    const ref = trackReferral('c11', 'clearco', 'ATTR-CODE-99');
    const converted = recordConversion(ref.id, 15_000_00);
    expect(converted.referralCode).toBe('ATTR-CODE-99');
    expect(converted.clientId).toBe('c11');
  });
});
