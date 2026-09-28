# 03 — Visual QA (screenshot review) — R2

Reviewed: all 74 R2 captures in `evidence/screenshots-r2/` (14 surfaces × 320/375/768/1024/1440, `dashboard/1440-zoom200.png`, `login/1440-zoom200.png`, `login/1440-invalid-login.png`, `dashboard/375-mobile-menu-open.png`). Tall pages were inspected as cropped sections. Ranked by severity; every item names the surface, the viewport(s), what is visibly wrong, and the file to look at.

## R1 → R2 delta

| R1 item | R2 status |
|---|---|
| V-01 Dashboard error card | **Fixed** — `dashboard/1440.png` shows onboarding banner, 4 KPI cards (25 audits), 20-row table with pagination |
| V-02 Billing error card | **Fixed** — plan card, usage card, invoice table (`settings-billing/1440.png`) |
| V-03 Permanent skeletons / empty shells | **Fixed** — all lists render; `proposals/*.png` has an empty-state sentence |
| V-04 `/` is the operator dashboard | **Fixed** — marketing landing at all widths (`root/*.png`) |
| V-05 Team page shows fake people | **Fixed** — "DE Demo User / demo@acme.com / Owner" |
| V-06 Branding unstyled inputs + mobile overflow | **Half fixed** — inputs are dark and readable; **mobile clipping remains** (now masked by `overflow-x-hidden`, see V-02 below) |
| V-07 Headings flush to viewport top | **Fixed** — `AppShell` `<main>` adds `py-8`; titles sit at y≈140–190 |
| V-08 Root dashboard header overflows @320 | **Moved, not fixed** — same `Batch Audit` / `+ New Audit` row now overflows on `/dashboard` @320 **and @375** (V-01 below) |
| V-09 Pricing footer collision | **Fixed** — rule and copyright sit below the link columns (`pricing/1440.png`, `root/1440.png`) |
| V-10 Audit detail placeholders / back link to `/` | Back link now → `/dashboard` ✅; `Duration –`, `Cost $0.00`, raw `gbp`, double gap **unchanged** |
| V-11 No global chrome | **Fixed for `(dashboard)` routes**; `/new-audit` and `/audit/[id]` still bare |
| V-12 Two design systems | **Still visible** — legacy purple-gradient `DashboardClient` embedded inside the new slate `AppShell` (V-07 below) |
| V-13 Empty states | **Fixed** on `/proposals`, `/schedules`, `/settings/billing` invoices |
| V-14, V-15, V-16 (free-audit placeholders, low-contrast helper text, two `<h1>` on branding) | **Unchanged** |
| New in R2 | Header collision at 768/200% zoom (V-03), marketing header has no mobile nav (V-05), analytics overflow @320 (V-04), settings tab strip clipped @375 (V-06) |

## Severity 1 — content cut off / unusable at a supported viewport

### V-01 `/dashboard` @320 and @375 — page overflows horizontally (383px)
`dashboard/320.png`, `dashboard/375.png`: below the app header, the legacy page header puts the "ProposalOS" gradient wordmark, "Batch Audit" and "+ New Audit" on one line. "Batch Audit" wraps to two lines, "+ New Audit" wraps to three and its right half is cut off by the viewport; the whole page gains a horizontal scrollbar (scrollWidth 383). The audits table below is 470px wide — the wrapper scrolls (and is now focusable) but the "Findings / Cost / Client Score / Created / Actions" headers are off-screen so the visible columns are just Business / Status / "Fi…".
- Also visible in `dashboard/375-mobile-menu-open.png` (bottom of frame: "+ New Audit" clipped) — the shell header itself is fine.
- Files: `app/dashboard/DashboardClient.tsx:18-32` (`flex justify-between` header → needs `flex-wrap`/stack `<sm`), `app/dashboard/AuditTable.tsx` (consider hiding Cost/Client Score columns `<md` or a card layout).

### V-02 `/settings/branding` @320 and @375 — cards clipped at the right edge
`settings-branding/375.png`: every card (Identity, Colors, Contact Info, Footer), the "Save Changes" button and the Live Preview panel extend past the right edge of the viewport; the right border/radius is never visible and the Save button is cut off. `settings-branding/320.png`: same, worse. There is no scrollbar because the wrapper has `overflow-x-hidden`, so the content is simply unreachable. Measured: column width 295px, cards 359px (min-content of the `sm:grid-cols-3` Colors row + `p-6`), right edge = 399px.
- Files: `app/(dashboard)/settings/branding/page.tsx:70` (`className="container max-w-6xl mx-auto py-10 px-4 overflow-x-hidden"` — `.container` from `app/globals.css:314` adds 1.5rem padding on top of the shell's `px-4`; drop `.container` here), `:125` (Colors grid), `:73` (`gap-12`).

### V-03 `/dashboard` (and every `(dashboard)` page) @768 — header controls collide
`dashboard/768.png`, `settings-branding/768.png`: the `md:` breakpoint shows the full primary nav, but at 768px there is no room: "Settings" (ends x=581) overlaps "New audit" (starts x=575); "New audit" and "Sign out" both wrap to two lines (52–54px tall vs 32px), making the 56px header look broken. The same collision is what `dashboard/1440-zoom200.png` shows at 200% zoom (effective 720px): "New audit" drawn over "Analytics/Settings".
- File: `app/(dashboard)/components/AppShell.tsx:56-130` — either raise the hamburger breakpoint to `lg:`, or hide the "New audit" label / tenant block until `lg`.

### V-04 `/analytics` @320 — toolbar and tables overflow (348px)
`analytics/320.png`: "Last 30 Days" select, "Export CSV" and "Refresh" sit in a non-wrapping `flex gap-3`; "Refresh" is cut at the right edge and the page scrolls horizontally. Module Reliability / Common Findings tables (384px) also poke past the edge at 320 and 375.
- File: `app/(dashboard)/analytics/page.tsx:70-90` (toolbar), `:189`, `:226` (table wrappers).

## Severity 2 — visibly broken layout / missing affordance

### V-05 `/` marketing @320/375 — header has no navigation or login
`root/375.png`: header shows only the "⚡ ProposalOS" wordmark and "Get Free Score". "For Agencies / Sample Report / API" and "Log In" are hidden and there is no hamburger, so a mobile visitor cannot reach `/login` from the header (only via footer or by URL). The hero also leaves ~150px of empty space between "No signup required…" and the "Trusted by" band.
- File: `app/(marketing)/layout.tsx:26` (`nav hidden md:flex`), `:41` (`Log In … hidden sm:block`); `app/(marketing)/page.tsx` hero `min-h`/padding.

### V-06 Settings tab strip @320/375 — tabs run off-screen without affordance
`settings-team/375.png`, `settings-branding/375.png`, `settings-billing/375.png`: "Branding Team Billing API keys Domain" is visible, "Domain" is half-clipped and "Widget" is fully off-screen (right edge 455px). The strip does scroll (`overflow-x-auto`) but there is no scrollbar, fade or chevron to indicate that; at 320 it contributes to a page-level overflow on `/settings/billing` (324px).
- File: `app/(dashboard)/components/AppShell.tsx:155-178` — add a right-edge gradient/fade or wrap into two rows `<sm`.

### V-07 `/dashboard` all viewports — two headers, two design systems
`dashboard/1440.png`: directly under the new slate app header (small indigo "P" tile, "ProposalOS", nav) the page repeats a large purple-gradient "ProposalOS" wordmark + "Operator Dashboard" subtitle, then purple-gradient "+ New Audit" and outline "Batch Audit" buttons — a different palette, radius and button style from the shell's indigo `New audit`. Two "New audit" CTAs (header + page) do different things (link vs modal). KPI cards use tinted gradient backgrounds unlike the flat slate cards on `/analytics`, `/settings/*`.
- Files: `app/dashboard/DashboardClient.tsx:18-32` (remove the in-page wordmark; keep a plain `<h1>Audits</h1>`), `app/globals.css` (`.btn-primary` gradient vs Tailwind indigo).

### V-08 `/settings/billing` @1440 — contradictory plan state, inconsistent width
`settings-billing/1440.png`: "CURRENT PLAN Agency $599/mo" next to "Billing status: Inactive" reads as an error; "0 / ∞" mixes a bold 0 with a light grey "/ ∞" and the progress bar is empty grey with no fill or label. Content is constrained to `max-w-4xl` and centred (x 304–1136) while `/settings/team` and `/settings/branding` fill the shell's `max-w-7xl` (x 144–1296), so switching tabs makes the page jump width.
- File: `app/(dashboard)/settings/billing/page.tsx:60` (`max-w-4xl mx-auto p-8`), `:75` (status copy).

### V-09 `/settings/team`, `/schedules` @320/375 — title and button fight for one row
`settings-team/375.png`: "Team Management" wraps to two lines beside a two-line "+ Invite Member" button; `schedules/375.png`: "Recurring Audits" (two lines) beside a two-line "+ New Schedule". Both should stack `<sm`.
- Files: `app/(dashboard)/settings/team/page.tsx` header `flex justify-between`, `app/(dashboard)/schedules/page.tsx` header.

### V-10 Mobile menu (`/dashboard` @375) — behaviour gaps
`dashboard/375-mobile-menu-open.png`: the panel itself renders cleanly (11 items, active "Audits" highlighted). Defects are behavioural: Escape does not close it; focus stays on the toggle; no "Sign out" or tenant/user identity inside the menu (they sit in the header only — the tenant/email block is `hidden lg:flex`, so on mobile the user never sees which workspace they are in).
- File: `app/(dashboard)/components/AppShell.tsx:103-152`.

## Severity 3 — hierarchy / polish

### V-11 `/audit/[id]` — placeholder metrics and raw enums (unchanged from R1)
`audit-detail/1440.png`: KPI row `Cost $0.00`, `Duration –` for a COMPLETE audit; sub-line `Phoenix    • Created 9/28/2026` with a double gap where industry is null; category tag `Reputation • gbp` (raw lower-case enum next to title-case "Reputation"); Vitamins column has one card leaving a large empty area at ≥1024. No app shell (no header/nav) — page opens with "← Back to Dashboard" as the only chrome.
- File: `app/audit/[id]/AuditDetailClient.tsx:63-78, 125-131`.

### V-12 `/new-audit` — bare centred card, no chrome
`new-audit/1440.png`: no header, nav or way back except browser Back. Card itself is well proportioned at all widths.
- File: `app/new-audit/page.tsx` (move into `(dashboard)` group).

### V-13 `/dashboard` table — every row shows `$0.00` and `-`
`dashboard/1440.png`: Cost `$0.00` and Client Score `-` on all 20 rows and `Avg Cost $0.00` KPI — reads as broken telemetry. Consider hiding the columns when no data or showing "Free"/"n/a".
- File: `app/dashboard/AuditTable.tsx`, `app/dashboard/StatsBar.tsx`.

### V-14 `/free-audit` @375 — placeholder-as-label truncation (unchanged)
`free-audit/375.png`: "Business Name (e.g. Acme De", "Website URL (e.g. acmedental" — cut mid-word; no visible labels.
- File: `app/(public)/free-audit/page.tsx`.

### V-15 Low-contrast helper text (unchanged, now more instances)
Grey 12–14px text on near-black: dashboard row sub-lines (`Phoenix • General`, 20 rows), billing labels/table header, marketing footer + copyright (2.5:1), login "Or continue with", branding "Requires Agency Plan…", "Powered by ProposalOS". See 02 for exact selectors.

### V-16 `/settings/branding` — two `<h1>`, mock save (unchanged / newly exposed)
`settings-branding/1440.png`: page title and the live-preview headline "Digital Audit: Client Business" are both `<h1>`. "Save Changes" only sleeps 1s and calls `alert('Branding saved!')` (`page.tsx:58-63`).

### V-17 `/pricing`, `/` — "Log In" shown while authenticated (unchanged)
`pricing/1440.png` taken in the authenticated context still shows "Log In" + "Get Free Score".
- File: `app/(marketing)/layout.tsx:41`.

## Things that look right in R2
- `/login`, `/register`: unchanged clean layout; error banner is legible red-on-dark and centred (`login/1440-invalid-login.png`); 200% zoom clean.
- App shell at ≥1024: compact 56px header, active-tab highlight, tenant + email block, consistent across `/dashboard`, `/proposals`, `/schedules`, `/analytics`, `/settings/*`.
- `/proposals`, `/schedules` empty states are clear and centred at all widths; `/schedules` has an icon + CTA.
- `/analytics` @1440: six KPI tiles, two charts and two tables align to a clean 2-col grid; @375 stacks correctly (tables scroll).
- `/settings/team` @1440: member row with avatar initials, role chip, count badge.
- `/settings/branding` @≥768: dark inputs with visible hex values, colour swatches aligned with text inputs, live preview panel proportional.
- `/pricing` footer fixed; plan cards balanced at all widths.
- `/audit/[id]` @375 stacks cleanly, no overflow; CSP inline-style errors gone.
