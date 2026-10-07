import { describe, expect, it, vi } from 'vitest';

import { CostTracker } from '../costs/costTracker';
import { createEvidence } from '../modules/types';
import { runProposalPipeline } from '../proposal';

describe('Proposal Pipeline', () => {
  it('should generate proposal structure', async () => {
    const mockClusters: any[] = [
      {
        id: '1',
        title: 'SEO Issues',
        findings: [{ id: '1', title: 'Slow LCP', impactScore: 9 }],
        findingIds: ['1'],
        severity: 'critical',
        rootCause: 'Slow LCP',
      },
    ];
    const mockFindings: any[] = [
      {
        id: '1',
        auditId: 'audit-1',
        tenantId: 'tenant-1',
        module: 'website',
        category: 'Performance',
        title: 'Slow LCP',
        description: 'Measured LCP was 4200 ms.',
        impactScore: 9,
        confidenceScore: 9,
        type: 'PAINKILLER',
        evidence: [
          createEvidence({
            pointer: 'https://acme.test/',
            source: 'pagespeed_v5',
            value: 4200,
            label: 'LCP',
          }),
        ],
        metrics: { lcpMs: 4200 },
        effortEstimate: 'MEDIUM',
        recommendedFix: ['Improve page delivery'],
      },
    ];

    const tracker = new CostTracker();
    const result = await runProposalPipeline(
      'Test Biz',
      'Dental',
      mockClusters,
      mockFindings,
      tracker
    );

    expect(result.executiveSummary).toContain('Slow LCP');
    expect(result.pricing).toBeDefined();
    expect(result.tiers.essentials).toBeDefined();
    expect(result.grounding).toBeDefined();
  });
});
