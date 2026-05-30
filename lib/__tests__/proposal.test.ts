import { describe, expect, it, vi } from 'vitest';

import { CostTracker } from '../costs/costTracker';
import { runProposalPipeline } from '../proposal';

// Mock dependencies
vi.mock('../proposal/executiveSummary', () => ({
  generateExecutiveSummary: vi.fn().mockResolvedValue('Exec Summary'),
}));

vi.mock('../proposal/validation', () => ({
  generateAssumptions: vi.fn().mockReturnValue(['Assumption 1']),
  generateDisclaimers: vi.fn().mockReturnValue(['Disclaimer 1']),
  generateNextSteps: vi.fn().mockReturnValue(['Step 1']),
  validateCitations: vi.fn().mockReturnValue({ valid: true, errors: [] }),
}));

describe('Proposal Pipeline', () => {
  it('should generate proposal structure', async () => {
    const mockClusters: any[] = [
      {
        id: '1',
        title: 'SEO Issues',
        findings: [{ id: '1', title: 'Slow LCP', impactScore: 90 }],
        findingIds: ['1'],
        painPoint: 'Low Visibility',
        whyItMatters: 'Lost Revenue',
        urgency: 'HIGH',
        severity: 'high',
        narrative: 'Severe SEO issues',
      },
    ];
    const mockFindings: any[] = [
      { id: '1', title: 'Slow LCP', impactScore: 90, type: 'PAINKILLER' },
    ];

    const tracker = new CostTracker();
    const result = await runProposalPipeline(
      'Test Biz',
      'Dental',
      mockClusters,
      mockFindings,
      tracker
    );

    expect(result.executiveSummary).toBe('Exec Summary');
    expect(result.pricing).toBeDefined();
    expect(result.tiers.essentials).toBeDefined();
  });
});
