# 01 — Browser Matrix (Stream A)

**Run:** 2026-09-28 05:29–05:35 UTC against `http://localhost:3000` (Next.js standalone, `NODE_ENV=production`, demo DB `proposal_g3_demo`).
**Tooling:** `scripts/qa/browser-matrix.mjs` — puppeteer-core 25.12 + `@axe-core/puppeteer`, Chromium 153 (`~/.cache/ms-playwright/chromium-1243`). Two passes:

| Pass | Command | Purpose | Evidence dir |
|---|---|---|---|
| **As-shipped** | `node scripts/qa/browser-matrix.mjs` | What a real browser sees | `closure/evidence/` |
| **Diagnostic** | `node scripts/qa/browser-matrix.mjs --bypass-csp` | Same run with `Page.setBypassCSP(true)` to isolate CSP-caused failures from independent defects | `closure/evidence-csp-bypass/` |

Machine-readable results: `evidence/browser-matrix-results.json`, `evidence-csp-bypass/browser-matrix-results.json`.

**Seeds used:** audit `a39a7bc3-45a5-47c4-bb5e-561e8ca7f600` ("Quick Fix Plumbing", COMPLETE). `Proposal` table has **0 rows** → public proposal surface not testable.

## Headline

**The as-shipped production build does not hydrate in a browser on any statically-prerendered page.** Middleware emits a per-request CSP nonce (`script-src 'self' 'nonce-…'`) but the rendered HTML for `/`, `/login`, `/register`, `/new-audit`, `/proposals`, `/settings/*`, `/pricing`, `/free-audit` contains **zero `nonce=` attributes** (these routes are served with `x-nextjs-prerender: 1`). Chromium blocks every Next.js inline `self.__next_f.push` script → React error #412 ("Connection closed.") → no event handlers attach. Consequences observed:

- Login form: pressing Enter / clicking "Sign In" performs a **native GET submit**; the browser lands on `/login?email=demo%40acme.com&password=DemoAgency%212026` — **credentials leak into the URL, history and server access logs**. No error message ever renders for a bad password.
- Every authenticated list page stays on its skeleton forever (`/`), or renders empty (`/proposals`, `/settings/team`).
- Only the dynamically rendered routes (`/dashboard`, `/audit/[id]`, `/settings/billing`) carry nonces and hydrate — and two of those three crash server-side (see D-02).

With CSP bypassed (diagnostic pass) login, invalid-login error, keyboard submit all pass — confirming the CSP/nonce mismatch is the single root cause of the client-side failures. Everything marked "CSP" below is that one defect.

## Matrix

Legend: ✅ renders as designed · ⚠️ renders but with defect · ❌ broken/dead-end · `—` not applicable. Viewport cells describe the **as-shipped** capture; "(hydrated ✅)" means the bypass pass renders correctly, i.e. failure is CSP-only. Screenshots: `evidence/screenshots/<surface>/<width>.png`.

| Surface | State | 320 | 375 | 768 | 1024 | 1440 | Axe crit/serious (375 / 1440) | Keyboard | Overflow | Result |
|---|---|---|---|---|---|---|---|---|---|---|
| `/` (marketing root) | auth (also same for anon) | ⚠️ skeleton forever; **overflow** (Batch Audit / New Audit / table 367px) | ⚠️ skeleton forever | ⚠️ skeleton | ⚠️ skeleton | ⚠️ skeleton (hydrated ✅ = Operator Dashboard) | 1/1 · 1/0 | n/t (not hydrated) | **Yes @320** (367>320) | ❌ Wrong page: `app/page.tsx` shadows `app/(marketing)/page.tsx`; anon visitors see an "Operator Dashboard" skeleton, never marketing |
| `/login` | unauth | ✅ | ✅ | ✅ | ✅ | ✅ layout; 200% zoom ✅ no clipping | 0/1 · 0/1 | Tab order ✅ (email→password→Sign In→Google→Create account), all 5 focus-visible ✅; **Enter → native GET, password in URL ❌** (bypass: ✅ lands on /dashboard) | No | ❌ Non-functional as shipped (CSP) |
| `/register` | unauth | ✅ | ✅ | ✅ | ✅ | ✅ | 0/0 · 0/0 | n/t (not hydrated; same native-GET risk — `useState`/`onSubmit` never attach) | No | ⚠️ Layout fine; form dead (CSP) |
| `/dashboard` | auth | ❌ error card | ❌ | ❌ | ❌ | ❌ "The dashboard failed to load" (bypass: ❌ same); 200% zoom ✅ | 0/0 · 0/0 | Tab: only focusable element is "Retry dashboard"; **no nav landmark exists** (`nav`=0, `main`=0); focus ring visible ✅ | No | ❌ Server crash: `MissingTenantError: Tenant.findUnique` (digest 1517952153) |
| `/new-audit` | auth | ✅ | ✅ | ✅ | ✅ | ✅ | 0/1 · 0/1 | n/t (not hydrated) | No | ⚠️ Visually ok; form dead (CSP); no way back to dashboard |
| `/audits/<id>` → 404, fallback `/audit/<id>` | auth | ✅ | ✅ | ✅ | ✅ | ✅ (hydrates — dynamic route has nonces) | 0/1 · 0/1 | n/t | No | ⚠️ "← Back to Dashboard" links to `/` (legacy dashboard) not `/dashboard`; `Duration –`, `Cost $0.00` placeholders; inline `style=` blocked by CSP (4 console errors) + one 404 asset |
| `/proposals` | auth | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ header row only (hydrated: identical — empty, no empty-state) | 0/0 · 0/0 | n/t | No | ⚠️ Dead end: table header with no rows, no empty state, no CTA, h1 flush to viewport top |
| `/settings/billing` | auth | ❌ | ❌ | ❌ | ❌ | ❌ "Something went wrong" (bypass ❌ same) | 0/0 · 0/0 | n/t | No | ❌ Server crash: `MissingTenantError: Tenant.findUnique` (digest 3386842387) |
| `/settings/branding` | auth | ⚠️ **overflow** 383>320, cards clipped | ⚠️ **overflow** 383>375 | ✅ | ✅ | ⚠️ unstyled white inputs | 1/1 · 1/1 | n/t | **Yes @320, @375** | ⚠️ `input-dark` class undefined → white boxes, hex values invisible; 7 unlabeled inputs (critical); two `<h1>` |
| `/settings/team` | auth | ✅ | ✅ | ✅ | ✅ | ⚠️ header only (hydrated: shows **hardcoded mock** "Alice Owner / Bob Admin @example.com") | 0/0 · 0/0 | n/t | No | ❌ Mock data, not tenant data (`// const res = await fetch('/api/team')` commented out) |
| `/pricing` | public (auth ctx) | ✅ | ✅ | ✅ | ✅ | ⚠️ footer rule/copyright overlaps link columns | 0/1 · 0/1 | n/t | No | ⚠️ 10 contrast failures; shows "Log In" while authenticated |
| `/free-audit` | public | ✅ | ✅ placeholders truncated ("Business Name (e.g. Acme De") | ✅ | ✅ | ✅ | 0/1 · 0/1 | n/t | No | ⚠️ Form dead (CSP); placeholder-as-label truncates on mobile |
| `/proposal/<token>` | public | — | — | — | — | — | — | — | — | **Not tested: no proposal seeded** (`SELECT count(*) FROM "Proposal"` = 0) |

Totals (as-shipped pass): **63 screenshots** (12 surfaces × 5 viewports + 2 zoom-200% + 1 invalid-login), **24 axe runs**, axe violations **critical 4 / serious 13 / moderate 50 / minor 0**. (Diagnostic pass: 63 screenshots, 4/14/50/0 — the extra serious is `scrollable-region-focusable` on `/` @1440 once the table actually renders.)

## Assertions

| Check | As-shipped | CSP-bypass | Detail |
|---|---|---|---|
| Unauth `/dashboard` → `/login` | **PASS** | PASS | 307 → `http://localhost:3000/login?callbackUrl=%2Fdashboard` (`middleware.ts:25-30`) |
| Invalid login shows error | **FAIL** | PASS | As shipped: no error, native GET to `/login?email=nobody%40example.com&password=…`. Bypassed: "Invalid email or password" renders, but container has no `role="alert"`/`aria-live` (`app/(auth)/login/page.tsx:77`) |
| Keyboard `/login` — Tab order + Enter submits | order **PASS**, submit **FAIL** | PASS | Focus-visible on all 5 controls (inputs: `ring-2` box-shadow; buttons/link: UA `outline auto`). As shipped Enter leaks credentials to URL |
| Keyboard `/dashboard` — Tab reaches main nav | **FAIL** | FAIL | There is no navigation: `nav`=0, `main`=0, skip-link=none. Page is the error boundary; only "Retry dashboard" is focusable (outline `rgb(16,16,16) auto 1px` — visible). Even when the page works there is no `<nav>` anywhere under `app/(dashboard)/` (no `layout.tsx`; `app/layout.tsx:26` renders bare `<body>{children}</body>`) |
| Login (for auth matrix) | form FAIL → API fallback PASS | form PASS | Session cookie `__Host-next-auth.session-token` (Secure, HttpOnly, SameSite=Strict) |
| 200% zoom `/login`, `/dashboard` @1440 | PASS | PASS | CSS `zoom:2` on `<html>` (720px effective). No horizontal overflow, no clipped containers, no ellipsis truncation. Dashboard is the error card so coverage is limited to that card |

## Defects (concrete)

| ID | Sev | Surface / viewport | What is wrong | Likely file |
|---|---|---|---|---|
| D-01 | **P0** | All prerendered routes, all viewports | CSP `script-src` nonce is per-request but statically prerendered HTML has no `nonce` attributes → all inline Next.js scripts blocked → no hydration → **login form submits via GET with plaintext password in URL**; every client-interactive form is dead. Middleware sets `x-csp-nonce` on the *response* but never on the *request* headers (`x-nonce`), and pages are not forced dynamic. | `middleware.ts:59-80` (`generateNonce`, `response.headers.set('x-csp-nonce')`, missing `requestHeaders.set('x-nonce', nonce)`), `lib/config/security.ts:41-52`, and `export const dynamic = 'force-dynamic'` missing on `app/(auth)/login/page.tsx`, `app/(auth)/register/page.tsx`, `app/page.tsx`, `app/new-audit/page.tsx`, `app/(dashboard)/proposals/page.tsx`, `app/(dashboard)/settings/{branding,team}/page.tsx`, `app/(public)/free-audit/page.tsx`, `app/(marketing)/pricing/page.tsx` — or drop the nonce and use a hash/`strict-dynamic` strategy |
| D-02 | **P0** | `/dashboard`, `/settings/billing` — all viewports | Server component calls `prisma.tenant.findUnique` outside a tenant context → `MissingTenantError` → error boundary. Demo user cannot see the dashboard or billing at all. `/onboarding` shows the correct pattern (`runWithTenantAsync`). | `app/(dashboard)/dashboard/page.tsx:17-23`, `app/(dashboard)/settings/billing/page.tsx:16-24`; pattern in `app/(dashboard)/onboarding/page.tsx:21`; guard in `lib/prisma.ts:46` |
| D-03 | **P1** | `/` — all viewports (anon + auth) | Root renders `DashboardClient` ("Operator Dashboard") instead of the marketing landing. `app/page.tsx` wins over `app/(marketing)/page.tsx`; anonymous visitors see an operator skeleton that never resolves (`/api/audits` → 401). | `app/page.tsx:1-5` vs `app/(marketing)/page.tsx` |
| D-04 | **P1** | `/settings/team` @1440 (hydrated) | Member list is hardcoded mock data ("Alice Owner", "Bob Admin", `@example.com`) — real tenant user `demo@acme.com` is not shown; "Remove" acts on fakes. | `app/(dashboard)/settings/team/page.tsx:13-18` |
| D-05 | **P1** | Whole authenticated app | No global navigation/`<main>` landmark; every dashboard page is a dead end (no way to reach `/settings/*`, `/proposals`, `/new-audit` except by URL). `landmark-one-main` fails on all 12 surfaces. | missing `app/(dashboard)/layout.tsx`; `app/layout.tsx:26` |
| D-06 | **P1** | `/settings/branding` @320, @375 | Horizontal overflow 383px (cards + sticky preview clipped at right edge). Also `input-dark` class is not defined → white unstyled inputs, hex values (`#8B5CF6`) unreadable white-on-white. | `app/(dashboard)/settings/branding/page.tsx:73` (`grid lg:grid-cols-2 gap-12`, `.sticky.top-10`), `:83` (`input-dark`), `app/globals.css` (no `.input-dark`) |
| D-07 | **P1** | `/settings/branding` (axe critical `label`, 7 nodes) & `/` (axe critical `select-name`) | Color inputs + hex text inputs have no accessible name (`Field` renders a `<label>` without `htmlFor`); status `<select>` on dashboard table has no label. Same unassociated-label pattern on `/login`, `/register` (passes axe only via placeholder). | `app/(dashboard)/settings/branding/page.tsx:284-289`, `app/dashboard/AuditTable.tsx` (`<select>`), `app/(auth)/login/page.tsx:56-73` |
| D-08 | **P2** | `/` @320 | Horizontal overflow 367px: header action row (`Batch Audit` + `+ New Audit` don't wrap) and audits table; table wrapper `.overflow-x-auto` not keyboard-focusable (axe serious). | `app/dashboard/DashboardClient.tsx` header, `app/dashboard/AuditTable.tsx` |
| D-09 | **P2** | `/proposals`, `/settings/branding`, `/settings/team`, `/audit/[id]` | `.container` in `globals.css` (`padding: 0 1.5rem`) is declared after `@tailwind utilities` and overrides `py-10`, so H1s sit flush against the viewport top (0–5px). | `app/globals.css:314-318`; pages using `className="container … py-10"` |
| D-10 | **P2** | `/proposals` all viewports | Empty table with header row only — no empty state, no explanation, no CTA to create a proposal. | `app/(dashboard)/proposals/page.tsx:72-80` |
| D-11 | **P2** | `/audit/[id]` | "← Back to Dashboard" goes to `/` (legacy `DashboardClient`) not `/dashboard`; "Duration –" and "Cost $0.00" placeholder metrics shown for a COMPLETE audit; category tag "gbp" is raw enum text; `Phoenix    • Created` double-gap when industry is null. Inline `style=` attributes blocked by CSP `style-src` (4 console errors). | `app/audit/[id]/AuditDetailClient.tsx:63-78,125-131` |
| D-12 | **P2** | `/login` (hydrated) | Error message container lacks `role="alert"` / `aria-live`; not announced to AT. | `app/(auth)/login/page.tsx:76-80` |
| D-13 | **P2** | `/pricing` @1440 | Footer: horizontal rule + "© 2026 ProposalOS" overlaps the "API Docs"/"Success Stories" link column (negative margin / insufficient bottom padding). Header shows "Log In" although session exists. 10 `color-contrast` serious failures (`.text-slate-500` on `#0b0f1a`). | `app/(marketing)/layout.tsx` footer, `app/(marketing)/pricing/page.tsx` |
| D-14 | **P3** | `/free-audit` @320/375 | Placeholder-as-label truncates ("Business Name (e.g. Acme De"); no visible labels. `.mt-4` helper text fails contrast. | `app/(public)/free-audit/page.tsx` |
| D-15 | **P3** | `/audits/<id>` | Route does not exist (404) — only `/audits/[id]/compare`. Audit detail lives at `/audit/[id]`; inconsistent with `/audits` prefix protected in middleware. | `app/(dashboard)/audits/[id]/` |

## Not tested / limitations

- **Public proposal `/proposal/<token>`**: 0 rows in `Proposal` — nothing to render.
- **Keyboard on `/dashboard` main nav**: cannot pass in any mode — no nav exists (D-05) and the page is an error boundary (D-02).
- **Interactive flows past the first form** (create audit, batch modal, invite member, save branding) were not exercised as shipped because no page hydrates (D-01).
- 200% zoom emulated with CSS `zoom` on `<html>` at 1440×900 (equivalent to a 720px layout viewport), not OS-level browser zoom.
- Axe run with tags `wcag2a, wcag2aa, wcag21a, wcag21aa, best-practice`; `region`/`landmark-one-main` are best-practice moderate and dominate the moderate count (they appear on every surface because there are no landmarks at all).
