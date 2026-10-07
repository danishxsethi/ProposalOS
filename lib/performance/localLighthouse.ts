import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

import { withModuleCache } from '@/lib/cache/moduleCache';
import { withProviderResilience } from '@/lib/resilience/withProviderResilience';
import { guardBrowserPage } from '@/lib/security/safeBrowser';
import { validateForBrowserNavigation } from '@/lib/security/safeFetch';

export type LighthouseStrategy = 'mobile' | 'desktop';

export interface LocalLighthouseAudit {
  score?: number | null;
  numericValue?: number;
  numericUnit?: string;
  displayValue?: string;
  title?: string;
  description?: string;
  details?: unknown;
}

export interface LocalLighthouseReport {
  finalDisplayedUrl?: string;
  finalUrl?: string;
  categories?: Record<string, { score?: number | null }>;
  audits?: Record<string, LocalLighthouseAudit>;
}

const CATEGORIES = ['performance', 'seo', 'accessibility', 'best-practices'];
const CACHE_TTL_SECONDS = 6 * 60 * 60;

// Lighthouse and browser-backed accessibility work share the same small Fargate
// task. Serialize Lighthouse runs so concurrent audits cannot launch several
// memory-heavy Chromium processes in one task.
let lighthouseQueue: Promise<void> = Promise.resolve();

function runSerialized<T>(work: () => Promise<T>): Promise<T> {
  const run = lighthouseQueue.then(work, work);
  lighthouseQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function normalizeUrl(url: string): string {
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error('Lighthouse only supports public HTTP(S) URLs without embedded credentials');
  }
  return parsed.toString();
}

async function runLighthouse(
  url: string,
  strategy: LighthouseStrategy,
  signal?: AbortSignal
): Promise<LocalLighthouseReport> {
  if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
  await validateForBrowserNavigation(url);

  const executablePath =
    process.env.CHROME_EXECUTABLE_PATH?.trim() || (await chromium.executablePath());
  const browserArgs = process.env.CHROME_EXECUTABLE_PATH
    ? [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-zygote',
        '--disable-background-networking',
        '--disable-extensions',
      ]
    : [
        ...chromium.args,
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-background-networking',
      ];
  const browser = await puppeteer.launch({
    executablePath,
    args: browserArgs,
    headless: true,
    pipe: false,
    defaultViewport:
      strategy === 'mobile'
        ? { width: 390, height: 844, deviceScaleFactor: 1 }
        : { width: 1365, height: 900, deviceScaleFactor: 1 },
  });

  const guardTarget = async (target: import('puppeteer-core').Target) => {
    if (target.type() !== 'page') return;
    const page = await target.page();
    if (page) await guardBrowserPage(page);
  };
  const onTargetCreated = (target: import('puppeteer-core').Target) => {
    void guardTarget(target).catch(() => undefined);
  };
  browser.on('targetcreated', onTargetCreated);
  await Promise.all(browser.targets().map(guardTarget));

  const onAbort = () => void browser.close().catch(() => undefined);
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    const port = Number(new URL(browser.wsEndpoint()).port);
    const lighthouse = (await import('lighthouse')).default;
    const result = await lighthouse(url, {
      port,
      logLevel: 'error',
      onlyCategories: CATEGORIES,
      formFactor: strategy,
      throttlingMethod: 'simulate',
      maxWaitForFcp: 15_000,
      maxWaitForLoad: 25_000,
    });
    if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
    if (!result?.lhr) throw new Error('Lighthouse returned no report');
    return result.lhr as LocalLighthouseReport;
  } finally {
    signal?.removeEventListener('abort', onAbort);
    browser.off('targetcreated', onTargetCreated);
    await browser.close().catch(() => undefined);
  }
}

export async function getLocalLighthouseReport(
  inputUrl: string,
  strategy: LighthouseStrategy = 'mobile',
  signal?: AbortSignal
): Promise<LocalLighthouseReport> {
  const url = normalizeUrl(inputUrl);
  return withModuleCache(
    { module: 'local_lighthouse', version: 1, input: { url, strategy, categories: CATEGORIES } },
    { ttlSeconds: CACHE_TTL_SECONDS },
    () =>
      runSerialized(() =>
        withProviderResilience<LocalLighthouseReport>(
          {
            provider: 'lighthouse',
            operation: `local_lighthouse:${strategy}`,
            signal,
            degrade: false,
            policy: { timeoutMs: 60_000, maxAttempts: 1 },
          },
          ({ signal: providerSignal }) => runLighthouse(url, strategy, providerSignal)
        )
      )
  );
}
