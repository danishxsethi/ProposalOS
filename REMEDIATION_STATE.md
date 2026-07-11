# ProposalOS Remediation Campaign — State

Source of truth: `AUDIT_REPORT.md` (immutable). Control artifacts: this file,
`REMEDIATION_FINDINGS.json`, `REMEDIATION_VERIFICATION.md`. Branch: `remediation/proposalos-e2e`.

Last updated: end of Wave 0.

## Campaign objective

All legitimate ProposalOS capabilities fully implemented, secured, tested, wired through one
durable canonical execution architecture, and verified end to end.

## Non-negotiable product decisions (already approved)

1. Ship all legitimate audit modules fully built and functional.
2. Use one canonical full audit engine.
3. Migrate all asynchronous audit entry points to the durable AuditJob queue.
4. Scheduled audits must use the canonical engine.
5. The widget may use a documented fast subset only if: selected through the canonical engine;
   findings/evidence remain contract-compliant; no fabricated score or top issue; UI clearly
   labels it a quick audit.
6. No customer-facing finding may persist without real evidence.
7. Provider/browser/LLM failure must never become verified absence or a customer deficiency.
8. No customer-facing legal certification or definitive legal advice.
9. Both frontends must meet equivalent auth, tenancy, CI, and security guarantees while deployed.
10. Marketing latency/cost/coverage claims must be based on measured full-flow results.

## Baseline (Phase C)

- Branch: `remediation/proposalos-e2e`; HEAD at campaign start: `3cd069f`.
- Wave 0 commits: `a040450` (fix), `aa9765c` (artifacts).
- Wave 1 commits: `81024eb` (fix).
- TypeScript baseline: `tsc --noEmit --pretty false --incremental false` → **exit 0** (clean)
  across the entire working tree (both change groups below).
- **Pre-existing dirty tree (68 files) — two distinct groups. Preserve both; commit only the
  wave's own files.**
  - **Group 1 — Wave 0 security work** (prior uncommitted session; verified and committed this
    wave): `lib/auth/rbac.ts`, `lib/auth/apiKeys.ts`, `lib/middleware/auth.ts`,
    `lib/modules/security.ts`, `app/api/team/invite/route.ts`,
    `app/api/team/invite/[token]/accept/route.ts`,
    `app/api/tenants/[tenantId]/delete-data/route.ts`, `app/api/settings/api-keys/route.ts`,
    plus untracked `tests/security/wave0-*.test.ts` (5 files).
  - **Group 2 — UNRELATED logger-typing work** (~46 files): `lib/logger.ts` (adds `AppLogger`
    message-first type overload) + ~45 route files each with a single
    `+import { logger } from '@/lib/logger';` line. Leftover from the console→logger migration
    (commit `92421f7`). **NOT part of any wave; left uncommitted, untouched.** Also uncommitted:
    `lib/audit/runner.ts`, `lib/observability/auditTrail.ts`,
    `lib/self-evolving-prompts/data-access/prompt-performance.ts`, `app/api/cron/metering-sweep/route.ts`.
  - `AUDIT_REPORT.md` shows as "modified" because the working-tree 4006-line adversarial audit
    replaces a stale 224-line committed report. **The working-tree copy IS the source of truth.**
    Do not revert it. **It is intentionally left UNCOMMITTED and unstaged**: the repo's
    `lint-staged` runs `prettier --write` on any staged `.md`, and prettier confirmedly reformats
    this file — staging it would mutate the immutable audit evidence. It is preserved on disk in
    this workspace; a resuming session reads it from the working tree. **Never stage
    `AUDIT_REPORT.md` while the prettier lint-staged rule is active** (would require `--no-verify`,
    which is disallowed). If a clean checkout is ever needed, copy the working-tree file aside
    first.
- Untracked helper `scripts/show-leaks.js` (from prior gitleaks work) — not staged.

## Findings normalization (Phase A)

- 107 finding rows normalized into `REMEDIATION_FINDINGS.json`: **8 P0, 44 P1, 55 P2**.
- Numbering gaps `P0-01..P0-18` and `P1-10..P1-13` are **not rows** in this report (prior/other
  numbering) — intentionally absent, not fabricated.
- **P2-26 superseded**: the "orphan file `websiteCrawlerModule.ts`" claim is retracted by an
  in-report self-correction (line 1450); the file is imported by `runner.ts:52`. The real concern
  is the duplicate crawl (P1-27). Not scheduled as an active defect.
- **P0-24 retained**; P2-52 widened its blast radius (reachable in both engines). Both resolved
  together by the single shared `fetchWithRedirect` fix.

## Root-cause groups

- **A** Immediate security containment
- **B** Tenant isolation and DB-role safety
- **C** Canonical audit engine and durable queue convergence
- **D** Finding/Evidence contract enforcement
- **E** Module adapter/result-shape correctness
- **F** Replace production stubs/placeholders/fabricated fallbacks
- **G** Network/SSRF/browser safety
- **H** Provider-state and failure normalization
- **I** Shared crawl/provider reuse and cost accounting
- **J** LLM/prompt-injection/schema validation
- **K** Auth authority and frontend parity
- **L** Billing/webhook/idempotency integrity
- **M** Test harness and module contract coverage
- **N** Observability, deployment, and CI
- **O** Runtime measurement and marketing reconciliation
- **P** P2 cleanup and documentation

## Open audit work (not defects)

The audit itself is incomplete beyond Pass 4C.1. The following passes are **unfinished audit
work**, tracked so a later wave can complete them; they are NOT confirmed defects:

- Pass 4C.2 — cost controls, persistence, idempotency, result integrity.
- Pass 4C.3 — browser-navigation SSRF interception + timeout-signal propagation.
- Passes 5–20 — proposal compiler/claim policy, diagnosis, delivery/outreach/closing/retention,
  billing/metering/webhooks, multi-tenancy/white-label/frontend, LLM/prompt security/cost
  governance, observability/infra/CI, adversarial QA, runtime certification, docs/marketing
  reconciliation, final GO/NO-GO.

## Remediation waves

| Wave | Theme                                          | Findings                                                                                                              | Groups | Status                      |
| ---- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------ | --------------------------- |
| 0    | Emergency security containment                 | P0-19, P0-20, P0-21, P0-24, P1-14, P1-16, P2-52                                                                       | A, G   | **VERIFIED / COMMITTED**    |
| 1    | Tenant & auth foundation                       | P1-05, P1-06, P1-07, P1-15, P1-17, P1-18, P2-07, P2-18, P2-22, P2-23                                                  | B, K   | PARTIAL — see Wave 1 result |
| 2    | Canonical engine + durable job execution       | P0-22, P0-23, P1-03, P1-20, P1-21, P1-22, P1-23, P1-24, P2-08, P2-12, P2-24, P2-25                                    | C      | open                        |
| 3    | Finding/Evidence enforcement layer             | P1-09, P1-25, P1-26, P1-31, P2-13, P2-36, P2-40                                                                       | D      | open                        |
| 4    | Shared network/browser/provider safety         | P1-46, P1-47, P1-48, P2-53, P2-54                                                                                     | G      | open                        |
| 5    | Module adapter & failure-state repair          | P1-28, P1-33, P1-34, P1-39, P1-43, P2-28, P2-47                                                                       | E, H   | open                        |
| 6    | Fully implement broken/missing modules         | P0-25, P1-30, P1-37, P1-41, P1-42, P2-30                                                                              | F      | open                        |
| 7    | Harden remaining partial modules               | P1-27, P1-29, P1-32, P1-35, P1-38, P2-27, P2-31, P2-32, P2-34, P2-35, P2-38, P2-41, P2-42, P2-43, P2-44, P2-46, P2-50 | I, H   | open                        |
| 8    | Diagnosis + proposal claim-policy enforcement  | P0-26, P1-36, P1-40                                                                                                   | F      | open                        |
| 9    | Delivery/outreach/closing/retention pipelines  | (Passes 9-12 audit work)                                                                                              | —      | open                        |
| 10   | Billing, metering, webhook, unit economics     | P1-08, P2-21                                                                                                          | L      | open                        |
| 11   | Multi-tenancy/white-label/frontend convergence | P1-01, P1-19, P2-10, P2-11, P2-15, P2-20                                                                              | K      | open                        |
| 12   | LLM layer, prompt security, cost governance    | P1-45, P2-37, P2-49                                                                                                   | J      | open                        |
| 13   | Observability, infrastructure, CI              | P1-02, P1-44, P2-04, P2-09, P2-14, P2-19                                                                              | N      | open                        |
| 14   | Complete tests, adversarial fixtures, coverage | P2-29, P2-33, P2-39, P2-45, P2-48, P2-51, P2-55                                                                       | M      | open                        |
| 15   | Controlled end-to-end runtime certification    | (Pass 4C.2/17 runtime)                                                                                                | O      | open                        |
| 16   | Documentation & marketing reconciliation       | P1-04, P2-06                                                                                                          | O, N   | open                        |
| 17   | Final re-audit & GO/NO-GO + P2 hygiene         | P2-01, P2-02, P2-03, P2-05, P2-16, P2-17                                                                              | P      | open                        |

Wave assignments beyond the current wave are provisional and refined on wave entry. Each wave, on
entry, must record: included findings + unfinished passes, files in scope, prerequisites,
acceptance criteria, exact verification commands, rollback strategy, and expected commit boundary.

### Wave 1 entry notes (for next session)

- **Prerequisites:** none beyond Wave 0.
- **Scope:** tenant-isolation and DB-role safety (unscoped `lib/db.ts`, RLS role confirmation,
  claraud-web connection/parameterization), unauthenticated `/api/predictions`, login rate limit.
- **Product/operator inputs likely needed:** prod `DATABASE_URL` role (app_user vs superuser)
  for P1-05/P1-06; claraud-web same-DB-or-not for P1-07/P1-18.
- **Carry-over from Wave 0:** `app/api/auth/register/route.ts` writes `role:'owner'`, which is
  NOT in `ROLE_HIERARCHY`; `normalizeRole` now returns `undefined` for it (fail-closed). Confirm
  self-registration writes a valid `Role` (e.g. `agency_admin`) or add `owner` to the hierarchy —
  address as part of P2-07/P1-14 follow-through so self-registered owners are not locked out.
- **Rollback:** all Wave 1 changes isolated to their own commit; revert the commit.

## Regression status

- TypeScript (`tsc --noEmit`): green (exit 0).
- Wave 0 targeted tests: 32/32 pass.
- ESLint on Wave 0 files: 0 errors (9 pre-existing style warnings).
- Full suite NOT run this wave (per IDE-safety rule 6/7 — targeted first). Full-suite gate owed at
  a later coherent checkpoint.

## Unresolved decisions (carried, not blocking Wave 0)

- P1-16: retire env `API_KEY` fallback vs keep (containment applied regardless).
- P1-22/P1-23: single owner of scheduled audits (cron `AuditOrchestrator` vs retention path).
- P1-08: financial/audit-record retention vs GDPR cascade (owned by Wave 10).
- P1-19: claraud-web SSO vs separate account system.

## Next wave

**Wave 2 — Canonical audit engine and durable job execution.** See continuation prompt in
`REMEDIATION_VERIFICATION.md` and the Wave 1 result block below.

## Wave 1 result summary (Tenant & authentication foundation)

- **Verified:** P1-05 (unscoped root Prisma client — full architectural fix, 8/8 callers
  migrated), P1-14 (re-verified + a critical escalation it uncovered fixed — see below),
  P1-15 (login rate limiting), P1-17 (predictions route authz/tenant-scoping), P2-07
  (re-verified from Wave 0, no duplicate work), P2-18 (self-evolving executor fail-closed
  default), P2-22 (trusted-proxy IP extraction).
- **Fixed (code changed, full acceptance criteria not exhaustively verified):** P1-06
  (repository-side fail-fast DB-role guard added; live production role confirmation is
  an operator fact, recorded BLOCKED below).
- **Still open (not attempted this wave):** P1-07, P1-18 (claraud-web tenant-scoping
  client — separate subproject, not explored this session), P2-23 (enumeration +
  audit-trail reliability — deprioritized under time budget).
- **New findings discovered and logged:** P2-56 (latent type debt uncovered by removing
  the `any`-typed client, in `signalDetector.ts`/`tenantConfig.ts` — preserved exact
  prior runtime behavior via a documented `as any` cast rather than blind-fixing under
  time pressure), P2-57 (5 more duplicate/spoofable client-IP-extraction sites beyond
  the 2 fixed in `rateLimit.ts`).
- **Critical fix (not a pre-planned finding, discovered during P2-07 reverification):**
  `LEGACY_ROLE_VALUES.owner` mapped to `'super_admin'` — every self-registered tenant
  admin (`role:'owner'`) was normalizing to **platform-wide super_admin** via the very
  `normalizeRole()` Wave 0 shipped and verified. Fixed to `agency_admin`; self-registration
  now writes `agency_admin` directly. Proven closed by
  `tests/security/wave1-owner-role-escalation.test.ts`. This should be flagged to the
  team as a severe finding that shipped in Wave 0 and was caught one wave later — a
  fresh Wave 2 session should sanity-check other `LEGACY_ROLE_VALUES`/role-mapping
  tables for similar mistakes if time allows.

### Operator-blocked facts (Wave 1)

1. **P1-06:** confirm the live production `DATABASE_URL` connects as a restricted
   application role (e.g. `app_user`), not `postgres`/a superuser or BYPASSRLS role.
   Read-only check: `SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname
= current_user;` run against the production connection. `lib/config/dbRoleGuard.ts`'s
   `assertSafeDbRole()` automates this check but is not yet wired into a startup probe.
2. **P1-07/P1-18:** claraud-web same-physical-DB-as-root-app fact was already recorded
   BLOCKED in Pass 2/3 of the audit; still unconfirmed. The code defect itself (wrong
   connection, unparameterized SQL) is independent of this fact and remains open work,
   not yet started.

### Unresolved decisions (Wave 1, carried forward)

- Whether to also review `app/api/tenants/route.ts` and
  `lib/tenant/TenantProvisioningService.ts` (both still write `role:'owner'` literally)
  — no fix needed there since the shared `LEGACY_ROLE_VALUES` mapping fix covers all
  read sites uniformly, but a future wave may want to normalize the write sites to
  write `'agency_admin'` directly for clarity.
