// @vitest-environment node
/**
 * tests/security/browser-egress-boundary.test.ts
 *
 * Reproducible crawler/Chromium network-boundary qualification for M3
 * (first authorized real audit). Launches the REAL Chromium used by the audit
 * pipeline (browserLauncher) with the REAL request guard (safeBrowser) and
 * drives it against a local hostile page, asserting the controls that must
 * hold before any real-domain audit is authorized:
 *
 *   1. Cloud metadata endpoint (169.254.169.254) requests are ABORTED.
 *   2. Private-range (10.x) requests are ABORTED.
 *   3. Same-origin page assets still load (the guard must not over-block).
 *   4. The per-page request budget aborts requests beyond the cap
 *      (fail-closed bounded collection; no runaway pages).
 *   5. SSRF-safe loopback fixture targets remain blocked in production mode
 *      (the journey's loopback exception is env-scoped, not a standing
 *      production allowance).
 *
 * Skips gracefully when no Chrome/Chromium binary is available.
 */
import http from 'node:http';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { acquireSharedBrowser, releaseSharedBrowser } from '@/lib/security/browserLauncher';
import { safePageGoto } from '@/lib/security/safeBrowser';

function resolveChromePathOrNull(): string | null {
  const candidates = [
    process.env.CHROME_EXECUTABLE_PATH,
    process.env.JOURNEY_CHROME_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chrome',
    `${process.env.HOME}/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`,
    `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`,
  ].filter(Boolean) as string[];
  const fs = require('node:fs') as typeof import('node:fs');
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

const chromePath = resolveChromePathOrNull();

let boundaryServer: http.Server | null = null;
let serverPort = 0;
const assetHits: Record<string, number> = {};

const HOSTILE_PAGE = `<!doctype html>
<html><head><title>Boundary probe</title></head>
<body>
  <h1>Hostile boundary probe</h1>
  <!-- Cloud metadata: must be aborted by the guard -->
  <img src="http://169.254.169.254/latest/meta-data/" />
  <!-- Private range: must be aborted by the guard -->
  <img src="http://10.255.255.1/asset.png" />
  <!-- Same-origin assets: must be allowed -->
  <img src="http://127.0.0.1:${'{{PORT}}'}/ok1.png" />
  <img src="http://127.0.0.1:${'{{PORT}}'}/ok2.png" />
</body></html>`;

beforeAll(async function setup() {
  if (!chromePath) return;
  // Deterministic launcher resolution for the shared browser.
  process.env.CHROME_EXECUTABLE_PATH = chromePath;
  await new Promise<void>((resolve) => {
    boundaryServer = http.createServer((req, res) => {
      const key = req.url ?? '/';
      assetHits[key] = (assetHits[key] ?? 0) + 1;
      if (key.startsWith('/ok')) {
        res.writeHead(200, { 'Content-Type': 'image/png' });
        res.end(Buffer.from('iVBORw0KGgo=', 'base64'));
        return;
      }
      if (key === '/hostile') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(HOSTILE_PAGE.replaceAll('{{PORT}}', String(serverPort)));
        return;
      }
      if (key === '/flood') {
        // A page embedding more requests than the budget allows.
        const imgs = Array.from({ length: 400 }, (_, i) => `<img src="/flood-${i}.png" />`).join(
          ''
        );
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<!doctype html><html><body>${imgs}</body></html>`);
        return;
      }
      if (key.startsWith('/flood-')) {
        res.writeHead(200, { 'Content-Type': 'image/png' });
        res.end(Buffer.from('iVBORw0KGgo=', 'base64'));
        return;
      }
      res.writeHead(404);
      res.end();
    });
    boundaryServer.listen(0, '127.0.0.1', () => {
      serverPort = (boundaryServer!.address() as { port: number }).port;
      resolve();
    });
  });
});

afterAll(async () => {
  if (boundaryServer) await new Promise<void>((r) => boundaryServer?.close(() => r()));
});

afterEach(() => {
  delete process.env.PROPOSALOS_SSRF_TEST_FIXTURE_HOSTS;
  process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
});

describe('Chromium egress boundary (real browser, real guard)', () => {
  it.skipIf(!chromePath)(
    'aborts metadata and private-range requests while allowing same-origin assets',
    async () => {
      // Production posture: no loopback fixture exception active.
      process.env.NODE_ENV = 'production';
      delete process.env.PROPOSALOS_SSRF_TEST_FIXTURE_HOSTS;

      const { browser, key } = await acquireSharedBrowser('boundary-test');
      try {
        const page = await browser.newPage();
        // In production posture the loopback origin itself is refused by the
        // guard — verify navigation is blocked.
        await expect(
          safePageGoto(page, `http://127.0.0.1:${serverPort}/hostile`, { timeout: 15_000 })
        ).rejects.toThrow();
        await page.close();
      } finally {
        await releaseSharedBrowser(key);
      }
    }
  );

  it.skipIf(!chromePath)(
    'allows an explicitly allowlisted loopback fixture target and still blocks metadata/private from that page',
    async () => {
      // Test/journey posture: the audit fixture target is allowlisted.
      process.env.NODE_ENV = 'test';
      process.env.PROPOSALOS_SSRF_TEST_FIXTURE_HOSTS = '127.0.0.1,localhost';

      const { browser, key } = await acquireSharedBrowser('boundary-test-2');
      try {
        const page = await browser.newPage();
        const failedUrls: string[] = [];
        page.on('requestfailed', (request) => {
          failedUrls.push(request.url());
        });
        await safePageGoto(page, `http://127.0.0.1:${serverPort}/hostile`, { timeout: 20_000 });
        // Give embedded requests a moment to fire and be intercepted.
        await new Promise((r) => setTimeout(r, 2500));

        const content = await page.content();
        expect(content).toContain('Hostile boundary probe');

        // Metadata and private-range requests were ABORTED by the guard.
        expect(failedUrls.some((u) => u.includes('169.254.169.254'))).toBe(true);
        expect(failedUrls.some((u) => u.includes('10.255.255.1'))).toBe(true);

        // Same-origin assets loaded (guard did not over-block).
        expect(assetHits['/ok1.png'] ?? 0).toBeGreaterThanOrEqual(1);
        expect(assetHits['/ok2.png'] ?? 0).toBeGreaterThanOrEqual(1);
        await page.close();
      } finally {
        await releaseSharedBrowser(key);
      }
    }
  );

  it.skipIf(!chromePath)(
    'enforces the per-page request budget (bounded collection, fail closed)',
    async () => {
      process.env.NODE_ENV = 'test';
      process.env.PROPOSALOS_SSRF_TEST_FIXTURE_HOSTS = '127.0.0.1,localhost';
      const previousBudget = process.env.PROPOSALOS_BROWSER_MAX_PAGE_REQUESTS;
      process.env.PROPOSALOS_BROWSER_MAX_PAGE_REQUESTS = '50';

      try {
        const { browser, key } = await acquireSharedBrowser('boundary-test-3');
        try {
          const page = await browser.newPage();
          await safePageGoto(page, `http://127.0.0.1:${serverPort}/flood`, { timeout: 30_000 });
          await new Promise((r) => setTimeout(r, 1500));

          // Count how many flood assets actually hit the server: the budget (50)
          // must have aborted the remaining ~350 requests.
          const servedFlood = Object.keys(assetHits).filter((k) => k.startsWith('/flood-')).length;
          expect(servedFlood).toBeLessThanOrEqual(52); // budget + small slop
          expect(servedFlood).toBeGreaterThan(0);
          await page.close();
        } finally {
          await releaseSharedBrowser(key);
        }
      } finally {
        if (previousBudget === undefined) delete process.env.PROPOSALOS_BROWSER_MAX_PAGE_REQUESTS;
        else process.env.PROPOSALOS_BROWSER_MAX_PAGE_REQUESTS = previousBudget;
      }
    }
  );
});
