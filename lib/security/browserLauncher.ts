/**
 * P2-43: shared Puppeteer Browser acquisition, consolidated out of the three
 * near-identical `launchBrowser()` copies that used to live in accessibility.ts,
 * mobileUX.ts, and conversion.ts. Those three modules each launched their own
 * Chromium process per audit even though they run in the same audit phase against
 * the same tenant/audit boundary — three processes where one would do.
 *
 * Callers still get an isolated `Page` via `browser.newPage()` — this module only
 * shares the `Browser` process, never a mutable `Page`, so per-module viewport,
 * navigation, and evaluation state stay fully isolated.
 */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';

import chromium from '@sparticuz/chromium';
import puppeteer, { Browser } from 'puppeteer-core';

import { logger } from '@/lib/logger';

async function resolveExecutablePath(): Promise<string> {
  const localPaths = [
    process.env.CHROME_EXECUTABLE_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
  ].filter(Boolean) as string[];

  for (const p of localPaths) {
    if (p && fs.existsSync(p)) return p;
  }

  try {
    const remote = await chromium.executablePath();
    if (remote) return remote;
  } catch {
    // Ignore — fall through to the error below.
  }

  throw new Error('Chromium not found. Install Chrome or set CHROME_EXECUTABLE_PATH.');
}

async function launchBrowser(): Promise<Browser> {
  const executablePath = await resolveExecutablePath();
  return puppeteer.launch({
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
    ],
    defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 },
    executablePath,
    headless: true,
  });
}

interface SharedBrowserEntry {
  browserPromise: Promise<Browser>;
  refCount: number;
}

const sharedBrowsers = new Map<string, SharedBrowserEntry>();

/**
 * Acquire a Browser shared across every browser-backed module invoked for the same
 * `auditId`. Every caller MUST release exactly once (typically in a `finally`
 * block) via {@link releaseSharedBrowser} — the underlying process is closed only
 * when the last holder for that auditId releases it, and a launch failure never
 * leaves a stale entry behind for the next caller.
 *
 * When `auditId` is omitted (e.g. a module invoked directly outside the audit
 * runner), a unique key is generated so the caller gets a private, single-owner
 * browser with identical acquire/release semantics — no behavior change for
 * existing direct callers/tests.
 */
export async function acquireSharedBrowser(auditId?: string): Promise<{
  browser: Browser;
  key: string;
}> {
  const key = auditId || `solo:${randomUUID()}`;
  let entry = sharedBrowsers.get(key);
  if (!entry) {
    entry = { browserPromise: launchBrowser(), refCount: 0 };
    sharedBrowsers.set(key, entry);
  }
  entry.refCount++;

  try {
    const browser = await entry.browserPromise;
    return { browser, key };
  } catch (error) {
    // Launch failed before any Page was created — drop the entry so the next
    // caller (for this key) gets a fresh launch attempt instead of a cached
    // rejected promise, and release our own reservation on the failed entry.
    const stillTracked = sharedBrowsers.get(key);
    if (stillTracked === entry) {
      entry.refCount--;
      if (entry.refCount <= 0) sharedBrowsers.delete(key);
    }
    throw error;
  }
}

/**
 * Release a reference obtained via {@link acquireSharedBrowser}. Closes the shared
 * browser only once every acquirer for this key has released it.
 */
export async function releaseSharedBrowser(key: string): Promise<void> {
  const entry = sharedBrowsers.get(key);
  if (!entry) return;
  entry.refCount--;
  if (entry.refCount > 0) return;

  sharedBrowsers.delete(key);
  try {
    const browser = await entry.browserPromise;
    await browser.close();
  } catch (error) {
    logger.warn({ error, key }, '[browserLauncher] Failed to close shared browser');
  }
}

/** Test-only: current live shared-browser keys, to assert no leaks between cases. */
export function __getSharedBrowserKeysForTests(): string[] {
  return Array.from(sharedBrowsers.keys());
}

/** Test-only: force-clear tracked entries between test cases. */
export function __resetSharedBrowsersForTests(): void {
  sharedBrowsers.clear();
}
