# 01 — Browser Matrix (Stream A) — R2

**Run:** 2026-09-28 06:06–06:11 UTC against `http://localhost:3000` (Next.js standalone, `NODE_ENV=production`, demo DB `proposal_g3_demo`), as-shipped CSP (no bypass).
**Tooling:** `node scripts/qa/browser-matrix.mjs --run r2` — puppeteer-core 25.12 + `@axe-core/puppeteer`, Chromium 153 (`~/.cache/ms-playwright/chromium-1243`).
**Evidence:** `evidence/screenshots-r2/<surface>/<width>.png`, `evidence/axe-r2/<surface>-<width>.json`, `evidence/browser-matrix-results-r2.json`. R1 evidence (`evidence/screenshots/`, `evidence/axe/`, `evidence/browser-matrix-results.json`) is untouched.
**Seeds:** audit `a39a7bc3-45a5-47c4-bb5e-561e8ca7f600` ("Quick Fix Plumbing", COMPLETE). `Proposal` table still has 0 rows → `/proposal/<token>` still not testable.

## R1 → R2 delta

| | R1 | R2 |
|---|---|---|
| Surfaces / screenshots | 12 / 63 | 14 (+`/schedules`, `/analytics`) / **74** (14×5 + 2 zoom-200% + invalid-login + mobile-menu-open) |
| Hydration as shipped | none on prerendered routes (CSP nonce missing) | **all pages hydrate**; `script[nonce]` present on every route, 0 CSP console errors |
| Login | native GET, password in URL | **JS POST**, lands on `/dashboard`, no `email=`/`password=` in any URL |
| Invalid login | no error rendered | `Invalid email or password` in `<div role="alert" aria-live="assertive">` |
| `/` | legacy Operator Dashboard skeleton | marketing page, title "ProposalOS - AI Audit Engine for Agencies" |
| `/dashboard`, `/settings/billing` | server crash (`MissingTenantError`) | render with data; no "Retry dashboard"/"Something went wrong" text at any viewport |
| App shell | none (`nav`=0, `main`=0) | `nav[aria-label="Primary"]`, `main#main`, skip link, Sign out, hamburger `aria-controls="mobile-nav"` at <768 on all `(dashboard)` routes |
| `/settings/team` | Alice/Bob mock | "Demo User / demo@acme.com / Owner" |
| Axe (rules per run, summed) | 4 crit / 13 ser / 50 mod / 0 minor (24 runs) | **4 / 26 / 30 / 0** (28 runs). Same 12 surfaces only: **2 / 23 / 26 / 0**. Moderate halved (`landmark-one-main`/`region` gone from 8 of 14 surfaces). Serious went *up* because pages now render real content (20 low-contrast table cells on `/dashboard`, 9 on `/settings/billing`) and the new header logo link has no name at <640px (7 surfaces @375). New critical: `select-name` on `/analytics` (new surface). |
| Scripted checks passing | 2 / 5 | **9 / 10** (only `brandingInputs` fails — one unlabelled input) |

## Verification of the 8 requested changes

| # | Change | Result | Evidence |
|---|---|---|---|
| 1 | CSP nonce → hydration; login submits via JS POST, no credentials in URL; invalid login shows `role="alert"` | **PASS** | `checks.login.formLogin.pass=true`, `passwordInUrl=false`, landed `/dashboard`; `checks.keyboardLogin` Enter → `/dashboard`, `nativeGetSubmitLeak=false`; `checks.invalidLogin.errorElement.role="alert"`, `aria-live="assertive"`, `finalUrl=/login` (no query). `screenshots-r2/login/1440-invalid-login.png` |
| 2 | `/` serves marketing page | **PASS** | title `ProposalOS - AI Audit Engine for Agencies`, h1 "The AI audit that outperforms agencies." at all 5 widths |
| 3 | App shell + `landmark-one-main` passes on dashboard/proposals/settings; mobile menu at 375 | **PASS** | `shell` facts at every viewport on `/dashboard`, `/proposals`, `/settings/*`, `/schedules`, `/analytics`: `navPrimary/mainId/skipLink/signOutButton=true`; hamburger visible at 320/375, hidden ≥768. `landmark-one-main` passes on all 16 `(dashboard)` axe runs. `checks.mobileMenu`: `aria-expanded` false→true, `#mobile-nav` visible with 11 links; `screenshots-r2/dashboard/375-mobile-menu-open.png`. **Caveat:** `/new-audit` and `/audit/[id]` are outside the `(dashboard)` group and have **no shell** (see D-01) |
| 4 | `/dashboard`, `/settings/billing` no longer crash | **PASS** | `retryDashboardText=false`, `errorBoundaryText=false` at all 10 viewport loads; dashboard shows 25 audits / 20 rows page 1; billing shows plan card + invoice table |
| 5 | `/settings/team` shows real member | **PASS** | `hasDemoUser=true`, `hasDemoEmail=true`, no "Alice"/"Bob"/`@example.com`; row "DE Demo User demo@acme.com Owner" |
| 6 | `/settings/branding` dark inputs, all labelled, no overflow at 320/375 | **PARTIAL FAIL** | Dark: PASS (`.input-dark` now defined: `rgb(15,23,42)` bg, 1px `#334155` border, 8px radius on all 6 text inputs). Labelled: **FAIL** — `input[name="contactEmail"]` has no `id`, so `Field`'s `htmlFor="field-public-email"` points nowhere → axe `label` critical (1 node; was 7). Overflow: **FAIL visually** — `document.scrollWidth` is now 375 only because the container gained `overflow-x-hidden`; the cards are 359px wide inside a 295px column and are **clipped at the right edge** (right=399 at 375; right=399 at 320). `screenshots-r2/settings-branding/375.png`, `/320.png` |
| 7 | Dashboard status `<select>` has `aria-label`; table scroll region focusable | **PASS** | `select[aria-label="Filter by status"]`; wrapper `div.overflow-x-auto[tabindex="0"][role="region"][aria-label="Audits table"]`; `select-name` and `scrollable-region-focusable` no longer fire on `/dashboard` |
| 8 | Keyboard on `/dashboard`: Tab → skip link first, then nav links; focus-visible | **PASS** | Tab trail: `a[href=#main] "Skip to main content"` (becomes visible on focus, 150×36 at 16,16) → logo `a[href=/dashboard]` → Audits → Proposals → Schedules → Analytics; 6/6 focus-visible (`ring-2` box-shadow / `outline solid 2px`). Activating skip link sets `#main`, next Tab lands inside `<main>` ("onboarding wizard" link) |

## Matrix

Legend: ✅ renders as designed · ⚠️ renders with defect · ❌ broken. Screenshots: `evidence/screenshots-r2/<surface>/<width>.png`. "Clip" = elements extend past the right viewport edge without a page scrollbar (new `visualOverflow` metric; entries inside an intentional `overflow-x-auto` region are marked *scroll*).

| Surface | State | 320 | 375 | 768 | 1024 | 1440 | Axe crit/ser (375 / 1440) | Overflow / clip | Result |
|---|---|---|---|---|---|---|---|---|---|
| `/` marketing | public | ✅ | ⚠️ header shows only "Get Free Score"; Log In / nav hidden, no hamburger; ~150px dead space under hero CTA | ✅ | ✅ | ✅ | 0/1 · 0/1 (11 contrast nodes) | none | ⚠️ No mobile nav / login entry; footer contrast |
| `/login` | unauth | ✅ | ✅ | ✅ | ✅ | ✅; 200% zoom ✅ | 0/1 · 0/1 | none | ✅ Functional (POST, alert, keyboard) |
| `/register` | unauth | ✅ | ✅ | ✅ | ✅ | ✅ | 0/0 · 0/0 | none | ✅ (no `<main>` landmark — auth layout) |
| `/dashboard` | auth | ⚠️ **overflow 383>320**: "Batch Audit"/"+ New Audit" wrap to 2–3 lines, "+ New Audit" cut off; table 470px | ⚠️ **overflow 383>375**, same | ⚠️ header cramped: "Settings" (r=581) overlaps "New audit" (l=575); New audit / Sign out wrap to 2 lines | ✅ | ✅; 200% zoom ⚠️ header collision (see note) | 0/2 · 0/1 | **Yes @320, @375** | ⚠️ Works; duplicate "ProposalOS / Operator Dashboard" wordmark under the app header; Cost `$0.00`, Client Score `-` on every row |
| `/new-audit` | auth | ✅ | ✅ | ✅ | ✅ | ✅ | 0/1 · 0/1 | none | ⚠️ **No app shell** (no nav/main/sign-out) — dead end except browser Back |
| `/audit/<id>` | auth | ✅ | ✅ | ✅ | ✅ | ✅ (CSP style errors gone) | 0/1 · 0/1 | none | ⚠️ **No app shell**; "Back to Dashboard" now → `/dashboard` ✅; `Duration –`, `Cost $0.00`, `gbp` raw enum, double gap "Phoenix    • Created" |
| `/proposals` | auth | ✅ (table *scroll* 432) | ✅ | ✅ | ✅ | ✅ | 0/1 · 0/0 | *scroll* only | ✅ Empty state text present; header logo unnamed @375 |
| `/settings/billing` | auth | ⚠️ **overflow 324>320** (plan card + settings tabs) | ✅ (tabs *scroll* to 455) | ✅ | ✅ | ✅ | 0/2 · 0/1 (9 contrast) | **Yes @320** | ⚠️ "Agency $599/mo" + "Billing status: Inactive" contradict; content in `max-w-4xl` while sibling pages are full-width |
| `/settings/branding` | auth | ⚠️ cards **clipped** (right 399) | ⚠️ cards **clipped** (right 399), Save button cut | ✅ | ✅ | ✅ | 1/2 · 1/1 | **Clip @320, @375** (masked by `overflow-x-hidden`) | ⚠️ Inputs dark ✅; `contactEmail` unlabelled; two `<h1>`; Save is a simulated `alert()` |
| `/settings/team` | auth | ✅ | ✅ | ✅ | ✅ | ✅ | 0/1 · 0/0 | *scroll* only | ✅ Real member; "+ Invite Member" untested |
| `/pricing` | public (auth ctx) | ✅ | ✅ | ✅ | ✅ | ✅ footer collision fixed | 0/1 · 0/1 (10 contrast) | none | ⚠️ Shows "Log In" while authenticated; 3 `href="#"` footer links |
| `/free-audit` | public | ✅ | ⚠️ placeholder truncation | ✅ | ✅ | ✅ | 0/1 · 0/1 | none | ⚠️ Placeholder-as-label |
| `/schedules` | auth | ✅ | ✅ | ✅ | ✅ | ✅ | 0/1 · 0/0 | none | ✅ Good empty state |
| `/analytics` | auth | ⚠️ **overflow 348>320** (Export CSV/Refresh row; tables) | ✅ (tables *scroll* 384) | ✅ | ✅ | ✅ | 1/2 · 1/0 | **Yes @320** | ⚠️ Date-range `<select>` unnamed (critical); 2 table wrappers not focusable @375; Module Reliability card 60% empty at ≥1024 |
| `/proposal/<token>` | public | — | — | — | — | — | — | — | Not tested (0 proposals) |

Totals: **74 screenshots**, **28 axe runs**, violations **critical 4 / serious 26 / moderate 30 / minor 0**.

## Assertions

| Check | R1 | R2 | Detail |
|---|---|---|---|
| Unauth `/dashboard` → `/login` | PASS | **PASS** | 307 → `/login?callbackUrl=%2Fdashboard` |
| Invalid login: error + `role="alert"` + no password in URL | FAIL | **PASS** | `<div role="alert" aria-live="assertive">Invalid email or password</div>`; URL stays `/login` |
| Keyboard `/login`: Tab order, Enter submits via JS | order PASS / submit FAIL | **PASS** | email → password → Sign In → Google → Create an account; Enter → `/dashboard`; no leak |
| Form login (auth context) | FAIL → API fallback | **PASS (browser form)** | `__Host-next-auth.session-token` Secure/HttpOnly/Strict |
| Keyboard `/dashboard`: skip link first, nav next, focus-visible, skip link works | FAIL | **PASS** | see change #8 |
| Mobile menu @375 | n/a | **PASS** (with defects) | Opens, 11 links. **Escape does not close it**, focus does not move into the menu, second `nav[aria-label="Primary"]` duplicates the desktop landmark label, no Sign out inside the menu (header Sign out remains visible) |
| Team shows real members | n/a | **PASS** | |
| Branding inputs dark + labelled | n/a | **FAIL** | `contactEmail` unlabelled |
| Dashboard select `aria-label` + scroll region `tabindex=0` | n/a | **PASS** | |
| Sign out: `/dashboard` → click Sign out → `/login`; `/dashboard` redirects again | n/a | **PASS** | Landed `http://localhost:3000/login`; session cookies cleared; `/dashboard` → 307 → `/login?callbackUrl=%2Fdashboard`. **Server log** on the same request: `Failed to revoke session on signOut — prisma.session.update(): Record to update not found` (`lib/auth.ts:260`) |
| 200% zoom `/login`, `/dashboard` @1440 | PASS | PASS (login) / ⚠️ (dashboard) | CSS `zoom:2` (720px effective). Login clean. Dashboard header: "New audit" overlaps "Analytics/Settings", "Sign out" wraps — same collision seen at a real 768px viewport, so it is a real 720–~900px header bug, not only a zoom artefact (CSS zoom does not re-evaluate media queries, so the `md:` nav stays visible) |

## Defects (concrete, ranked)

| ID | Sev | Surface / viewport | What is wrong | File hint |
|---|---|---|---|---|
| D-01 | **P1** | `/new-audit`, `/audit/[id]` all viewports | Outside the `(dashboard)` route group → no header, nav, `<main>`, skip link or Sign out. `landmark-one-main` fails; both are dead ends. | `app/new-audit/page.tsx`, `app/audit/[id]/` — move under `app/(dashboard)/` or wrap in `AppShell` (`app/(dashboard)/layout.tsx`) |
| D-02 | **P1** | `/dashboard` @320/375 | Horizontal overflow 383px: `div.flex.gap-3` with "Batch Audit" / "+ New Audit" does not wrap; audits table 470px wide (scrollable, but the header row is not). | `app/dashboard/DashboardClient.tsx:25-32` (add `flex-wrap`/stack <sm), `app/dashboard/AuditTable.tsx` |
| D-03 | **P1** | `/settings/branding` @320/375 | Cards 359px in a 295px column, clipped at right (Save button cut off). `overflow-x-hidden` on the container hides the scrollbar but not the clipping. Root cause: `.container` from `globals.css` adds 1.5rem padding on top of `AppShell`'s `px-4`, and the Colors grid (`sm:grid-cols-3`) plus `p-6` cards set a min-content width. | `app/(dashboard)/settings/branding/page.tsx:70` (`container … px-4 overflow-x-hidden`), `:125`, `app/globals.css:314` |
| D-04 | **P1** | `/dashboard` header @768–~900 and 200% zoom | Primary nav + "New audit" + tenant block + "Sign out" do not fit: "Settings" overlaps "New audit" by 6px, both buttons wrap to two lines (h=52/54 vs 32). | `app/(dashboard)/components/AppShell.tsx:56-130` — hide `New audit` text or tenant block below `lg`, or raise the hamburger breakpoint to `lg` |
| D-05 | **P1** | All `(dashboard)` pages @<640 (7 surfaces, axe `link-name` serious) | Header logo `<Link>` has no accessible name when `ProposalOS` text is `hidden sm:inline` and the "P" mark is `aria-hidden`. | `app/(dashboard)/components/AppShell.tsx:58-66` — add `aria-label="ProposalOS home"` |
| D-06 | **P1** | `/analytics` (axe `select-name` critical, `scrollable-region-focusable` ×2 @375) | Date-range `<select>` has no label; both table wrappers scroll horizontally but are not focusable. | `app/(dashboard)/analytics/page.tsx:75`, `:189`, `:226` |
| D-07 | **P1** | `/settings/branding` (axe `label` critical) | `input[name="contactEmail"]` has no `id`, so `Field`'s `htmlFor="field-public-email"` is dangling. | `app/(dashboard)/settings/branding/page.tsx:188-194` |
| D-08 | **P2** | Mobile menu (`/dashboard` @375) | Escape does not close; focus stays on the toggle; `#mobile-nav` duplicates `aria-label="Primary"` (two identical landmarks when open); no Sign out inside menu. | `app/(dashboard)/components/AppShell.tsx:118-152` |
| D-09 | **P2** | `/` marketing @<768 | Header nav and "Log In" are `hidden md:flex` with no mobile toggle — only "Get Free Score" survives; no way to log in from the mobile landing header. | `app/(marketing)/layout.tsx:26-45` |
| D-10 | **P2** | Sign out (server) | `signOut` event calls `prisma.session.update` for a jti that has no row → logged error on every sign-out; cookie is cleared so the user is fine, but revocation is not recorded. | `lib/auth.ts:245-262` |
| D-11 | **P2** | `/dashboard` @1440 (axe `color-contrast`, 20 nodes) | `Phoenix • General` sub-lines `#71717a` on `#0a0d1e` (3.98:1). `/settings/billing` 9 nodes `#64748b` on `#0f172a` (3.75:1). `/`, `/pricing` footer `#475569` (2.51:1). | `app/dashboard/AuditTable.tsx` (`--color-text-muted`), `app/(dashboard)/settings/billing/page.tsx`, `app/(marketing)/layout.tsx` footer |
| D-12 | **P2** | `/settings/billing` @320 | Overflow 324px: plan card and settings tab strip. `max-w-4xl mx-auto p-8` adds 32px padding on top of shell padding. | `app/(dashboard)/settings/billing/page.tsx:60` |
| D-13 | **P2** | `/analytics` @320 | Overflow 348px: `Last 30 Days` select + Export CSV + Refresh in a non-wrapping `flex gap-3`. | `app/(dashboard)/analytics/page.tsx:70-90` |
| D-14 | **P2** | `/settings/branding` | "Save Changes" is simulated (`await new Promise(…1000)`; `alert('Branding saved!')`; fetch commented out). | `app/(dashboard)/settings/branding/page.tsx:58-63` |
| D-15 | **P3** | `/dashboard` all | Second "ProposalOS" wordmark + "Operator Dashboard" H1 rendered inside the page under the app header (legacy `DashboardClient` header); the app header already carries the brand. | `app/dashboard/DashboardClient.tsx:18-24` |
| D-16 | **P3** | `/audit/[id]` | `Duration –`, `Cost $0.00`, raw `gbp` category, double gap when industry null (unchanged from R1). | `app/audit/[id]/AuditDetailClient.tsx:63-78,125-131` |
| D-17 | **P3** | `/settings/branding` | Two `<h1>` (page title + preview "Digital Audit: Client Business"); `heading-order` h1→h3. | `app/(dashboard)/settings/branding/page.tsx:71`, preview block |
| D-18 | **P3** | `/pricing`, `/` (auth) | Marketing header shows "Log In" for an authenticated user. | `app/(marketing)/layout.tsx:43` |

## Not tested / limitations

- `/proposal/<token>`: no proposals seeded.
- Interactive flows beyond first form (create audit, batch modal, invite member, save branding) — not exercised; branding save is known-mock (D-14).
- 200% zoom is CSS `zoom:2` on `<html>` — media queries are not re-evaluated, so the header collision at zoom is corroborated with the real 768px capture instead.
- Overflow metric: `horizontalOverflow` = `scrollWidth > innerWidth`; `visualOverflow`/`overflowers` list every element whose right edge exceeds the viewport, including content inside intentional `overflow-x-auto` regions (settings tab strip, tables) — interpret with the screenshot.
- The app process exited once during an R2 attempt (06:05:22, after `/settings/billing`@375; `ERR_CONNECTION_REFUSED`, no stack in `/tmp/app-g3.log`). Restarted with `/tmp/start-g3.sh`; the reported run completed without incident. Worth watching for memory pressure under repeated full-page loads.
