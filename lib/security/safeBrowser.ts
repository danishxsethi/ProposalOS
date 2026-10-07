import { linkAbortSignals } from '@/lib/security/abort';
import { validateForBrowserNavigation } from '@/lib/security/safeFetch';

import type { Page } from 'puppeteer-core';

const guardedPages = new WeakSet<Page>();

export async function guardBrowserPage(page: Page): Promise<void> {
  if (guardedPages.has(page)) return;
  guardedPages.add(page);

  // Functions passed to page.evaluate() are serialized with Function.toString().
  // When the server bundle was produced by esbuild/tsx (keepNames) inner named
  // functions are wrapped in a module-scope `__name(fn, "name")` helper that does
  // not exist inside the browser → ReferenceError "__name is not defined" and the
  // whole module (conversion, screenshots, a11y) fails. Install an identity shim
  // on every document so serialized code runs identically under SWC and esbuild.
  await page.evaluateOnNewDocument(() => {
    const g = globalThis as unknown as { __name?: <T>(fn: T, name?: string) => T };
    if (typeof g.__name !== 'function') g.__name = (fn) => fn;
  });

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
