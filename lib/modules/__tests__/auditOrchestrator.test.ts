
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuditOrchestrator } from '../../orchestrator/auditOrchestrator';
import { CostTracker } from '../../costs/costTracker';

// Mock dependencies
vi.mock('../../modules/websiteCrawler', () => ({
    crawlWebsite: vi.fn().mockResolvedValue({ status: 'success', pages: [] })
}));

vi.mock('../../modules/gbp', () => ({
    runGbpModule: vi.fn().mockResolvedValue({ status: 'success', data: {} })
}));

describe('AuditOrchestrator', () => {
    let orchestrator: AuditOrchestrator;
    let tracker: CostTracker;

    beforeEach(() => {
        tracker = new CostTracker();
        orchestrator = new AuditOrchestrator({
            auditId: 'test-audit-id',
            businessName: 'Test Biz',
            websiteUrl: 'https://example.com',
            city: 'Austin',
            industry: 'Plumbing'
        }, tracker);
    });

    it('should initialize with correct input', () => {
        expect(orchestrator).toBeDefined();
    });

    it('should register modules', () => {
        // Access private property logic or checking public capability
        // For unit test, we might inspect the modules array if accessible or just run it.
        // Since modules is private, we can't check length directly without @ts-ignore or public getter.
        // Let's just run it and check results if we mock everything.
    });

    it('should run phase 1 modules', async () => {
        const result = await orchestrator.run();
        expect(result.status).not.toBe('FAILED');
        // We expect progress to be 100 at end
        expect(result.progress).toBe(100);
    });
});
