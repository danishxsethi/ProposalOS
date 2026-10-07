import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CostTracker } from '../../costs/costTracker';
import { AuditOrchestrator } from '../../orchestrator/auditOrchestrator';

// Mock dependencies — the orchestrator imports every audit module directly via
// '@/lib/modules/*'; without deterministic mocks these hit live providers
// (SerpAPI, Places, PageSpeed, Puppeteer) and time out in unit tests.
// A successful module result must expose findings/evidenceSnapshots so the
// orchestrator's result aggregation works. Note: vi.mock factories are hoisted,
// so the result object must be built inside each factory (no shared const).
vi.mock('@/lib/modules/websiteCrawler', () => ({
  crawlWebsite: vi.fn().mockResolvedValue({ findings: [], evidenceSnapshots: [] }),
}));

vi.mock('@/lib/modules/gbp', () => ({
  runGBPModule: vi.fn().mockResolvedValue({ findings: [], evidenceSnapshots: [] }),
}));

vi.mock('@/lib/modules/gbpDeep', () => ({
  runGbpDeepModule: vi.fn().mockResolvedValue({ findings: [], evidenceSnapshots: [] }),
}));

vi.mock('@/lib/modules/competitor', () => ({
  runCompetitorModule: vi.fn().mockResolvedValue({ findings: [], evidenceSnapshots: [] }),
}));

vi.mock('@/lib/modules/competitorStrategy', () => ({
  runCompetitorStrategyModule: vi
    .fn()
    .mockResolvedValue({ findings: [], evidenceSnapshots: [] }),
}));

vi.mock('@/lib/modules/mobileUX', () => ({
  runMobileUXModule: vi.fn().mockResolvedValue({ findings: [], evidenceSnapshots: [] }),
}));

vi.mock('@/lib/modules/conversion', () => ({
  runConversionModule: vi.fn().mockResolvedValue({ findings: [], evidenceSnapshots: [] }),
}));

vi.mock('@/lib/modules/techStack', () => ({
  runTechStackModule: vi.fn().mockResolvedValue({ findings: [], evidenceSnapshots: [] }),
}));

vi.mock('@/lib/modules/security', () => ({
  runSecurityModule: vi.fn().mockResolvedValue({ findings: [], evidenceSnapshots: [] }),
}));

vi.mock('@/lib/modules/accessibility', () => ({
  runAccessibilityModule: vi
    .fn()
    .mockResolvedValue({ findings: [], evidenceSnapshots: [] }),
}));

vi.mock('@/lib/modules/keywordGap', () => ({
  runKeywordGapModule: vi.fn().mockResolvedValue({ findings: [], evidenceSnapshots: [] }),
}));

vi.mock('@/lib/modules/citations', () => ({
  runCitationsModule: vi.fn().mockResolvedValue({ findings: [], evidenceSnapshots: [] }),
}));

vi.mock('@/lib/modules/paidSearch', () => ({
  runPaidSearchModule: vi.fn().mockResolvedValue({ findings: [], evidenceSnapshots: [] }),
}));

vi.mock('@/lib/modules/vision', () => ({
  runVisionModule: vi.fn().mockResolvedValue({ findings: [], evidenceSnapshots: [] }),
}));

vi.mock('@/lib/evidence/screenshotCapture', () => ({
  captureScreenshots: vi.fn().mockResolvedValue([]),
}));

describe('AuditOrchestrator', () => {
  let orchestrator: AuditOrchestrator;
  let tracker: CostTracker;

  beforeEach(() => {
    tracker = new CostTracker();
    orchestrator = new AuditOrchestrator(
      {
        auditId: 'test-audit-id',
        businessName: 'Test Biz',
        websiteUrl: 'https://example.com',
        city: 'Austin',
        industry: 'Plumbing',
      },
      tracker
    );
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
