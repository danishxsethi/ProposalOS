import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/resilience/withProviderResilience', () => ({
  withProviderResilience: async (
    options: { signal?: AbortSignal },
    fn: (context: { signal: AbortSignal }) => Promise<unknown>
  ) => fn({ signal: options.signal || new AbortController().signal }),
}));
vi.mock('@/lib/security/safeBrowser', () => ({ safePageGoto: vi.fn() }));
const { getLocalLighthouseReport } = vi.hoisted(() => ({ getLocalLighthouseReport: vi.fn() }));
vi.mock('@/lib/performance/localLighthouse', () => ({ getLocalLighthouseReport }));
vi.mock('@sparticuz/chromium', () => ({
  default: { executablePath: vi.fn(async () => '/tmp/chromium') },
}));
vi.mock('puppeteer-core', () => ({
  default: { launch: vi.fn() },
}));

import puppeteer from 'puppeteer-core';

import { validateFinding } from '@/lib/audit/findingContract';
import { safePageGoto } from '@/lib/security/safeBrowser';

import { runMobileUXModule } from '../mobileUX';

class Tracker {
  calls: string[] = [];
  addApiCall(name: string) {
    this.calls.push(name);
  }
}

function installBrowserFixture(options: { unhealthy?: boolean } = {}) {
  const unhealthy = options.unhealthy ?? false;
  const page = {
    setViewport: vi.fn(async () => undefined),
    evaluateOnNewDocument: vi.fn(async () => undefined),
    evaluate: vi
      .fn()
      .mockResolvedValueOnce({
        hasViewportMeta: !unhealthy,
        hasHorizontalOverflow: unhealthy,
        hasSmallText: unhealthy,
        smallTextCount: unhealthy ? 8 : 0,
        imagesResponsive: true,
      })
      .mockResolvedValueOnce({
        violations: unhealthy
          ? Array.from({ length: 11 }, (_, index) => ({
              element: `button-${index}`,
              width: 20,
              height: 20,
              position: { x: index, y: index },
              issue: 'too-small',
            }))
          : [],
        totalClickableElements: 11,
      })
      .mockResolvedValueOnce({
        hasClickToCall: !unhealthy,
        hasMapDirections: !unhealthy,
        hasMobileMenu: true,
        hasStickyNav: true,
        hasBottomCTA: !unhealthy,
        hasPWASupport: true,
      })
      .mockResolvedValueOnce({
        domInteractive: 1200,
        largestContentfulPaint: 1800,
        cumulativeLayoutShift: 0.12,
        totalBlockingTime: 240,
      }),
    close: vi.fn(async () => undefined),
  };
  const browser = { newPage: vi.fn(async () => page), close: vi.fn(async () => undefined) };
  vi.mocked(puppeteer.launch).mockResolvedValue(browser as never);
  return { page, browser };
}

describe('mobileUX measured metrics implementation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(safePageGoto).mockResolvedValue(null as never);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses observed browser metrics and validated PageSpeed scores with valid evidence', async () => {
    installBrowserFixture({ unhealthy: true });
    vi.mocked(getLocalLighthouseReport).mockImplementation(async (_url, strategy) => ({
      categories: { performance: { score: strategy === 'mobile' ? 0.22 : 0.7 } },
    }));
    const tracker = new Tracker();

    const result = await runMobileUXModule(
      { url: 'https://acme.test', businessName: 'Acme' },
      tracker as never
    );

    expect(result.execution?.state).toBe('complete');
    expect(result.evidenceSnapshots[0].rawResponse).toMatchObject({
      cumulativeLayoutShift: 0.12,
      totalBlockingTime: 240,
      mobilePerformanceScore: 22,
      pageSpeedStatus: 'available',
    });
    expect(tracker.calls).toEqual(['LIGHTHOUSE', 'LIGHTHOUSE']);
    expect(result.findings.length).toBeGreaterThan(0);
    for (const finding of result.findings) {
      expect(validateFinding({ ...finding, module: 'mobileUX' }).success).toBe(true);
    }
  });

  it('returns PARTIAL when the local Lighthouse report has no performance score', async () => {
    installBrowserFixture();
    vi.mocked(getLocalLighthouseReport).mockResolvedValue({ categories: {} });
    const tracker = new Tracker();
    const result = await runMobileUXModule(
      { url: 'https://acme.test', businessName: 'Acme' },
      tracker as never
    );

    expect(result.execution?.state).toBe('partial');
    expect(result.evidenceSnapshots[0].rawResponse.mobilePerformanceScore).toBeNull();
    expect(result.evidenceSnapshots[0].rawResponse.pageSpeedStatus).toBe('unavailable');
    expect(tracker.calls).toEqual(['LIGHTHOUSE']);
  });

  it('treats a missing local performance score as unavailable rather than score zero', async () => {
    installBrowserFixture();
    vi.mocked(getLocalLighthouseReport).mockResolvedValue({ categories: {} });
    const result = await runMobileUXModule({
      url: 'https://acme.test',
      businessName: 'Acme',
    });

    expect(result.execution?.state).toBe('partial');
    expect(result.evidenceSnapshots[0].rawResponse.mobilePerformanceScore).toBeNull();
  });

  it('propagates caller abort instead of converting it to a customer finding', async () => {
    installBrowserFixture();
    const controller = new AbortController();
    controller.abort(new DOMException('cancelled', 'AbortError'));
    vi.mocked(safePageGoto).mockRejectedValue(controller.signal.reason);

    await expect(
      runMobileUXModule({
        url: 'https://acme.test',
        businessName: 'Acme',
        signal: controller.signal,
      })
    ).rejects.toThrow(/cancelled/);
  });
});
