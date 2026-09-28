#!/usr/bin/env node
/**
 * Stream A — browser QA matrix for Proposal Engine OS.
 *
 * Uses puppeteer-core (already installed) + @axe-core/puppeteer with the
 * Playwright-managed Chromium binary. Does NOT touch app source.
 *
 * Outputs (all under docs/execution/fable-5.1-full-advancement/closure/evidence):
 *   screenshots/<surface>/<width>.png           full-page screenshots
 *   screenshots/<surface>/1440-zoom200.png       200% zoom captures (dashboard, login)
 *   axe/<surface>-<width>.json                   raw axe results (375, 1440)
 *   browser-matrix-results.json                  machine-readable summary
 *
 * Usage: node scripts/qa/browser-matrix.mjs [--base http://localhost:3000]
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { AxePuppeteer } from '@axe-core/puppeteer';
import puppeteer from 'puppeteer-core';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2);
const argVal = (flag, dflt) => {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const BASE = argVal('--base', 'http://localhost:3000').replace(/\/$/, '');
const BYPASS_CSP = argv.includes('--bypass-csp'); // diagnostic mode: isolate CSP-caused failures
const EMAIL = process.env.QA_EMAIL || 'demo@acme.com';
const PASSWORD = process.env.QA_PASSWORD || 'DemoAgency!2026';
const ROOT = process.cwd();
const CLOSURE = path.join(ROOT, 'docs/execution/fable-5.1-full-advancement/closure');
const EVIDENCE = path.join(CLOSURE, BYPASS_CSP ? 'evidence-csp-bypass' : 'evidence');
const SHOTS = path.join(EVIDENCE, 'screenshots');
const AXE_DIR = path.join(EVIDENCE, 'axe');
const RESULTS_JSON = path.join(EVIDENCE, 'browser-matrix-results.json');
const VIEWPORTS = [320, 375, 768, 1024, 1440];
const AXE_VIEWPORTS = [1440, 375];
const NAV_TIMEOUT = 45_000;

fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(AXE_DIR, { recursive: true });

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ---------------------------------------------------------------------------
// Locate a Chromium binary
// ---------------------------------------------------------------------------
function findChrome() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const pw = path.join(os.homedir(), '.cache/ms-playwright');
  if (fs.existsSync(pw)) {
    const dirs = fs
      .readdirSync(pw)
      .filter((d) => /^chromium-\d+$/.test(d))
      .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
    for (const d of dirs) {
      for (const sub of ['chrome-linux64/chrome', 'chrome-linux/chrome']) {
        const p = path.join(pw, d, sub);
        if (fs.existsSync(p)) return p;
      }
    }
  }
  for (const p of ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser']) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('No Chromium binary found; set CHROME_PATH');
}

// ---------------------------------------------------------------------------
// Seed lookups (best-effort; falls back gracefully)
// ---------------------------------------------------------------------------
function psql(sql) {
  try {
    return execSync(
      `docker exec proposal_engine_db psql -U postgres -d proposal_g3_demo -tA -c ${JSON.stringify(sql)}`,
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    )
      .trim()
      .split('\n')
      .filter(Boolean);
  } catch {
    return [];
  }
}

function lookupSeeds() {
  const audit = psql(`SELECT id||'|'||"businessName" FROM "Audit" WHERE status='COMPLETE' ORDER BY "createdAt" DESC LIMIT 1`)[0];
  const proposal = psql(`SELECT id||'|'||coalesce("webLinkToken",'')||'|'||status FROM "Proposal" WHERE "webLinkToken" IS NOT NULL LIMIT 1`)[0];
  const proposalCount = Number(psql(`SELECT count(*) FROM "Proposal"`)[0] || 0);
  return {
    auditId: audit ? audit.split('|')[0] : null,
    auditName: audit ? audit.split('|').slice(1).join('|') : null,
    proposalToken: proposal && proposal.split('|')[1] ? proposal.split('|')[1] : null,
    proposalCount,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function newPage(ctx) {
  const page = await ctx.newPage();
  if (BYPASS_CSP) await page.setBypassCSP(true);
  return page;
}

/** Fallback login that does not depend on client hydration: performs the
 *  Auth.js credentials POST from inside the page so the browser stores the
 *  Set-Cookie itself (works for the __Host- prefixed cookie on localhost). */
async function apiLogin(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
  return page.evaluate(async (email, password) => {
    const csrf = await (await fetch('/api/auth/csrf', { credentials: 'same-origin' })).json();
    const body = new URLSearchParams({ csrfToken: csrf.csrfToken, email, password, callbackUrl: '/dashboard', json: 'true' });
    const res = await fetch('/api/auth/callback/credentials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      credentials: 'same-origin',
      redirect: 'manual', // CSP upgrade-insecure-requests would upgrade the follow to https://localhost
    });
    const session = await (await fetch('/api/auth/session', { credentials: 'same-origin' })).json();
    return { status: res.status, type: res.type, hasUser: !!session?.user, user: session?.user?.email || null };
  }, EMAIL, PASSWORD);
}

async function settle(page, ms = 800) {
  // Give client hydration / data fetches a moment; then wait for network idle-ish.
  try {
    await page.waitForNetworkIdle({ idleTime: 400, timeout: 6_000 });
  } catch {
    /* ignore — some pages poll */
  }
  await sleep(ms);
}

function attachConsoleCollector(page, sink) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') sink.push({ kind: 'console', text: msg.text().slice(0, 500) });
  });
  page.on('pageerror', (err) => sink.push({ kind: 'pageerror', text: String(err?.message || err).slice(0, 500) }));
  page.on('requestfailed', (req) => {
    const f = req.failure();
    // Ignore aborted prefetches; those are normal in Next.js.
    if (f && f.errorText && !/ERR_ABORTED/.test(f.errorText)) {
      sink.push({ kind: 'requestfailed', text: `${req.method()} ${req.url()} — ${f.errorText}`.slice(0, 500) });
    }
  });
}

async function pageFacts(page) {
  return page.evaluate(() => {
    const h1s = [...document.querySelectorAll('h1')].filter((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
    });
    const overflowers = [...document.querySelectorAll('body *')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.right > window.innerWidth + 1 && r.width > 0 && r.height > 0;
      })
      .slice(0, 8)
      .map((el) => {
        const id = el.id ? `#${el.id}` : '';
        const cls = typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
        return `${el.tagName.toLowerCase()}${id}${cls}`.slice(0, 120);
      });
    return {
      hydrated: !!(window.__next_f && window.__next_f.length) || !!document.querySelector('[data-reactroot], #__next[data-hydrated]') || typeof window.next !== 'undefined',
      nonceAttrs: document.querySelectorAll('script[nonce]').length,
      inlineScripts: [...document.querySelectorAll('script:not([src])')].length,
      title: document.title,
      h1: h1s.map((h) => h.textContent.trim().replace(/\s+/g, ' ').slice(0, 120)),
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      bodyScrollWidth: document.body ? document.body.scrollWidth : null,
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
      overflowers,
      url: location.href,
      bodyTextLen: (document.body?.innerText || '').length,
      hasTechnicalLeakage: /(\bundefined\b|\bNaN\b|\[object Object\]|TypeError|ReferenceError|Application error)/.test(
        document.body?.innerText || '',
      ),
    };
  });
}

async function runAxe(page) {
  const results = await new AxePuppeteer(page).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']).analyze();
  const byImpact = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  for (const v of results.violations) byImpact[v.impact || 'minor'] += 1;
  return { results, byImpact };
}

function slug(s) {
  return s.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'root';
}

async function focusInfo(page) {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el) return null;
    const cs = getComputedStyle(el);
    const outlineVisible = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0;
    const boxShadowVisible = cs.boxShadow && cs.boxShadow !== 'none';
    const r = el.getBoundingClientRect();
    return {
      tag: el.tagName.toLowerCase(),
      name: el.getAttribute('name') || el.getAttribute('aria-label') || el.id || '',
      text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60),
      href: el.getAttribute('href') || null,
      role: el.getAttribute('role') || null,
      inNav: !!el.closest('nav, [role="navigation"], aside, header'),
      outline: cs.outline,
      boxShadow: cs.boxShadow,
      focusVisible: outlineVisible || boxShadowVisible,
      onScreen: r.width > 0 && r.height > 0,
    };
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const chromePath = findChrome();
  log('chrome:', chromePath);
  const seeds = lookupSeeds();
  log('seeds:', JSON.stringify(seeds));

  const summary = {
    meta: {
      base: BASE,
      mode: BYPASS_CSP ? 'csp-bypass (diagnostic)' : 'as-shipped',
      startedAt: new Date().toISOString(),
      chromePath,
      seeds,
      viewports: VIEWPORTS,
      axeViewports: AXE_VIEWPORTS,
    },
    surfaces: {},
    checks: {},
    screenshotsCaptured: 0,
    axeTotals: { critical: 0, serious: 0, moderate: 0, minor: 0 },
    scriptErrors: [],
  };

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--ignore-certificate-errors'],
  });

  try {
    // -----------------------------------------------------------------------
    // Check 1: unauthenticated /dashboard -> /login
    // -----------------------------------------------------------------------
    {
      const ctx = await browser.createBrowserContext();
      const page = await newPage(ctx);
      await page.setViewport({ width: 1440, height: 900 });
      const resp = await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
      await settle(page, 300);
      const chain = resp?.request().redirectChain().map((r) => `${r.url()} -> ${r.response()?.status()}`) || [];
      const finalUrl = page.url();
      const u = new URL(finalUrl);
      const pass = u.pathname === '/login';
      summary.checks.unauthRedirect = {
        pass,
        finalUrl,
        callbackUrl: u.searchParams.get('callbackUrl'),
        redirectChain: chain,
        finalStatus: resp?.status() ?? null,
      };
      log(`unauth /dashboard -> ${finalUrl} : ${pass ? 'PASS' : 'FAIL'}`);
      await ctx.close();
    }

    // -----------------------------------------------------------------------
    // Check 2: invalid login shows error
    // -----------------------------------------------------------------------
    {
      const ctx = await browser.createBrowserContext();
      const page = await newPage(ctx);
      const errs = [];
      attachConsoleCollector(page, errs);
      await page.setViewport({ width: 1440, height: 900 });
      await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0', timeout: NAV_TIMEOUT });
      await page.type('input[name="email"]', 'nobody@example.com');
      await page.type('input[name="password"]', 'definitely-wrong-password');
      await page.click('button[type="submit"]');
      let errorText = null;
      try {
        await page.waitForFunction(
          () => /invalid email or password|something went wrong/i.test(document.body.innerText),
          { timeout: 15_000 },
        );
        errorText = await page.evaluate(() => {
          const m = document.body.innerText.match(/(Invalid email or password|Something went wrong)/i);
          return m ? m[1] : null;
        });
      } catch {
        /* handled below */
      }
      const errorEl = await page.evaluate(() => {
        const el = [...document.querySelectorAll('div')].find((d) => /Invalid email or password/i.test(d.textContent) && d.children.length === 0);
        if (!el) return null;
        return { role: el.getAttribute('role'), ariaLive: el.getAttribute('aria-live'), text: el.textContent.trim() };
      });
      const stillOnLogin = new URL(page.url()).pathname === '/login';
      summary.checks.invalidLogin = {
        pass: !!errorText && stillOnLogin,
        errorText,
        stillOnLogin,
        errorElement: errorEl,
        note: errorEl && !errorEl.role && !errorEl.ariaLive ? 'Error container has no role="alert"/aria-live — not announced to screen readers' : null,
        consoleErrors: errs,
      };
      const dir = path.join(SHOTS, 'login');
      fs.mkdirSync(dir, { recursive: true });
      await page.screenshot({ path: path.join(dir, '1440-invalid-login.png'), fullPage: true });
      summary.screenshotsCaptured += 1;
      log(`invalid login -> "${errorText}" : ${summary.checks.invalidLogin.pass ? 'PASS' : 'FAIL'}`);
      await ctx.close();
    }

    // -----------------------------------------------------------------------
    // Check 3: keyboard-only pass on /login (Tab through, Enter submits)
    // -----------------------------------------------------------------------
    {
      const ctx = await browser.createBrowserContext();
      const page = await newPage(ctx);
      await page.setViewport({ width: 1440, height: 900 });
      await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0', timeout: NAV_TIMEOUT });
      const tabTrail = [];
      // Start from body, Tab to first control.
      await page.evaluate(() => document.body.focus());
      for (let i = 0; i < 8; i++) {
        await page.keyboard.press('Tab');
        await sleep(60);
        const info = await focusInfo(page);
        tabTrail.push(info);
        if (info?.tag === 'a' && info.href === '/register') break;
      }
      // Now fill via keyboard only: Shift+Tab back to email, type, Tab, type, Enter.
      await page.focus('input[name="email"]');
      await page.keyboard.type(EMAIL);
      await page.keyboard.press('Tab');
      const focusedAfterTab = await focusInfo(page);
      await page.keyboard.type(PASSWORD);
      await page.keyboard.press('Enter');
      let landed = null;
      try {
        await page.waitForFunction(() => location.pathname.startsWith('/dashboard'), { timeout: 20_000 });
        landed = page.url();
      } catch {
        landed = page.url();
      }
      const orderOk =
        tabTrail[0]?.name === 'email' && tabTrail[1]?.name === 'password' && tabTrail[2]?.tag === 'button';
      const leakedToUrl = /[?&](email|password)=/.test(landed);
      summary.checks.keyboardLogin = {
        pass: new URL(landed).pathname.startsWith('/dashboard') && orderOk,
        tabOrderOk: orderOk,
        tabTrail,
        focusedAfterTabFromEmail: focusedAfterTab?.name,
        enterSubmitted: new URL(landed).pathname.startsWith('/dashboard'),
        landedUrl: landed.replace(/password=[^&]*/, 'password=<redacted>'),
        nativeGetSubmitLeak: leakedToUrl,
        note: leakedToUrl ? 'Enter triggered a native GET form submit (React onSubmit never attached => page not hydrated). Email+password appear in the URL/query string.' : null,
        focusVisibleOnControls: tabTrail.map((t) => ({ el: `${t?.tag}[${t?.name || t?.text}]`, focusVisible: t?.focusVisible, outline: t?.outline, boxShadow: t?.boxShadow })),
      };
      log(`keyboard login -> ${landed} : ${summary.checks.keyboardLogin.pass ? 'PASS' : 'FAIL'}`);
      await ctx.close();
    }

    // -----------------------------------------------------------------------
    // Authenticated context for the surface matrix
    // -----------------------------------------------------------------------
    const authCtx = await browser.createBrowserContext();
    {
      const page = await newPage(authCtx);
      await page.setViewport({ width: 1440, height: 900 });
      await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0', timeout: NAV_TIMEOUT });
      await page.type('input[name="email"]', EMAIL);
      await page.type('input[name="password"]', PASSWORD);
      await Promise.all([
        page.waitForFunction(() => location.pathname.startsWith('/dashboard'), { timeout: 30_000 }).catch(() => null),
        page.click('button[type="submit"]'),
      ]);
      let cookies = await authCtx.cookies();
      let hasSession = cookies.some((c) => /next-auth\.session-token|authjs\.session-token/.test(c.name));
      const formLogin = { pass: hasSession && page.url().includes('/dashboard'), landedUrl: page.url().replace(/password=[^&]*/, 'password=<redacted>') };
      log(`form login -> ${formLogin.landedUrl} session=${hasSession}`);
      let api = null;
      if (!formLogin.pass) {
        api = await apiLogin(page);
        cookies = await authCtx.cookies();
        hasSession = cookies.some((c) => /next-auth\.session-token|authjs\.session-token/.test(c.name));
        log(`api login fallback -> status=${api.status} user=${api.user} session=${hasSession}`);
      }
      summary.checks.login = {
        pass: hasSession,
        formLogin,
        apiLoginFallback: api,
        method: formLogin.pass ? 'browser form' : 'in-page fetch to /api/auth/callback/credentials (form submit did not hydrate)',
        sessionCookie: cookies.filter((c) => /session-token/.test(c.name)).map((c) => `${c.name} (secure=${c.secure}, httpOnly=${c.httpOnly}, sameSite=${c.sameSite})`),
      };
      if (!hasSession) throw new Error('Login failed via form AND API; cannot proceed with authenticated matrix');
      await page.close();
    }

    // -----------------------------------------------------------------------
    // Check 4: keyboard pass on /dashboard (Tab reaches main nav; focus-visible)
    // -----------------------------------------------------------------------
    {
      const page = await newPage(authCtx);
      await page.setViewport({ width: 1440, height: 900 });
      await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle0', timeout: NAV_TIMEOUT });
      await settle(page, 500);
      const landmarks = await page.evaluate(() => ({
        nav: document.querySelectorAll('nav, [role="navigation"]').length,
        main: document.querySelectorAll('main, [role="main"]').length,
        skipLink: !!document.querySelector('a[href^="#"][class*="skip"], a[href="#main"], a[href="#content"], a[href="#main-content"]'),
        navLinks: [...document.querySelectorAll('nav a, [role="navigation"] a, aside a')].map((a) => (a.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40)).filter(Boolean).slice(0, 20),
      }));
      await page.evaluate(() => document.body.focus());
      const trail = [];
      let reachedNav = false;
      let firstNavAtTab = null;
      for (let i = 1; i <= 25; i++) {
        await page.keyboard.press('Tab');
        await sleep(50);
        const info = await focusInfo(page);
        trail.push(info);
        if (info?.inNav && !reachedNav) {
          reachedNav = true;
          firstNavAtTab = i;
        }
        if (reachedNav && i >= firstNavAtTab + 4) break;
      }
      const focusVisibleCount = trail.filter((t) => t?.focusVisible).length;
      summary.checks.keyboardDashboard = {
        pass: reachedNav,
        reachedNav,
        firstNavAtTab,
        landmarks,
        tabsSampled: trail.length,
        focusVisibleCount,
        focusVisibleRatio: trail.length ? +(focusVisibleCount / trail.length).toFixed(2) : 0,
        trail: trail.map((t) => ({ el: `${t?.tag}${t?.href ? `[href=${t.href}]` : ''}`, text: t?.text, inNav: t?.inNav, focusVisible: t?.focusVisible, outline: t?.outline, boxShadow: t?.boxShadow?.slice(0, 80) })),
      };
      log(`keyboard dashboard -> reachedNav=${reachedNav} at tab ${firstNavAtTab}; focus-visible ${focusVisibleCount}/${trail.length}`);
      await page.close();
    }

    // -----------------------------------------------------------------------
    // Surface matrix
    // -----------------------------------------------------------------------
    const surfaces = [
      { key: 'root', route: '/', state: 'public' },
      { key: 'login', route: '/login', state: 'unauth', unauth: true },
      { key: 'register', route: '/register', state: 'unauth', unauth: true },
      { key: 'dashboard', route: '/dashboard', state: 'auth' },
      { key: 'new-audit', route: '/new-audit', state: 'auth' },
      seeds.auditId
        ? { key: 'audit-detail', route: `/audits/${seeds.auditId}`, fallback: `/audit/${seeds.auditId}`, state: 'auth', note: `seeded audit "${seeds.auditName}"` }
        : { key: 'audit-detail', route: null, state: 'auth', skip: 'no seeded COMPLETE audit found' },
      { key: 'proposals', route: '/proposals', state: 'auth' },
      { key: 'settings-billing', route: '/settings/billing', state: 'auth' },
      { key: 'settings-branding', route: '/settings/branding', state: 'auth' },
      { key: 'settings-team', route: '/settings/team', state: 'auth' },
      { key: 'pricing', route: '/pricing', state: 'public' },
      { key: 'free-audit', route: '/free-audit', state: 'public' },
      seeds.proposalToken
        ? { key: 'public-proposal', route: `/proposal/${seeds.proposalToken}`, state: 'public' }
        : { key: 'public-proposal', route: null, state: 'public', skip: `no proposal seeded (Proposal count=${seeds.proposalCount})` },
    ];

    const unauthCtx = await browser.createBrowserContext();

    for (const s of surfaces) {
      const rec = { key: s.key, route: s.route, state: s.state, note: s.note || null, viewports: {}, axe: {}, consoleErrors: [], skipped: null };
      summary.surfaces[s.key] = rec;
      if (s.skip) {
        rec.skipped = s.skip;
        log(`SKIP ${s.key}: ${s.skip}`);
        continue;
      }
      const ctx = s.unauth ? unauthCtx : authCtx;
      const page = await newPage(ctx);
      const errs = [];
      attachConsoleCollector(page, errs);

      // Resolve route (with fallback for audits)
      let route = s.route;
      let resp = await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT }).catch((e) => ({ status: () => 0, _err: e }));
      let status = resp?.status?.() ?? 0;
      if ((status === 404 || status === 0) && s.fallback) {
        log(`${s.key}: ${route} -> ${status}; trying fallback ${s.fallback}`);
        route = s.fallback;
        resp = await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT }).catch((e) => ({ status: () => 0, _err: e }));
        status = resp?.status?.() ?? 0;
      }
      rec.route = route;
      rec.httpStatus = status;
      rec.finalUrl = page.url();
      rec.redirected = new URL(page.url()).pathname !== route.split('?')[0];
      if (status === 404) {
        rec.skipped = `route ${route} returned 404`;
        log(`SKIP ${s.key}: 404`);
        await page.close();
        continue;
      }
      if (status === 0) {
        rec.skipped = `navigation error: ${resp?._err?.message || 'unknown'}`;
        log(`SKIP ${s.key}: ${rec.skipped}`);
        await page.close();
        continue;
      }

      const dir = path.join(SHOTS, s.key);
      fs.mkdirSync(dir, { recursive: true });

      for (const w of VIEWPORTS) {
        await page.setViewport({ width: w, height: w < 768 ? 740 : 900, deviceScaleFactor: 1 });
        // Re-navigate at each viewport so SSR/responsive JS sees the real width.
        const r = await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT }).catch(() => null);
        await settle(page);
        const facts = await pageFacts(page);
        const shot = path.join(dir, `${w}.png`);
        await page.screenshot({ path: shot, fullPage: true });
        summary.screenshotsCaptured += 1;
        const vrec = {
          status: r?.status?.() ?? null,
          title: facts.title,
          h1: facts.h1,
          horizontalOverflow: facts.horizontalOverflow,
          scrollWidth: facts.scrollWidth,
          innerWidth: facts.innerWidth,
          overflowers: facts.horizontalOverflow ? facts.overflowers : [],
          technicalLeakage: facts.hasTechnicalLeakage,
          hydrated: facts.hydrated,
          nonceAttrs: facts.nonceAttrs,
          inlineScripts: facts.inlineScripts,
          cspBlocked: errs.some((e) => /Content Security Policy/.test(e.text)),
          screenshot: path.relative(CLOSURE, shot),
        };
        if (AXE_VIEWPORTS.includes(w)) {
          try {
            const { results, byImpact } = await runAxe(page);
            const axePath = path.join(AXE_DIR, `${s.key}-${w}.json`);
            fs.writeFileSync(axePath, JSON.stringify(results, null, 2));
            for (const k of Object.keys(byImpact)) summary.axeTotals[k] += byImpact[k];
            rec.axe[w] = {
              byImpact,
              file: path.relative(CLOSURE, axePath),
              violations: results.violations.map((v) => ({
                id: v.id,
                impact: v.impact,
                help: v.help,
                nodes: v.nodes.length,
                targets: v.nodes.slice(0, 5).map((n) => n.target.join(' ')),
              })),
            };
          } catch (e) {
            rec.axe[w] = { error: String(e?.message || e) };
            summary.scriptErrors.push(`axe ${s.key}@${w}: ${e?.message || e}`);
          }
        }
        rec.viewports[w] = vrec;
        log(`${s.key} @${w}: ${vrec.status} "${vrec.title}" h1=${JSON.stringify(vrec.h1)} overflow=${vrec.horizontalOverflow}${rec.axe[w] ? ` axe=${JSON.stringify(rec.axe[w].byImpact)}` : ''}`);
      }

      // Zoom-200% capture for dashboard & login
      if (s.key === 'dashboard' || s.key === 'login') {
        await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
        await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT }).catch(() => null);
        await settle(page);
        // Emulate 200% browser zoom: CSS zoom on <html> halves the effective CSS viewport (720px).
        await page.evaluate(() => {
          document.documentElement.style.zoom = '2';
        });
        await sleep(600);
        const zfacts = await page.evaluate(() => {
          const clipped = [...document.querySelectorAll('body *')]
            .filter((el) => {
              const cs = getComputedStyle(el);
              if (!/hidden|clip/.test(cs.overflowX) && !/hidden|clip/.test(cs.overflow)) return false;
              return el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0;
            })
            .slice(0, 10)
            .map((el) => {
              const cls = typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
              return `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${cls} (scrollW ${el.scrollWidth} > clientW ${el.clientWidth})`.slice(0, 160);
            });
          const truncated = [...document.querySelectorAll('body *')]
            .filter((el) => getComputedStyle(el).textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0)
            .slice(0, 10)
            .map((el) => `${el.tagName.toLowerCase()}: "${(el.textContent || '').trim().slice(0, 50)}"`);
          return {
            docScrollWidth: document.documentElement.scrollWidth,
            innerWidth: window.innerWidth,
            horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
            clippedContainers: clipped,
            truncatedText: truncated,
          };
        });
        const zshot = path.join(dir, '1440-zoom200.png');
        await page.screenshot({ path: zshot, fullPage: true });
        summary.screenshotsCaptured += 1;
        rec.zoom200 = { ...zfacts, screenshot: path.relative(CLOSURE, zshot), method: 'CSS zoom=2 on <html> at 1440x900 (effective 720px layout viewport)' };
        log(`${s.key} zoom200: overflow=${zfacts.horizontalOverflow} clipped=${zfacts.clippedContainers.length} truncated=${zfacts.truncatedText.length}`);
        await page.evaluate(() => {
          document.documentElement.style.zoom = '';
        });
      }

      // De-dupe console errors
      const seen = new Set();
      rec.consoleErrors = errs.filter((e) => (seen.has(e.text) ? false : (seen.add(e.text), true))).slice(0, 25);
      await page.close();
    }

    await unauthCtx.close();
    await authCtx.close();
  } catch (e) {
    summary.scriptErrors.push(`fatal: ${e?.stack || e}`);
    log('FATAL', e);
  } finally {
    await browser.close();
  }

  summary.meta.finishedAt = new Date().toISOString();
  fs.writeFileSync(RESULTS_JSON, JSON.stringify(summary, null, 2));
  log('wrote', path.relative(ROOT, RESULTS_JSON));
  log('screenshots:', summary.screenshotsCaptured, 'axe totals:', JSON.stringify(summary.axeTotals));
  if (summary.scriptErrors.length) {
    log('script errors:', summary.scriptErrors.length);
    for (const e of summary.scriptErrors) console.error(' -', e.split('\n')[0]);
  }
  process.exit(summary.scriptErrors.some((e) => e.startsWith('fatal')) ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
