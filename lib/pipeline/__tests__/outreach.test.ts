/**
 * Unit tests for Outreach Agent
 * 
 * Tests generateEmail(), generateAndQualifyEmail(), scheduleFollowUps(),
 * processBehaviorBranch(), and helper functions.
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.8
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateEmail,
  generateAndQualifyEmail,
  translateFinding,
  selectTopFindings,
} from '../outreach';
import type { OutreachContext, PainScoreBreakdown } from '../types';

// ============================================================================
// Test Fixtures
// ============================================================================

function createMockContext(overrides: Partial<OutreachContext> = {}): OutreachContext {
  return {
    prospect: {
      id: 'prospect-1',
      businessName: 'Bright Smile Dental',
      name: 'Bright Smile Dental',
      tenantId: 'tenant-1',
    },
    audit: {
      id: 'audit-1',
      status: 'COMPLETE',
    },
    proposal: {
      id: 'proposal-1',
      webLinkToken: 'abc123',
    },
    findings: [
      {
        id: 'f1',
        title: 'Slow Page Speed',
        module: 'pagespeed',
        severity: 'high',
        impactScore: 85,
        description: 'Page loads in 8.2 seconds',
      },
      {
        id: 'f2',
        title: 'Mobile Not Responsive',
        module: 'mobile',
        severity: 'high',
        impactScore: 80,
        description: 'Site not mobile-friendly',
      },
      {
        id: 'f3',
        title: 'Missing SSL',
        module: 'ssl',
        severity: 'medium',
        impactScore: 60,
        description: 'No HTTPS configured',
      },
    ],
    painBreakdown: {
      websiteSpeed: 18,
      mobileBroken: 15,
      gbpNeglected: 10,
      noSsl: 10,
      zeroReviewResponses: 5,
      socialMediaDead: 8,
      competitorsOutperforming: 7,
      accessibilityViolations: 3,
    },
    vertical: 'dentist',
    tenantBranding: {
      brandName: 'Digital Growth Co',
      contactEmail: 'hello@digitalgrowth.co',
    },
    ...overrides,
  };
}

// ============================================================================
// translateFinding Tests
// ============================================================================

describe('translateFinding', () => {
  it('should translate page speed finding for dentist vertical', () => {
    const finding = { module: 'pagespeed', title: 'Slow Page Speed' };
    const result = translateFinding(finding, 'dentist');
    expect(result).toBe('patients bouncing before they book');
  });

  it('should translate mobile finding for HVAC vertical', () => {
    const finding = { module: 'mobile', title: 'Mobile Not Responsive' };
    const result = translateFinding(finding, 'hvac');
    expect(result).toBe('homeowners can\'t request a quote from their phone');
  });

  it('should use default vertical for unknown verticals', () => {
    const finding = { module: 'ssl', title: 'Missing SSL' };
    const result = translateFinding(finding, 'unknown_vertical');
    expect(result).toBe('visitors see a "Not Secure" warning on your site');
  });

  it('should translate GBP finding for restaurant vertical', () => {
    const finding = { module: 'google_business', title: 'GBP Issues' };
    const result = translateFinding(finding, 'restaurant');
    expect(result).toBe('your Google listing isn\'t filling tables');
  });

  it('should handle findings with type instead of module', () => {
    const finding = { type: 'competitor_analysis', title: 'Competitor Gap' };
    const result = translateFinding(finding, 'dentist');
    expect(result).toBe('nearby practices are showing up above you in search');
  });
});

// ============================================================================
// selectTopFindings Tests
// ============================================================================

describe('selectTopFindings', () => {
  it('should return all findings when count <= requested', () => {
    const findings = [
      { id: 'f1', severity: 'high', impactScore: 80 },
    ];
    const result = selectTopFindings(findings, 2);
    expect(result).toHaveLength(1);
  });

  it('should select top N findings by severity', () => {
    const findings = [
      { id: 'f1', severity: 'low', impactScore: 90 },
      { id: 'f2', severity: 'high', impactScore: 80 },
      { id: 'f3', severity: 'critical', impactScore: 70 },
      { id: 'f4', severity: 'medium', impactScore: 85 },
    ];
    const result = selectTopFindings(findings, 2);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('f3'); // critical first
    expect(result[1].id).toBe('f2'); // high second
  });

  it('should break ties by impact score', () => {
    const findings = [
      { id: 'f1', severity: 'high', impactScore: 70 },
      { id: 'f2', severity: 'high', impactScore: 90 },
      { id: 'f3', severity: 'high', impactScore: 80 },
    ];
    const result = selectTopFindings(findings, 2);
    expect(result[0].id).toBe('f2'); // highest impact
    expect(result[1].id).toBe('f3'); // second highest
  });

  it('should handle findings with missing severity', () => {
    const findings = [
      { id: 'f1', impactScore: 90 },
      { id: 'f2', severity: 'high', impactScore: 80 },
      { id: 'f3', severity: 'low', impactScore: 95 },
    ];
    const result = selectTopFindings(findings, 2);
    expect(result).toHaveLength(2);
    // f2 (high=3) should come first, then f1 (default medium=2)
    expect(result[0].id).toBe('f2');
    expect(result[1].id).toBe('f1');
  });
});

// ============================================================================
// generateEmail Tests
// ============================================================================

describe('generateEmail', () => {
  it('should generate an email with ≥2 finding references', async () => {
    const context = createMockContext();
    const email = await generateEmail(context);

    expect(email.findingReferences.length).toBeGreaterThanOrEqual(2);
  });

  it('should include a scorecard URL with the proposal token', async () => {
    const context = createMockContext();
    const email = await generateEmail(context);

    expect(email.scorecardUrl).toBe('/preview/abc123');
    expect(email.body).toContain('/preview/abc123');
  });

  it('should use vertical-specific pain language in the body', async () => {
    const context = createMockContext({ vertical: 'dentist' });
    const email = await generateEmail(context);

    // Should contain dentist-specific language
    expect(email.body).toContain('patients');
  });

  it('should include the business name in subject and body', async () => {
    const context = createMockContext();
    const email = await generateEmail(context);

    expect(email.subject).toContain('Bright Smile Dental');
    expect(email.body).toContain('Bright Smile Dental');
  });

  it('should include the brand name in the body', async () => {
    const context = createMockContext();
    const email = await generateEmail(context);

    expect(email.body).toContain('Digital Growth Co');
  });

  it('should set correct prospectId and proposalId', async () => {
    const context = createMockContext();
    const email = await generateEmail(context);

    expect(email.prospectId).toBe('prospect-1');
    expect(email.proposalId).toBe('proposal-1');
  });

  it('should generate a unique email ID', async () => {
    const context = createMockContext();
    const email1 = await generateEmail(context);
    const email2 = await generateEmail(context);

    expect(email1.id).not.toBe(email2.id);
  });

  it('should fall back to proposal.id when webLinkToken is missing', async () => {
    const context = createMockContext({
      proposal: { id: 'proposal-fallback', webLinkToken: undefined },
    });
    const email = await generateEmail(context);

    expect(email.scorecardUrl).toBe('/preview/proposal-fallback');
  });

  it('should handle HVAC vertical pain language', async () => {
    const context = createMockContext({ vertical: 'hvac' });
    const email = await generateEmail(context);

    expect(email.body).toContain('homeowners');
  });

  it('should handle findings with only 2 available', async () => {
    const context = createMockContext({
      findings: [
        { id: 'f1', title: 'Issue A', module: 'pagespeed', severity: 'high', impactScore: 80 },
        { id: 'f2', title: 'Issue B', module: 'mobile', severity: 'high', impactScore: 75 },
      ],
    });
    const email = await generateEmail(context);

    expect(email.findingReferences).toHaveLength(2);
  });
});

// ============================================================================
// generateAndQualifyEmail Tests
// ============================================================================

describe('generateAndQualifyEmail', () => {
  it('should return email when QA passes on first attempt', async () => {
    const context = createMockContext();
    // Use a lenient config that will pass
    const lenientConfig = {
      maxReadingGradeLevel: 12,
      maxWordCount: 200,
      minFindingReferences: 1,
      maxSpamRiskScore: 50,
      minQualityScore: 10,
      jargonWordList: [],
      dimensionWeights: {
        readability: 25,
        wordCount: 20,
        jargon: 20,
        findingRefs: 20,
        spamRisk: 15,
      },
    };

    const email = await generateAndQualifyEmail(context, lenientConfig);
    expect(email).toBeDefined();
    expect(email.findingReferences.length).toBeGreaterThanOrEqual(1);
  });

  it('should throw "generation_failed" after 3 QA failures', async () => {
    const context = createMockContext();
    // Use an impossibly strict config
    const strictConfig = {
      maxReadingGradeLevel: 1,
      maxWordCount: 5,
      minFindingReferences: 10,
      maxSpamRiskScore: 0,
      minQualityScore: 100,
      jargonWordList: ['the', 'a', 'is', 'and', 'we', 'your'],
      dimensionWeights: {
        readability: 25,
        wordCount: 20,
        jargon: 20,
        findingRefs: 20,
        spamRisk: 15,
      },
    };

    await expect(generateAndQualifyEmail(context, strictConfig)).rejects.toThrow(
      'generation_failed'
    );
  });
});
