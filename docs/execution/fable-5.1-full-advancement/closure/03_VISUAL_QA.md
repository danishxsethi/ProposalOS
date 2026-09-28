# 03 — Visual QA (screenshot review)

Reviewed: 63 as-shipped screenshots (`evidence/screenshots/`) plus the CSP-bypass set (`evidence-csp-bypass/screenshots/`) to see the hydrated state. Ranked by severity. "As shipped" = what a browser shows today; "hydrated" = the diagnostic pass.

## Severity 1 — blocks a user journey

### V-01 Dashboard is an error card (all viewports)
`dashboard/1440.png`, `dashboard/320.png` — a centered card "DASHBOARD ERROR / The dashboard failed to load / Retry dashboard" on an empty black page. Identical when hydrated. No header, no nav, no account menu, no way out except Retry (which fails again). The demo owner cannot use the product.
- Cause: `MissingTenantError` from `prisma.tenant.findUnique` outside tenant context.
- Files: `app/(dashboard)/dashboard/page.tsx:17-23`, `app/(dashboard)/dashboard/error.tsx`.

### V-02 Billing is an error card (all viewports)
`settings-billing/1440.png` — "APPLICATION ERROR / Something went wrong / Try again · Go home". Same root cause as V-01. "Go home" leads to `/`, which is the legacy operator dashboard (V-04), not `/dashboard`.
- Files: `app/(dashboard)/settings/billing/page.tsx:16-24`, `app/error.tsx`.

### V-03 Every list page is a permanent skeleton / empty shell as shipped
`root/1440.png` — four KPI cards with grey placeholder bars and five rows of grey skeleton bars; never resolves. `settings-team/1440.png` — "Active Members" header bar with nothing under it. `proposals/1440.png` — table header with zero rows. The skeleton has no timeout or error state, so the user has no signal that anything is wrong.
- Cause: CSP nonce mismatch prevents hydration (01 · D-01). Skeletons never swap to data because SWR never runs.
- Files: `middleware.ts:59-80`; `app/dashboard/StatsBar.tsx`, `app/dashboard/AuditTable.tsx` (no loading timeout / error fallback).

### V-04 `/` is the wrong product surface
`root/1440.png` (hydrated: `evidence-csp-bypass/screenshots/root/1440.png`) — the root of the site is an "Operator Dashboard" with "Batch Audit" / "+ New Audit" buttons and a 25-row audit table, not the marketing landing page in `app/(marketing)/page.tsx`. Anonymous visitors see this skeleton too (API returns 401 so it never fills). Two competing dashboards exist (`/` via `app/page.tsx` → `DashboardClient`, and `/dashboard` via `app/(dashboard)/dashboard/page.tsx`) with different visual systems (purple gradient "ProposalOS" wordmark vs. slate cards).
- Files: `app/page.tsx:1-5`, `app/dashboard/DashboardClient.tsx`, `app/(marketing)/page.tsx`.

### V-05 Team page shows fake people
`evidence-csp-bypass/screenshots/settings-team/1440.png` — "Alice Owner alice@example.com · Owner · Remove", "Bob Admin bob@example.com · Admin · Remove". The tenant's only real user is `demo@acme.com`. Technical leakage of placeholder data into a production surface; "Remove" is a destructive control acting on nothing.
- File: `app/(dashboard)/settings/team/page.tsx:13-18` (`// const res = await fetch('/api/team')` commented out).

## Severity 2 — visibly broken layout / styling

### V-06 Branding page: unstyled inputs and mobile overflow
`settings-branding/1440.png` — Brand Name, Tagline, Public Email and the three hex inputs render as flat **white rectangles with no padding, border-radius or dark theme**; the hex values (`#8B5CF6` etc.) are white text on white and invisible. `settings-branding/375.png`, `/320.png` — right edge of every card and the "Save Changes" button is cut off by the viewport (scrollWidth 383 > 375/320); the "Live Preview" panel below also overflows.
- Cause: class `input-dark` is referenced but not defined anywhere in CSS; `grid lg:grid-cols-2 gap-12` + sticky preview + `.container` padding exceed the small viewport.
- Files: `app/(dashboard)/settings/branding/page.tsx:73,83`, `app/globals.css` (no `.input-dark`).

### V-07 Page headings flush against the viewport top
`proposals/1440.png` ("Proposals" starts at y≈0), `settings-branding/1440.png`, `settings-team/1440.png` ("Team Management" clipped against the top edge, "+ Invite Member" button touching the top). Pages use `className="container … py-10 px-4"` but `globals.css` redefines `.container { padding: 0 1.5rem }` after `@tailwind utilities`, killing the vertical padding.
- Files: `app/globals.css:314-318`; `app/(dashboard)/proposals/page.tsx:72`, `app/(dashboard)/settings/branding/page.tsx:70`, `app/(dashboard)/settings/team/page.tsx`.

### V-08 Root dashboard header overflows at 320
`root/320.png` — "ProposalOS" wordmark, "Batch Audit" and "+ New Audit" are forced onto one line; "+ New Audit" wraps to three lines and is clipped at the right edge (scrollWidth 367). The audit table also overflows with only Business/Status/"Fi…" visible.
- File: `app/dashboard/DashboardClient.tsx` header `flex` row (needs `flex-wrap`), `app/dashboard/AuditTable.tsx`.

### V-09 Pricing footer collision
`pricing/1440.png` — the bottom divider line and "© 2026 ProposalOS. All rights reserved." are drawn through/over the last items of the link columns ("API Docs", "Success Stories" are bisected by the rule). The footer grid has insufficient bottom spacing before the `mt-8 pt-8 border-t` copyright block. Also "Success Stories", "Privacy Policy", "Terms of Service" are `href="#"` dead links.
- File: `app/(marketing)/layout.tsx:58-125`.

### V-10 Audit detail: placeholder metrics and dead-end back link
`audit-detail/1440.png` — for a COMPLETE audit the KPI row shows `Cost $0.00` and `Duration –`, which reads as broken telemetry rather than "free"/"n/a". Sub-line reads `Phoenix    • Created 9/28/2026` with a double gap where industry is null (the bullet separator belongs to the missing middle item). Finding category tag renders raw enum text `gbp` (lower-case) next to `Conversion • website`. "← Back to Dashboard" navigates to `/` (legacy dashboard), not `/dashboard`. Findings grid: Painkillers column has 2 cards, Vitamins has 1, leaving a large empty area under Vitamins at ≥1024.
- File: `app/audit/[id]/AuditDetailClient.tsx:63-78, 120-131`.

## Severity 3 — hierarchy / polish

### V-11 No global chrome anywhere in the authenticated app
Every authenticated screenshot (`new-audit`, `audit-detail`, `proposals`, `settings-*`) is a bare page with no header, sidebar, breadcrumb or account menu. `/new-audit` is a centered card with no way back. Settings pages have no tab bar linking Billing / Branding / Team / Domain / API keys etc. The only "nav" is the marketing header, which shows "Log In" even when authenticated (`pricing/1440.png`).
- Files: missing `app/(dashboard)/layout.tsx`; `app/(marketing)/layout.tsx:43`.

### V-12 Two design systems
Legacy surfaces (`/`, `/audit/[id]`) use CSS-variable tokens (`--color-bg-card`, purple→blue gradient buttons, `.card`/`.btn` classes). Newer surfaces (`/dashboard` error, `/settings/*`, `/login`) use Tailwind slate palette with flat blue buttons. Border radii, card backgrounds and button styles differ visibly between `root/1440.png` and `settings-team/1440.png`.

### V-13 Empty states missing
`proposals/1440.png` — bare table header, no "No proposals yet — generate one from an audit" message or CTA. `settings-team/1440.png` (as shipped) — "Active Members" header with nothing. `root/*.png` skeleton has no "still loading…"/error fallback.
- Files: `app/(dashboard)/proposals/page.tsx:75-80`, `app/(dashboard)/settings/team/page.tsx`, `app/dashboard/AuditTable.tsx`.

### V-14 Placeholder-as-label truncation on mobile
`free-audit/375.png` — inputs rely on placeholders ("Business Name (e.g. Acme De", "Website URL (e.g. acmedental") which truncate at 375 and disappear on focus. Low-contrast helper text "No credit card required. Instant results." (3.75:1).
- File: `app/(public)/free-audit/page.tsx`.

### V-15 Low-contrast helper text is systemic
12px `text-slate-500` / `text-gray-500` / `--color-text-muted` on near-black backgrounds on `/login` ("Or continue with"), `/new-audit` (footer note), `/audit/[id]` (category tags), `/settings/branding` ("Requires Agency Plan…", "Powered by ProposalOS"), `/pricing` (entire footer), `/free-audit`. All between 2.5:1 and 4:1. See 02 for exact selectors.

### V-16 Branding page has two `<h1>`s
`settings-branding/1440.png` — page title "Branding & Customization" and the live-preview headline "Digital Audit: Client Business" are both `<h1>`; the preview should use a non-heading element or be wrapped in an inert region.
- File: `app/(dashboard)/settings/branding/page.tsx` preview block.

## Things that looked right
- `/login`, `/register`: clean, centered, consistent spacing at every viewport; focus rings visible; 200% zoom has no clipping (`login/1440-zoom200.png`).
- `/new-audit` card layout and the "Business Name | Website URL" segmented toggle are well proportioned at all widths.
- `/audit/[id]` @375 stacks cleanly (KPI cards → Painkillers → Vitamins) with no overflow.
- `/pricing` plan cards and hero are balanced at all viewports (footer aside).
- `/free-audit` hero + card centered and readable at all widths (placeholder truncation aside).
