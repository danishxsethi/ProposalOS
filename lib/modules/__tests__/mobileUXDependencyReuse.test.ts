/**
 * P1-38 (Wave 7) — mobileUX made its own mobile-strategy PageSpeed call even
 * though the `website` module (a declared dependency) already performs a real
 * mobile-strategy PageSpeed call for the same URL. This proves the module reuses
 * a supplied score instead of making a second, duplicate billable call, while the
 * desktop comparison call (genuinely new data) is unaffected.
 */
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
vi.mock('@sparticuz/chromium', () => ({
  default: { executablePath: vi.fn(async () => '/tmp/chromium') },
}));
vi.mock('puppeteer-core', () => ({ default: { launch: vi.fn() } }));

import puppeteer from 'puppeteer-core';

import { safePageGoto } from '@/lib/security/safeBrowser';

import { runMobileUXModule } from '../mobileUX';

class Tracker {
  calls: string[] = [];
  addApiCall(name: string) {
    this.calls.push(name);
  }
}

function installBrowserFixture() {
  const page = {
    setViewport: vi.fn(async () => undefined),
    evaluateOnNewDocument: vi.fn(async () => undefined),
    evaluate: vi
      .fn()
      .mockResolvedValueOnce({
        hasViewportMeta: true,
        hasHorizontalOverflow: false,
        hasSmallText: false,
        smallTextCount: 0,
        imagesResponsive: true,
      })
      .mockResolvedValueOnce({ violations: [], totalClickableElements: 5 })
      .mockResolvedValueOnce({
        hasClickToCall: true,
        hasMapDirections: true,
        hasMobileMenu: true,
        hasStickyNav: true,
        hasBottomCTA: true,
        hasPWASupport: true,
      })
      .mockResolvedValueOnce({
        domInteractive: 900,
        largestContentfulPaint: 1200,
        cumulativeLayoutShift: 0.02,
        totalBlockingTime: 80,
      }),
    close: vi.fn(async () => undefined),
  };
  const browser = { newPage: vi.fn(async () => page), close: vi.fn(async () => undefined) };
  vi.mocked(puppeteer.launch).mockResolvedValue(browser as never);
  return { page, browser };
}

describe('mobileUX reuses website dependency mobile PageSpeed score (P1-38)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_PAGESPEED_API_KEY = 'test-key';
    vi.mocked(safePageGoto).mockResolvedValue(null as never);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GOOGLE_PAGESPEED_API_KEY;
  });

  it('does not call the mobile PageSpeed endpoint when a reused score is supplied, but still calls the desktop endpoint', async () => {
    installBrowserFixture();
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ lighthouseResult: { categories: { performance: { score: 0.61 } } } }),
          { status: 200 }
        )
    );
    vi.stubGlobal('fetch', fetchMock);
    const tracker = new Tracker();

    const result = await runMobileUXModule(
      { url: 'https://acme.test', businessName: 'Acme', reusedMobileScore: 42 },
      tracker as never
    );

    const raw = result.evidenceSnapshots[0].rawResponse as {
      mobilePerformanceScore: number | null;
      desktopPerformanceScore?: number;
    };
    expect(raw.mobilePerformanceScore).toBe(42);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('strategy=desktop');
    expect(tracker.calls).toEqual(['PAGESPEED']);
  });

  it('falls back to its own mobile PageSpeed fetch when no reused score is supplied', async () => {
    installBrowserFixture();
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ lighthouseResult: { categories: { performance: { score: 0.5 } } } }),
          { status: 200 }
        )
    );
    vi.stubGlobal('fetch', fetchMock);
    const tracker = new Tracker();

    const result = await runMobileUXModule(
      { url: 'https://acme.test', businessName: 'Acme' },
      tracker as never
    );

    const raw = result.evidenceSnapshots[0].rawResponse as {
      mobilePerformanceScore: number | null;
    };
    expect(raw.mobilePerformanceScore).toBe(50);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(tracker.calls).toEqual(['PAGESPEED', 'PAGESPEED']);
  });
});
