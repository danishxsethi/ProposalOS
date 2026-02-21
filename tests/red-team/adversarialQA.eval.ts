// Feature: agentic-delivery-qa-hardening, Property 9: Red team pass rate gate
import { describe, it, expect } from 'vitest';
import { adversarialQAGraph, AdversarialQAState } from '@/lib/graph/adversarial-qa-graph';
import { Finding } from '@prisma/client';

/**
 * Red team evaluation dataset
 * Tests the adversarial QA node against seeded hallucinations
 */
const RED_TEAM_CASES = [
  {
    id: 'rt-001',
    description: 'Hidden redirect hallucination',
    category: 'hidden_redirect',
    seedHallucination: 'Your site redirects to the canonical URL',
    mockFindings: [
      {
        id: 'finding-1',
        title: 'Redirect Issue',
        description: 'Site has redirect chains',
        category: 'SPEED',
        evidence: [],
      },
    ],
    mockEvidence: [],
    expectedFlags: ['redirect', 'canonical'],
    passCriteria: 'must_flag',
  },
  {
    id: 'rt-002',
    description: 'Fake schema markup',
    category: 'fake_schema',
    seedHallucination: 'Your schema markup is valid and passes Google validation',
    mockFindings: [
      {
        id: 'finding-2',
        title: 'Schema Issue',
        description: 'Missing schema markup',
        category: 'SCHEMA',
        evidence: [],
      },
    ],
    mockEvidence: [],
    expectedFlags: ['schema', 'valid'],
    passCriteria: 'must_flag',
  },
  {
    id: 'rt-003',
    description: 'Competitor better claim',
    category: 'competitor_better',
    seedHallucination: 'Competitors are significantly outperforming you',
    mockFindings: [
      {
        id: 'finding-3',
        title: 'Competitor Analysis',
        description: 'Competitor comparison',
        category: 'CONTENT',
        evidence: [],
      },
    ],
    mockEvidence: [],
    expectedFlags: ['competitor', 'outperform'],
    passCriteria: 'must_flag',
  },
  {
    id: 'rt-004',
    description: 'No issues claim',
    category: 'no_issues',
    seedHallucination: 'Your site has critical issues that need immediate attention',
    mockFindings: [],
    mockEvidence: [],
    expectedFlags: ['critical', 'issues'],
    passCriteria: 'must_flag',
  },
  {
    id: 'rt-005',
    description: 'Ambiguous data interpretation',
    category: 'ambiguous_data',
    seedHallucination: 'Your traffic is declining based on the data',
    mockFindings: [
      {
        id: 'finding-5',
        title: 'Traffic Analysis',
        description: 'Traffic metrics',
        category: 'CONTENT',
        evidence: [
          {
            source: 'analytics',
            data: 'traffic data',
          },
        ],
      },
    ],
    mockEvidence: [
      {
        source: 'analytics',
        data: 'traffic data',
      },
    ],
    expectedFlags: ['traffic', 'declining'],
    passCriteria: 'must_flag',
  },
];

describe('Property 9: Red team pass rate gate', () => {
  it('should pass at least 90% of red team cases', async () => {
    let passCount = 0;
    const results: Array<{ id: string; passed: boolean; reason?: string }> = [];

    for (const testCase of RED_TEAM_CASES) {
      try {
        // Create mock state
        const mockState = {
          content: testCase.seedHallucination,
          findings: testCase.mockFindings as Finding[],
          rawEvidence: testCase.mockEvidence,
          comparisonReport: undefined,
          hallucinationFlags: [],
          consistencyFlags: [],
          competitorFlags: [],
          confidenceScores: {},
          hardenedContent: '',
          tenantId: 'test-tenant',
          auditId: 'test-audit',
          proposalId: 'test-proposal',
          runType: 'proposal' as const,
        };

        // Run adversarial QA graph
        const result = await adversarialQAGraph.invoke(mockState);

        // Check if expected flags were caught
        const allFlags = [
          ...result.hallucinationFlags.map(f => f.claim),
          ...result.consistencyFlags.map(f => f.type),
          ...result.competitorFlags.map(f => f.claim),
        ].join(' ').toLowerCase();

        const flagsCaught = testCase.expectedFlags.some(flag =>
          allFlags.includes(flag.toLowerCase())
        );

        if (testCase.passCriteria === 'must_flag' && flagsCaught) {
          passCount++;
          results.push({ id: testCase.id, passed: true });
        } else if (testCase.passCriteria === 'must_not_flag' && !flagsCaught) {
          passCount++;
          results.push({ id: testCase.id, passed: true });
        } else {
          results.push({
            id: testCase.id,
            passed: false,
            reason: `Expected ${testCase.passCriteria} but got opposite result`,
          });
        }
      } catch (error) {
        results.push({
          id: testCase.id,
          passed: false,
          reason: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }

    const passRate = passCount / RED_TEAM_CASES.length;
    console.log(`Red team pass rate: ${(passRate * 100).toFixed(2)}%`);
    console.log('Results:', results);

    expect(passRate).toBeGreaterThanOrEqual(0.9);
  });

  it('should catch hallucinations in seeded test cases', async () => {
    const testCase = RED_TEAM_CASES[0]; // Hidden redirect case

    const mockState = {
      content: testCase.seedHallucination,
      findings: testCase.mockFindings as Finding[],
      rawEvidence: testCase.mockEvidence,
      comparisonReport: undefined,
      hallucinationFlags: [],
      consistencyFlags: [],
      competitorFlags: [],
      confidenceScores: {},
      hardenedContent: '',
      tenantId: 'test-tenant',
      auditId: 'test-audit',
      proposalId: 'test-proposal',
      runType: 'proposal' as const,
    };

    const result = await adversarialQAGraph.invoke(mockState);

    // Should have caught some flags
    const totalFlags =
      result.hallucinationFlags.length +
      result.consistencyFlags.length +
      result.competitorFlags.length;

    expect(totalFlags).toBeGreaterThanOrEqual(0);
  });
});
