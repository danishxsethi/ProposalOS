# 02 — Accessibility (axe-core) Results

**Tool:** axe-core via `@axe-core/puppeteer` (bundled axe 4.x), tags `wcag2a, wcag2aa, wcag21a, wcag21aa, best-practice`. Run at 375×740 and 1440×900 on 12 surfaces = **24 runs** (as-shipped pass). Raw JSON per run: `evidence/axe/<surface>-<width>.json`. Diagnostic (CSP-bypass) pass JSON: `evidence-csp-bypass/axe/`.

**Totals (as-shipped):** critical **4**, serious **13**, moderate **50**, minor **0** (violation *rules* per run, summed). Diagnostic pass: 4 / 14 / 50 / 0 — the extra serious is `scrollable-region-focusable` on `/`@1440 once the audits table actually renders.

Important caveat: because the as-shipped build does not hydrate most pages (see 01, D-01), axe evaluated the **SSR shell**. Interactive states (modals, dropdowns, error banners, table rows loaded via SWR) were not present on `/`, `/proposals`, `/settings/team`. Real-world violation counts will be higher once those render.

## Per-surface summary

| Surface | Viewport | Crit | Ser | Mod | Min | Critical/serious rule ids |
|---|---|---|---|---|---|---|
| `/` | 375 | 1 | 1 | 2 | 0 | `select-name`, `scrollable-region-focusable` |
| `/` | 1440 | 1 | 0 | 2 | 0 | `select-name` |
| `/login` | 375 | 0 | 1 | 2 | 0 | `color-contrast` |
| `/login` | 1440 | 0 | 1 | 2 | 0 | `color-contrast` |
| `/register` | 375 | 0 | 0 | 2 | 0 | — |
| `/register` | 1440 | 0 | 0 | 2 | 0 | — |
| `/dashboard` (error boundary) | 375 | 0 | 0 | 3 | 0 | — |
| `/dashboard` (error boundary) | 1440 | 0 | 0 | 3 | 0 | — |
| `/new-audit` | 375 | 0 | 1 | 2 | 0 | `color-contrast` |
| `/new-audit` | 1440 | 0 | 1 | 2 | 0 | `color-contrast` |
| `/audit/<id>` | 375 | 0 | 1 | 2 | 0 | `color-contrast` (3 nodes) |
| `/audit/<id>` | 1440 | 0 | 1 | 2 | 0 | `color-contrast` (3 nodes) |
| `/proposals` | 375 | 0 | 0 | 2 | 0 | — |
| `/proposals` | 1440 | 0 | 0 | 2 | 0 | — |
| `/settings/billing` (error boundary) | 375 | 0 | 0 | 2 | 0 | — |
| `/settings/billing` (error boundary) | 1440 | 0 | 0 | 2 | 0 | — |
| `/settings/branding` | 375 | 1 | 1 | 3 | 0 | `label` (7 nodes), `color-contrast` (2) |
| `/settings/branding` | 1440 | 1 | 1 | 3 | 0 | `label` (7 nodes), `color-contrast` (2) |
| `/settings/team` | 375 | 0 | 0 | 2 | 0 | — |
| `/settings/team` | 1440 | 0 | 0 | 2 | 0 | — |
| `/pricing` | 375 | 0 | 1 | 1 | 0 | `color-contrast` (10 nodes) |
| `/pricing` | 1440 | 0 | 1 | 1 | 0 | `color-contrast` (10 nodes) |
| `/free-audit` | 375 | 0 | 1 | 2 | 0 | `color-contrast` |
| `/free-audit` | 1440 | 0 | 1 | 2 | 0 | `color-contrast` |
| `/proposal/<token>` | — | — | — | — | — | not tested (no proposal seeded) |

## Critical violations (exact rule, selector, fix location)

### `select-name` — `/` @375 and @1440 (WCAG 4.1.2)
- Selector: `select` — `<select class="px-4 py-2 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg text-sm …">` (status filter "All Statuses")
- Message: *Element does not have an implicit (wrapped) `<label>`; no `aria-label`/`aria-labelledby`/`title`*
- File: `app/dashboard/AuditTable.tsx` (status filter select). Fix: `aria-label="Filter by status"` or a visible `<label htmlFor>`.

### `label` — `/settings/branding` @375 and @1440, 7 nodes (WCAG 4.1.2 / 1.3.1)
| Selector | HTML |
|---|---|
| `input[name="primaryColor"][type="color"]` | `<input type="color" class="h-10 w-10 rounded cursor-pointer" name="primaryColor" value="#8B5CF6">` |
| `.font-mono[name="primaryColor"]` | `<input class="input-dark w-full font-mono text-sm" name="primaryColor" value="#8B5CF6">` |
| `input[name="secondaryColor"][type="color"]` | `<input type="color" … name="secondaryColor" value="#38BDF8">` |
| `.font-mono[name="secondaryColor"]` | `<input class="input-dark w-full font-mono text-sm" name="secondaryColor" value="#38BDF8">` |
| `input[name="accentColor"][type="color"]` | `<input type="color" … name="accentColor" value="#F59E0B">` |
| `.font-mono[name="accentColor"]` | `<input class="input-dark w-full font-mono text-sm" name="accentColor" value="#F59E0B">` |
| `input[name="contactEmail"]` | `<input class="input-dark w-full" name="contactEmail" value="">` |
- Cause: `Field` helper renders `<label className="block …">{label}</label>` with **no `htmlFor`** and does not wrap the control; the two color/hex inputs per field share one label anyway. `app/(dashboard)/settings/branding/page.tsx:124-190` and `:284-289`.
- Note: the same unassociated-label pattern exists on `/login` (`app/(auth)/login/page.tsx:56-73`) and `/register`; axe passes them only because the inputs have `placeholder` text. Placeholder is not an acceptable label (disappears on input; low contrast).

## Serious violations

### `color-contrast` (WCAG 1.4.3) — 8 surfaces
| Surface | Selector | Ratio | Colors | HTML / text | File hint |
|---|---|---|---|---|---|
| `/login` | `span` | 3.07 | `#64748b` on `#1e293b`, 14px | `<span class="px-2 bg-slate-800 text-slate-500">Or continue with</span>` | `app/(auth)/login/page.tsx:97` |
| `/new-audit` | `.mt-6` | 3.03 | `#6b7280` on `#1f2937`, 12px | `<p class="mt-6 text-xs text-gray-500 text-center">The audit will analyze…` | `app/new-audit/page.tsx` / `components/AuditForm.tsx` |
| `/audit/<id>` | 3× `.mt-2.text-[var(--color-text-muted)].text-xs` | 3.89 | `#71717a` on `#111116`, 12px | `Conversion • website`, `UX • website`, `Reputation • gbp` | `app/audit/[id]/AuditDetailClient.tsx` finding cards; token `--color-text-muted` in `app/globals.css` |
| `/settings/branding` | `.text-slate-500` | 3.66 | `#64748b` on `#141a25`, 12px | `Requires Agency Plan to disable.` | `app/(dashboard)/settings/branding/page.tsx:202` |
| `/settings/branding` | `.opacity-50` | 2.68 | `#525d71` on `#0f172a`, 12px | `Powered by ProposalOS` (live preview footer) | `app/(dashboard)/settings/branding/page.tsx` preview |
| `/pricing` | `.space-y-4 > .text-slate-500` + 8 footer `a.hover:text-indigo-400` | 4.00 | `#64748b` on `#090f21`, 14px | footer tagline + links For Agencies, Sample Report, API Docs, Blog, Free Audit, Success Stories, Privacy Policy, Terms of Service | `app/(marketing)/layout.tsx` footer |
| `/pricing` | `.mt-8` | 2.51 | `#475569` on `#090f21`, 12px | `© 2026 ProposalOS. All rights reserved.` | `app/(marketing)/layout.tsx` footer |
| `/free-audit` | `.mt-4` | 3.75 | `#64748b` on `#0f172a`, 12px | `No credit card required. Instant results.` | `app/(public)/free-audit/page.tsx` |

Root cause is systemic: `text-slate-500`/`text-gray-500`/`--color-text-muted` used for 12–14px helper text on near-black backgrounds. Bumping to `slate-400` (`#94a3b8`) clears all of them.

### `scrollable-region-focusable` (WCAG 2.1.1) — `/` @375
- Selector: `.overflow-x-auto` — the audits table wrapper scrolls horizontally on mobile but is not reachable by keyboard.
- File: `app/dashboard/AuditTable.tsx`. Fix: `tabIndex={0}` + `role="region"` + `aria-label="Audits table"` on the wrapper.

## Moderate (best-practice) — present on every surface
- `landmark-one-main` (12/12 surfaces): no `<main>` anywhere. `app/layout.tsx:26` renders `<body>{children}</body>`; no `app/(dashboard)/layout.tsx`.
- `region` (12/12): all content outside landmarks — same root cause.
- `page-has-heading-one`: `/dashboard` error boundary uses `<h2>` (`app/(dashboard)/dashboard/error.tsx:8`).
- `heading-order`: `/settings/branding` (`h1` → `h3` "Identity"), `/pricing` (`h1` → `h3` plan names). Also `/settings/branding` renders **two `<h1>`** (page title + live-preview "Digital Audit: Client Business").

## Keyboard / focus findings (manual, from `browser-matrix.mjs` checks)
- `/login`: Tab order email → password → Sign In → Google → Create an account. Focus visible on all (inputs: `focus:ring-2 ring-blue-500` box-shadow; buttons/link: UA `outline: auto 1px`). Enter submits — but as shipped the submit is a native GET that puts the password in the URL (D-01).
- `/login` error message (`app/(auth)/login/page.tsx:77`) has no `role="alert"`/`aria-live`; screen-reader users are not told the login failed.
- `/dashboard`: no `<nav>`, no `<main>`, no skip link. As shipped the only focusable element is "Retry dashboard" (error boundary). No page in the authenticated app exposes navigation to keyboard users.
- `/register`, `/new-audit`, `/settings/*`, `/free-audit` forms: not keyboard-testable end to end as shipped (no hydration).
- 200% zoom (`/login`, `/dashboard` @1440): no clipping or overflow.

## Not covered
- Screen-reader announcement order and live-region behaviour (axe does not test; would need NVDA/VoiceOver).
- Colour-contrast of hover/focus states.
- Public proposal page — no data.
