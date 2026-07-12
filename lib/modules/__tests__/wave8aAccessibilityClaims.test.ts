import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  analyze: vi.fn(),
  acquireSharedBrowser: vi.fn(),
  releaseSharedBrowser: vi.fn(),
  safePageGoto: vi.fn(),
}));

vi.mock('@axe-core/puppeteer', () => ({
  AxePuppeteer: class {
    withTags() {
      return this;
    }
    analyze() {
      return mocks.analyze();
    }
  },
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/security/browserLauncher', () => ({
  acquireSharedBrowser: mocks.acquireSharedBrowser,
  releaseSharedBrowser: mocks.releaseSharedBrowser,
}));
vi.mock('@/lib/security/safeBrowser', () => ({ safePageGoto: mocks.safePageGoto }));

import { runAccessibilityModule } from '../accessibility';

function installPage() {
  const page = {
    evaluate: vi.fn(async () => ({
      altText: { total: 1, withAlt: 1 },
      headings: { h1Count: 1, levels: [1, 2], structure: ['H1: Acme'] },
      forms: { totalInputs: 0, labeled: 0 },
      links: { genericCount: 0, examples: [] },
      hasLang: true,
      hasViewport: true,
      hasFocusStyles: true,
    })),
    close: vi.fn(async () => undefined),
  };
  mocks.acquireSharedBrowser.mockResolvedValue({
    key: 'audit-1',
    browser: { newPage: vi.fn(async () => page) },
  });
  return page;
}

describe('accessibility automation claim boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installPage();
    mocks.safePageGoto.mockResolvedValue(null);
  });

  it('reports automated violations with rule, selector, sanitized element, impact, and timestamp', async () => {
    mocks.analyze.mockResolvedValue({
      violations: [
        {
          id: 'image-alt',
          impact: 'critical',
          description: 'Images must have alternate text',
          help: 'Add alternate text',
          helpUrl: 'https://deque.test/rules/image-alt',
          nodes: [{ html: '<img src=x onerror=alert(1)>', target: ['img.hero'] }],
        },
      ],
    });

    const result = await runAccessibilityModule({ url: 'https://acme.test/', auditId: 'audit-1' });
    const data = result.data.data;

    expect(data.scanStatus).toBe('violations_detected');
    expect(data.manualReviewRequired).toBe(true);
    expect(data.topIssues[0]).toMatchObject({
      ruleId: 'image-alt',
      selector: 'img.hero',
      impact: 'critical',
    });
    expect(data.topIssues[0].element).not.toContain('<');
    expect(data.topIssues[0].scanTimestamp).toMatch(/T/);
  });

  it('says no automated violations detected without claiming WCAG conformance', async () => {
    mocks.analyze.mockResolvedValue({ violations: [] });
    const result = await runAccessibilityModule({ url: 'https://acme.test/', auditId: 'audit-1' });
    const text = JSON.stringify(result);

    expect(result.data.data.scanStatus).toBe('no_automated_violations');
    expect(text).toMatch(/manual review/i);
    expect(text).not.toMatch(/wcagLevel|wcag (?:a|aa|aaa) compliant|certified/i);
  });

  it('returns an unavailable scan rather than a clean result when axe fails', async () => {
    mocks.analyze.mockRejectedValue(new Error('axe failed'));
    const result = await runAccessibilityModule({ url: 'https://acme.test/', auditId: 'audit-1' });

    expect(result.status).toBe('failed');
    expect(result.data.data.scanStatus).toBe('unavailable');
    expect(result.data.data.totalIssues).toBeNull();
  });
});
