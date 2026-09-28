# 02 — Accessibility (axe-core) Results — R2

**Tool:** axe-core via `@axe-core/puppeteer` (axe 4.x), tags `wcag2a, wcag2aa, wcag21a, wcag21aa, best-practice`. Run at 375×740 and 1440×900 on 14 surfaces = **28 runs**, as-shipped CSP. Raw JSON: `evidence/axe-r2/<surface>-<width>.json`. Counts are violation *rules* per run, summed (node counts in parentheses).

## R1 → R2 delta

| | R1 (24 runs, 12 surfaces) | R2 same 12 surfaces | R2 all 14 surfaces |
|---|---|---|---|
| Critical | 4 | **2** | 4 |
| Serious | 13 | **23** | 26 |
| Moderate | 50 | **26** | 30 |
| Minor | 0 | 0 | 0 |

- **Fixed:** `select-name` on the dashboard status filter (now `aria-label="Filter by status"`); `label` on branding dropped from 7 nodes to 1; `landmark-one-main` + `region` gone from all 8 `(dashboard)` surfaces (16 runs) — they remain only on `/login`, `/register`, `/new-audit`, `/audit/[id]`, `/free-audit`; `page-has-heading-one` gone from `/dashboard` (no longer an error boundary); `scrollable-region-focusable` fixed on the dashboard audits table; `/audit/[id]` inline-style CSP errors gone.
- **New (regressions or newly exposed):** `link-name` serious on **7 surfaces @375** — the app-shell logo link has no name below `sm`; `color-contrast` on `/dashboard` (20 nodes) and `/settings/billing` (9 nodes) now that real content renders; `/analytics` adds `select-name` **critical** + 2× `scrollable-region-focusable`; `heading-order` on `/schedules`, `/analytics`, `/` (h1→h3/h4).
- Important context for R1 numbers: R1 axe ran against un-hydrated SSR shells (error boundaries, skeletons). R2 is the first run that measures the real UI, so the serious count is a better baseline than a regression signal.

## Per-surface summary

| Surface | VP | Crit | Ser | Mod | `landmark-one-main` | Rules (nodes) |
|---|---|---|---|---|---|---|
| `/` | 375 | 0 | 1 | 1 | pass | color-contrast (11), heading-order (1) |
| `/` | 1440 | 0 | 1 | 1 | pass | color-contrast (11), heading-order (1) |
| `/login` | 375 | 0 | 1 | 2 | **fail** | color-contrast (1), landmark-one-main, region (5) |
| `/login` | 1440 | 0 | 1 | 2 | **fail** | color-contrast (1), landmark-one-main, region (5) |
| `/register` | 375 | 0 | 0 | 2 | **fail** | landmark-one-main, region (6) |
| `/register` | 1440 | 0 | 0 | 2 | **fail** | landmark-one-main, region (6) |
| `/dashboard` | 375 | 0 | 2 | 0 | pass | color-contrast (20), link-name (1) |
| `/dashboard` | 1440 | 0 | 1 | 0 | pass | color-contrast (20) |
| `/new-audit` | 375 | 0 | 1 | 2 | **fail** | color-contrast (1), landmark-one-main, region (5) |
| `/new-audit` | 1440 | 0 | 1 | 2 | **fail** | color-contrast (1), landmark-one-main, region (5) |
| `/audit/<id>` | 375 | 0 | 1 | 2 | **fail** | color-contrast (3), landmark-one-main, region (5) |
| `/audit/<id>` | 1440 | 0 | 1 | 2 | **fail** | color-contrast (3), landmark-one-main, region (5) |
| `/proposals` | 375 | 0 | 1 | 0 | pass | link-name (1) |
| `/proposals` | 1440 | 0 | 0 | 0 | pass | — (clean) |
| `/settings/billing` | 375 | 0 | 2 | 0 | pass | color-contrast (9), link-name (1) |
| `/settings/billing` | 1440 | 0 | 1 | 0 | pass | color-contrast (9) |
| `/settings/branding` | 375 | **1** | 2 | 1 | pass | **label (1)**, color-contrast (2), link-name (1), heading-order (1) |
| `/settings/branding` | 1440 | **1** | 1 | 1 | pass | **label (1)**, color-contrast (2), heading-order (1) |
| `/settings/team` | 375 | 0 | 1 | 0 | pass | link-name (1) |
| `/settings/team` | 1440 | 0 | 0 | 0 | pass | — (clean) |
| `/pricing` | 375 | 0 | 1 | 1 | pass | color-contrast (10), heading-order (1) |
| `/pricing` | 1440 | 0 | 1 | 1 | pass | color-contrast (10), heading-order (1) |
| `/free-audit` | 375 | 0 | 1 | 2 | **fail** | color-contrast (1), landmark-one-main, region (5) |
| `/free-audit` | 1440 | 0 | 1 | 2 | **fail** | color-contrast (1), landmark-one-main, region (5) |
| `/schedules` | 375 | 0 | 1 | 1 | pass | link-name (1), heading-order (1) |
| `/schedules` | 1440 | 0 | 0 | 1 | pass | heading-order (1) |
| `/analytics` | 375 | **1** | 2 | 1 | pass | **select-name (1)**, link-name (1), scrollable-region-focusable (2), heading-order (1) |
| `/analytics` | 1440 | **1** | 0 | 1 | pass | **select-name (1)**, heading-order (1) |
| `/proposal/<token>` | — | — | — | — | — | not tested (no proposal seeded) |

## Critical violations

### `select-name` — `/analytics` @375 and @1440 (WCAG 4.1.2)
- `<select class="bg-slate-800 border border-slate-700 text-slate-300 rounded px-3 py-2 text-sm"><option value="7">Last 7 Days</option>…` — date-range picker, no label/`aria-label`/`title`.
- File: `app/(dashboard)/analytics/page.tsx:75`. Fix: `aria-label="Date range"`.

### `label` — `/settings/branding` @375 and @1440 (WCAG 4.1.2 / 1.3.1), 1 node (was 7)
- `<input class="input-dark w-full" name="contactEmail" value="">` — the `Field` helper now emits `<label htmlFor="field-public-email">` but this input never received `id="field-public-email"` (the other six did).
- File: `app/(dashboard)/settings/branding/page.tsx:188-194`; helper at `:292-302`.

## Serious violations

### `link-name` — 7 surfaces @375 (WCAG 2.4.4 / 4.1.2)
- `/dashboard`, `/proposals`, `/settings/billing`, `/settings/branding`, `/settings/team`, `/schedules`, `/analytics`.
- `<a class="flex shrink-0 items-center gap-2 … " href="/dashboard">` — the app-shell logo. Text "ProposalOS" is `hidden sm:inline`, the "P" tile is `aria-hidden="true"` → empty name below 640px.
- File: `app/(dashboard)/components/AppShell.tsx:58-66`. Fix: `aria-label="ProposalOS — dashboard"` on the `Link`, or use `sr-only` instead of `hidden`.

### `scrollable-region-focusable` — `/analytics` @375 (WCAG 2.1.1), 2 nodes
- `.p-6.overflow-hidden.rounded-xl:nth-child(1) > .overflow-x-auto` and `:nth-child(2) > .overflow-x-auto` — Module Reliability / Common Findings table wrappers.
- File: `app/(dashboard)/analytics/page.tsx:189`, `:226`. Fix as done on the dashboard table: `tabIndex={0} role="region" aria-label="…"`.

### `color-contrast` (WCAG 1.4.3) — 9 surfaces
| Surface | Nodes | Sample selector | Ratio | Colours (fg on bg) | Text | File hint |
|---|---|---|---|---|---|---|
| `/dashboard` | 20 | `td:nth-child(1) > .text-xs` (every row) | 3.98 | `#71717a` on `#0a0d1e`, 14px | `Phoenix • General` | `app/dashboard/AuditTable.tsx`, token `--color-text-muted` in `app/globals.css` |
| `/` | 11 | `.font-medium.text-slate-500.mb-6`; footer links; `.pt-8` | 4.11 / 4.00 / **2.51** | `#64748b` on `#060b1d`; `#475569` on `#090f21` 12px | `TRUSTED BY MODERN AGENCIES`; footer links; `© 2026 ProposalOS…` | `app/(marketing)/page.tsx`, `app/(marketing)/layout.tsx` footer |
| `/pricing` | 10 | footer `.text-slate-500`, `.mt-8` | 4.00 / 2.51 | as above | footer tagline, 8 links, copyright | `app/(marketing)/layout.tsx` footer |
| `/settings/billing` | 9 | `.mt-2`, `.text-lg`, `th`, `td` | 3.75 / 4.23 | `#64748b` on `#0f172a` / `#020617` | `Billing status: inactive`, `/ ∞`, `DATE AMOUNT STATUS INVOICE`, `No invoices yet.` | `app/(dashboard)/settings/billing/page.tsx` |
| `/audit/<id>` | 3 | `.mt-2.text-[var(--color-text-muted)].text-xs` | 3.89 | `#71717a` on `#111116`, 12px | `Conversion • website` etc. | `app/audit/[id]/AuditDetailClient.tsx` |
| `/settings/branding` | 2 | `.text-slate-500`, `.opacity-50` | 3.72 / 2.68 | `#64748b` on `#101829`; `#525d71` on `#0f172a` | `Requires Agency Plan to disable.`, `Powered by ProposalOS` | `app/(dashboard)/settings/branding/page.tsx:202`, preview footer |
| `/login` | 1 | `span` | 3.07 | `#64748b` on `#1e293b`, 14px | `Or continue with` | `app/(auth)/login/page.tsx` |
| `/new-audit` | 1 | `.mt-6` | 3.03 | `#6b7280` on `#1f2937`, 12px | `The audit will analyze…` | `components/AuditForm.tsx` / `app/new-audit/page.tsx` |
| `/free-audit` | 1 | `.mt-4` | 3.75 | `#64748b` on `#0f172a`, 12px | `No credit card required…` | `app/(public)/free-audit/page.tsx` |

Systemic: `text-slate-500` / `text-gray-500` / `--color-text-muted` (`#71717a`) for 12–14px text on near-black. Moving muted text to `slate-400` (`#94a3b8`) and the token to `#a1a1aa` clears every node above except the 2.51:1 copyright (`slate-600`), which needs `slate-400` too.

## Moderate (best-practice)
- `landmark-one-main` + `region` — now only on the 5 surfaces outside `AppShell`: `/login`, `/register` (auth layout), `/new-audit`, `/audit/[id]` (should be in the dashboard group), `/free-audit` (public layout). `app/(auth)/layout.tsx`, `app/new-audit/page.tsx`, `app/audit/[id]/page.tsx`, `app/(public)/layout.tsx` — wrap content in `<main>`.
- `heading-order`: `/` (h1→h4 footer "Product"), `/pricing` (h1→h3 plan names), `/settings/branding` (h1→h3 "Identity"), `/schedules` (h1→h3 "No Active Monitors"), `/analytics` (h1→h3 chart titles). Also `/settings/branding` still renders **two `<h1>`** (page title + live preview "Digital Audit: Client Business").

## Keyboard / focus / interaction findings (scripted, `browser-matrix-results-r2.json → checks`)
- `/login`: Tab order email → password → Sign In → Google → Create an account; all 5 focus-visible; Enter submits via JS (`fetch` POST to Auth.js), lands on `/dashboard`, no query-string leakage. Invalid credentials → `<div role="alert" aria-live="assertive">Invalid email or password</div>`.
- `/dashboard`: first Tab → "Skip to main content" (`a[href="#main"]`, `sr-only focus:not-sr-only`, rendered 150×36 at (16,16) when focused); Enter moves focus start to `<main id="main" tabindex="-1">` (next Tab → "onboarding wizard" link inside main). Then logo → Audits → Proposals → Schedules → Analytics; 6/6 with visible ring (`outline solid 2px` / `ring-2`).
- Mobile menu @375: toggle has `aria-label` "Open menu"/"Close menu", `aria-expanded` toggles, `aria-controls="mobile-nav"`. **Gaps:** Escape does not close it; focus stays on the toggle (no focus move to first item); the opened `<nav id="mobile-nav" aria-label="Primary">` duplicates the desktop `nav[aria-label="Primary"]` label (both are in the DOM — desktop one is `display:none` at <768, so AT sees one, but the duplicate label will surface at ≥768 if the state leaks); no Sign out inside the menu (header Sign out stays visible, so it is reachable). `app/(dashboard)/components/AppShell.tsx:118-152`.
- Status `<select>` on `/dashboard`: `aria-label="Filter by status"`. Audits table wrapper: `tabindex="0" role="region" aria-label="Audits table"`.
- Settings tab strip (`nav[aria-label="Settings"]`, `overflow-x-auto`) scrolls at <640 ("Domain"/"Widget" off-screen at 375) — keyboard-reachable through its links, so axe passes, but there is no visual scroll affordance. `AppShell.tsx:155-178`.
- Sign out: works, redirects to `/login`, cookies cleared, `/dashboard` re-protected. Server logs `Failed to revoke session on signOut` (`lib/auth.ts:254-261`).

## Not covered
- Screen-reader announcement order / live-region behaviour (needs NVDA/VoiceOver).
- Contrast of hover/focus states; contrast inside opened mobile menu.
- Public proposal page — no data.
- Interactive flows beyond first form (create audit, batch modal, invite member).
