/**
 * P1-27 (Wave 7) — `lib/modules/website.ts`'s internal crawl call and the canonical
 * `websiteCrawler` registry module both called `runWebsiteCrawlerModule` for the
 * same audit/URL, performing two full real crawls of the same site per audit. This
 * proves the single-flight coalescing fix: concurrent calls with the same
 * (auditId, url) share one real crawl.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/evidence/screenshotCapture', () => ({ captureScreenshots: vi.fn(async () => []) }));

const { crawlWebsiteMock } = vi.hoisted(() => ({ crawlWebsiteMock: vi.fn() }));
vi.mock('../websiteCrawler', () => ({ crawlWebsite: crawlWebsiteMock }));

import { runWebsiteCrawlerModule } from '../websiteCrawlerModule';

function fakeCrawlResult() {
  return {
    crawledPages: [{ url: 'https://acme.test', status: 200 }],
    totalPagesFound: 1,
    brokenLinks: [],
    orphanPages: [],
    pagesMissingTitles: [],
    pagesMissingDescriptions: [],
    avgLoadTimeMs: 100,
    avgWordCount: 200,
    schemaOrgCoverage: 0,
    duplicateTitles: new Map(),
    failureClassification: 'NONE' as const,
    homepageHtml: '<html></html>',
  };
}

describe('runWebsiteCrawlerModule single-flight coalescing (P1-27)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    crawlWebsiteMock.mockImplementation(async () => {
      // Simulate real crawl latency so two concurrent calls genuinely overlap.
      await new Promise((resolve) => setTimeout(resolve, 10));
      return fakeCrawlResult();
    });
  });

  it('performs exactly one real crawl when website.ts and the canonical adapter call concurrently for the same audit', async () => {
    const callA = runWebsiteCrawlerModule({
      url: 'https://acme.test',
      businessName: 'Acme',
      auditId: 'audit-1',
    });
    const callB = runWebsiteCrawlerModule({
      url: 'https://acme.test',
      businessName: 'Acme',
      auditId: 'audit-1',
    });

    const [resultA, resultB] = await Promise.all([callA, callB]);

    expect(crawlWebsiteMock).toHaveBeenCalledTimes(1);
    expect(resultA).toBe(resultB);
  });

  it('performs a separate crawl for a different audit even when concurrent (no cross-audit leakage)', async () => {
    const callA = runWebsiteCrawlerModule({
      url: 'https://acme.test',
      businessName: 'Acme',
      auditId: 'audit-1',
    });
    const callB = runWebsiteCrawlerModule({
      url: 'https://acme.test',
      businessName: 'Acme',
      auditId: 'audit-2',
    });

    await Promise.all([callA, callB]);

    expect(crawlWebsiteMock).toHaveBeenCalledTimes(2);
  });

  it('performs a fresh crawl on a later, non-concurrent call for the same audit/url (no stale permanent cache)', async () => {
    await runWebsiteCrawlerModule({
      url: 'https://acme.test',
      businessName: 'Acme',
      auditId: 'audit-1',
    });
    await runWebsiteCrawlerModule({
      url: 'https://acme.test',
      businessName: 'Acme',
      auditId: 'audit-1',
    });

    expect(crawlWebsiteMock).toHaveBeenCalledTimes(2);
  });
});
