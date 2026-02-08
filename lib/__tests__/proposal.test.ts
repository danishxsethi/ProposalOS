import { describe, it, expect, vi } from 'vitest';
import { runProposalPipeline } from '../proposal';
import { CostTracker } from '../costs/costTracker';

// Mock dependencies
vi.mock('../llm/proposal', () => ({
    generateExecutiveSummary: vi.fn().mockResolvedValue('Exec Summary'),
    generateAssumptions: vi.fn().mockResolvedValue(['Assumption 1']),
    generateNextSteps: vi.fn().mockResolvedValue(['Step 1'])
}));

describe('Proposal Pipeline', () => {
    it('should generate proposal structure', async () => {
        const mockClusters: any[] = [
            {
                title: 'SEO Issues',
                findings: [{ id: '1', title: 'Slow LCP', impactScore: 90 }],
                painPoint: 'Low Visibility',
                whyItMatters: 'Lost Revenue',
                urgency: 'HIGH'
            }
        ];
        const mockFindings: any[] = [
            { id: '1', title: 'Slow LCP', impactScore: 90, type: 'PAINKILLER' }
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
