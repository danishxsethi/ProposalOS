/**
 * Wave 7B — P2-43: accessibility, mobileUX, and conversion each launched their own
 * Puppeteer Browser process per audit. `acquireSharedBrowser`/`releaseSharedBrowser`
 * consolidate this into one launch per auditId, reference-counted so the process is
 * closed exactly once — when the last of the (up to three) consumers releases it —
 * never left running, never double-closed, and never shared as a mutable Page.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@sparticuz/chromium', () => ({
  default: { executablePath: vi.fn(async () => '/tmp/chromium') },
}));
vi.mock('puppeteer-core', () => ({
  default: { launch: vi.fn() },
}));

import puppeteer from 'puppeteer-core';

import {
  acquireSharedBrowser,
  releaseSharedBrowser,
  __getSharedBrowserKeysForTests,
  __resetSharedBrowsersForTests,
} from '../browserLauncher';

function makeBrowserStub() {
  return { close: vi.fn(async () => undefined), newPage: vi.fn(async () => ({})) };
}

describe('browserLauncher shared acquisition (P2-43)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetSharedBrowsersForTests();
    delete process.env.CHROME_EXECUTABLE_PATH;
  });

  it('launches exactly one Browser for three consumers sharing the same auditId', async () => {
    const browserStub = makeBrowserStub();
    vi.mocked(puppeteer.launch).mockResolvedValue(browserStub as never);

    const a = await acquireSharedBrowser('audit-1');
    const b = await acquireSharedBrowser('audit-1');
    const c = await acquireSharedBrowser('audit-1');

    expect(puppeteer.launch).toHaveBeenCalledTimes(1);
    expect(a.browser).toBe(b.browser);
    expect(b.browser).toBe(c.browser);
    expect(a.key).toBe(b.key);

    await releaseSharedBrowser(a.key);
    await releaseSharedBrowser(b.key);
    expect(browserStub.close).not.toHaveBeenCalled();
    await releaseSharedBrowser(c.key);
    expect(browserStub.close).toHaveBeenCalledTimes(1);
  });

  it('does not leak entries once every consumer has released', async () => {
    const browserStub = makeBrowserStub();
    vi.mocked(puppeteer.launch).mockResolvedValue(browserStub as never);

    const { key } = await acquireSharedBrowser('audit-2');
    await releaseSharedBrowser(key);

    expect(__getSharedBrowserKeysForTests()).toEqual([]);
  });

  it('isolates browsers between different audits', async () => {
    const browserA = makeBrowserStub();
    const browserB = makeBrowserStub();
    vi.mocked(puppeteer.launch).mockResolvedValueOnce(browserA as never);
    vi.mocked(puppeteer.launch).mockResolvedValueOnce(browserB as never);

    const a = await acquireSharedBrowser('audit-a');
    const b = await acquireSharedBrowser('audit-b');

    expect(a.browser).not.toBe(b.browser);
    expect(puppeteer.launch).toHaveBeenCalledTimes(2);

    await releaseSharedBrowser(a.key);
    await releaseSharedBrowser(b.key);
  });

  it('gives each caller without an auditId a private single-owner browser', async () => {
    const browserA = makeBrowserStub();
    const browserB = makeBrowserStub();
    vi.mocked(puppeteer.launch).mockResolvedValueOnce(browserA as never);
    vi.mocked(puppeteer.launch).mockResolvedValueOnce(browserB as never);

    const a = await acquireSharedBrowser();
    const b = await acquireSharedBrowser();

    expect(a.key).not.toBe(b.key);
    expect(puppeteer.launch).toHaveBeenCalledTimes(2);

    await releaseSharedBrowser(a.key);
    expect(browserA.close).toHaveBeenCalledTimes(1);
    expect(browserB.close).not.toHaveBeenCalled();
    await releaseSharedBrowser(b.key);
  });

  it('does not leave a stale entry behind when the launch itself fails', async () => {
    vi.mocked(puppeteer.launch).mockRejectedValueOnce(new Error('no chromium'));

    await expect(acquireSharedBrowser('audit-fail')).rejects.toThrow('no chromium');
    expect(__getSharedBrowserKeysForTests()).toEqual([]);

    // A subsequent acquire for the same key gets a fresh launch attempt, not the
    // cached rejection.
    const browserStub = makeBrowserStub();
    vi.mocked(puppeteer.launch).mockResolvedValueOnce(browserStub as never);
    const { key } = await acquireSharedBrowser('audit-fail');
    expect(puppeteer.launch).toHaveBeenCalledTimes(2);
    await releaseSharedBrowser(key);
  });

  it('releasing an unknown key is a no-op (never throws)', async () => {
    await expect(releaseSharedBrowser('never-acquired')).resolves.toBeUndefined();
  });
});
