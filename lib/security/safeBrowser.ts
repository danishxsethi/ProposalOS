import { linkAbortSignals } from '@/lib/security/abort';
import { validateForBrowserNavigation } from '@/lib/security/safeFetch';

import type { Page } from 'puppeteer-core';

const guardedPages = new WeakSet<Page>();

export async function guardBrowserPage(page: Page): Promise<void> {
  if (guardedPages.has(page)) return;
  guardedPages.add(page);

  await page.setRequestInterception(true);
  page.on('request', async (request) => {
    try {
      const url = request.url();
      if (url !== 'about:blank') await validateForBrowserNavigation(url);
      await request.continue();
    } catch {
      await request.abort('blockedbyclient');
    }
  });
  page.on('popup', (popup) => {
    if (popup) void popup.close().catch(() => undefined);
  });
}

export async function safePageGoto(
  page: Page,
  url: string,
  options: Parameters<Page['goto']>[1] = {},
  signal?: AbortSignal
) {
  await validateForBrowserNavigation(url);
  await guardBrowserPage(page);

  const timeout = new AbortController();
  const timer = options.timeout
    ? setTimeout(
        () => timeout.abort(new DOMException('Navigation timed out', 'AbortError')),
        options.timeout
      )
    : null;
  const controller = linkAbortSignals([signal, timeout.signal]);
  const stopLoading = () => void page.evaluate(() => window.stop()).catch(() => undefined);
  controller.signal.addEventListener('abort', stopLoading, { once: true });

  try {
    const response = await page.goto(url, options);
    await validateForBrowserNavigation(page.url());
    return response;
  } finally {
    if (timer) clearTimeout(timer);
    controller.signal.removeEventListener('abort', stopLoading);
  }
}
