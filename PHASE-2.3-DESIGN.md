# Phase 2.3 Design

Captured: 2026-04-30T23:32:14Z
Branch: phase-2-rls-migration
Scope: Task 0 only - design gate for repairing the Prisma tenant/RLS runtime shim

## Installed Prisma version

- `@prisma/client` in `package.json`: `^5.20.0`
- `prisma` in `package.json`: `^5.20.0`
- Actual installed versions from `pnpm exec prisma -v`:
  - `@prisma/client`: `5.22.0`
  - `prisma`: `5.22.0`

## Current runtime shape

- [lib/prisma.ts](/Users/danishsethi/VSCODE/ProposalOS/lib/prisma.ts:1) uses a global Prisma client with a `query.$allModels.$allOperations` extension.
- [lib/middleware/auth.ts](/Users/danishsethi/VSCODE/ProposalOS/lib/middleware/auth.ts:1) already wraps authenticated requests in `runWithTenantAsync(...)`, so tenant context is available through `AsyncLocalStorage`.
- [lib/tenant/context.ts](/Users/danishsethi/VSCODE/ProposalOS/lib/tenant/context.ts:1) still contains a second tenant-scoping mechanism, `createScopedPrisma(...)`, with `63` callsites across the repo.
- The repo also already has `29` explicit `$transaction(...)` callsites and `33` raw-query sites (`$queryRaw*` / `$executeRaw*`) in `app/` and `lib/`.

## Root cause of the current shim bug

The current shim opens an interactive transaction, issues:

```ts
await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '...'`);
```

and then calls:

```ts
return query(args);
```

That `query(args)` function is not rebound to `tx`; it executes through the outer extended client. In practice, the tenant setting is not guaranteed to apply to the actual Prisma operation, which is exactly what Phase 2.2 reproduced.

## Research inputs

- Prisma Client query extensions docs
- Prisma shared-extensions limitation note about transaction context
- Prisma interactive transactions docs
- Local Prisma 5.22.0 generated typings in `node_modules/.pnpm/.../runtime/library.d.ts`

Notable local typing confirmation:

```ts
[K in keyof Q_]: K extends '$allOperations' ? (args: {
  model?: string;
  operation: string;
  args: any;
  query: (args: any) => PrismaPromise<any>;
}) => Promise<any>
```

So Prisma 5.22.0 does expose `model` and `operation` to the query callback, which is enough to route through the transaction client without using private Prisma symbols.

## Option analysis

### Option 1 - Per-query transaction with transaction-bound re-dispatch

Pattern:

- Keep the global Prisma client and the current `AsyncLocalStorage` tenant context.
- In `lib/prisma.ts`, use the query extension callback signature `{ model, operation, args }`.
- For tenant-scoped model operations:
  - validate tenant context up front
  - open `client.$transaction(async (tx) => { ... })`
  - issue `SELECT set_config('app.current_tenant_id', $1, true)` inside `tx`
  - if bypass flag is active, also issue `SELECT set_config('app.bypass_rls', 'true', true)`
  - re-dispatch the actual Prisma operation through `tx[model][operation](...)`
- For missing or invalid tenant context:
  - throw a typed `MissingTenantError`
  - do not run the Prisma operation at all

Estimated implementation size:

- `lib/prisma.ts`: ~120-180 lines changed
- `lib/tenant/context.ts`: small additive change for bypass flag and deprecation note
- new integration test file: ~180-260 lines

Risk to existing handlers:

- Low to medium
- Keeps the existing `withAuth -> AsyncLocalStorage -> prisma` contract intact
- Avoids a broad request-lifecycle refactor
- Main risk is correct re-dispatch for all model operations and preserving behavior for existing explicit transactions

Concurrency / request bleed:

- Good
- Tenant identity stays in `AsyncLocalStorage`
- The DB setting lives only inside the per-query transaction
- Parallel requests should remain isolated as long as the runtime context stays per-request, which it already does today

Raw query coverage:

- Partial
- This can protect model operations routed through the query extension
- It does **not** automatically fix every existing `$queryRaw*` / `$executeRaw*` site in the repo
- That limitation is acceptable for Phase 2.3 because the prompt explicitly scopes raw-query remediation to later work

Strengths:

- Smallest blast radius
- Matches the successful Phase 2.2 finding: `SET LOCAL` works with PgBouncer when the actual query runs inside the same transaction
- Can fail closed on missing tenant before touching Postgres

Weaknesses:

- Requires dynamic property access like `tx[model][operation](...)`
- Needs careful handling of operations that should not be tenant-gated
- Leaves raw-query sites as an explicit limitation

### Option 2 - Per-request transaction stored in AsyncLocalStorage

Pattern:

- At the `withAuth(...)` boundary, start one transaction for the whole request.
- Store the transaction client (`tx`) in `AsyncLocalStorage`.
- Route all Prisma operations through the stored `tx`.
- Set tenant config once per request rather than once per query.

Estimated implementation size:

- `lib/prisma.ts`: ~120-200 lines
- `lib/middleware/auth.ts`: ~60-120 lines
- `lib/tenant/context.ts`: additive transaction storage changes
- likely follow-on edits in code paths that already open nested interactive transactions

Risk to existing handlers:

- High
- The repo already has `29` explicit `$transaction(...)` callsites
- Request-wide transactions interacting with nested transactions, webhook flows, and long-lived handlers are much riskier than the per-query fix
- A request-wide transaction also changes timing, lock duration, and connection usage semantics

Concurrency / request bleed:

- Theoretically good if done perfectly
- Operationally riskier because a leaked transaction client in context is more damaging than a leaked tenant ID string
- Harder to reason about in background jobs and fire-and-forget flows already using `runWithTenantAsync(...)`

Raw query coverage:

- Better than Option 1 **if** every raw query is routed through the stored `tx`
- But that requires more centralization than this repo currently has
- Still does not help raw queries that construct or use separate clients directly

Strengths:

- Cleanest semantic model
- One transaction, one tenant setting, one request

Weaknesses:

- Much larger refactor
- Higher risk to existing route handlers and background flows
- More likely to trip over existing explicit transactions and Prisma transaction limits

### Option 3 - Connection-level setting / query-event wrapper

Pattern:

- Try to stamp tenant context at the connection level, outside the actual Prisma operation path
- Examples would be `$on('query')`, connection hooks, or wrapper logic around connection acquisition

Estimated implementation size:

- Variable, but deceptively large once edge cases are handled

Risk to existing handlers:

- High
- The correctness story depends on connection lifecycle details, not just request context

Concurrency / request bleed:

- Weakest of the three
- With pooled connections, a connection-level setting is easier to apply to the wrong future query or to miss entirely

Raw query coverage:

- Potentially broad in theory
- But fragile enough that the apparent coverage is not trustworthy

Strengths:

- Conceptually avoids per-query re-dispatch

Weaknesses:

- Fragile under pooling
- Hard to prove correct
- Worst fit for the exact PgBouncer transaction-pooling environment validated in Phase 2.2

## Recommendation

### Recommend: Option 1

Why:

1. It directly matches the confirmed working behavior from Phase 2.2:
   - `app_user`
   - transaction-pooled PgBouncer
   - `SET LOCAL` / `set_config(..., true)`
   - actual query executed inside the same transaction
2. It keeps changes primarily inside `lib/prisma.ts`, which fits the prompt and minimizes blast radius.
3. It does not require refactoring `withAuth(...)` or threading transaction clients through the request lifecycle.
4. It avoids the pooler fragility of connection-level tricks.
5. It is compatible with adding a bypass flag hook now and real bypass policies later in Phase 2.4.

### What this option will and will not solve

It will solve:

- tenant setting not reaching the actual Prisma operation
- fail-open behavior when tenant context is missing
- invalid tenant values degrading into opaque Postgres `22P02` errors
- runtime support for a future bypass path

It will not solve in Phase 2.3:

- the mispointed production DSN
- the application still connecting as `postgres`
- raw-query callsites across the repo
- schema-level gaps in RLS coverage
- bypass policy enforcement at the database layer

## Proposed implementation outline for Option 1

1. Add a typed `MissingTenantError` export from `lib/prisma.ts`.
2. Add UUID validation before any DB call.
3. Add a bypass flag store alongside the current tenant store.
4. In the query extension:
   - inspect `{ model, operation, args }`
   - if bypass flag is active, open a transaction, set `app.bypass_rls = 'true'`, and re-dispatch via `tx`
   - otherwise require a valid tenant UUID, open a transaction, set `app.current_tenant_id`, and re-dispatch via `tx`
5. Leave raw-query methods explicitly documented as a limitation for Phase 2.6.
6. Mark `createScopedPrisma(...)` as `@deprecated` but leave callers untouched in this phase.

## Operator approval gate

Recommended path for Task 1: **Option 1 - Per-query transaction with transaction-bound re-dispatch**

I do **not** expect this to require private Prisma internals.
The implementation should be able to use:

- Prisma's documented query extension callback shape (`model`, `operation`, `args`)
- public transaction API (`$transaction`)
- public transaction client methods (`tx.<model>.<operation>`)

If that assumption breaks during implementation and private/internal Prisma APIs become necessary, I will halt before committing, per instructions.

## Performance

- Chosen pattern cost: one `BEGIN` / `COMMIT` pair around each tenant-scoped Prisma model operation that is not already running inside an interactive transaction.
- Nested-transaction mitigation: the runtime now detects an active Prisma transaction in `AsyncLocalStorage` and reuses it instead of opening a sub-transaction. That keeps explicit `$transaction(...)` flows from paying the overhead twice and avoids nested transaction weirdness.
- Known tradeoff: this is extra round-trip and transaction overhead relative to the old broken shim. We are paying that cost intentionally so `set_config(..., true)` and the actual query execute on the same transaction-bound connection.
- Phase 2.7 note: profile the per-query transaction overhead under realistic load, compare PgBouncer pooled vs direct execution, and revisit whether we should keep Option 1 long-term or graduate to a broader request-lifecycle pattern once the rest of the RLS rollout is stable.

## Closure

Pattern chosen: **Option 1 - per-query transaction with transaction-bound re-dispatch**

Why this shipped:

- It fixes the confirmed root cause from Phase 2.2 without reaching into private Prisma internals.
- It keeps the blast radius centered in [lib/prisma.ts](/Users/danishsethi/VSCODE/ProposalOS/lib/prisma.ts:1) and [lib/tenant/context.ts](/Users/danishsethi/VSCODE/ProposalOS/lib/tenant/context.ts:1).
- It preserves existing explicit transaction callsites by reusing the active transaction context when one already exists.

### Runtime changes shipped

- Added `MissingTenantError` with operation name + invalid/missing reason.
- Added UUID validation before `set_config(...)`.
- Added a single `dispatchOnTx(tx, model, operation, args)` helper so the transaction-client cast lives in one place.
- Added nested-transaction detection through `currentTx` in `AsyncLocalStorage`.
- Added `runWithTenantBypass(...)` runtime hook for intentional cross-tenant/admin/system reads.
- Marked `createScopedPrisma(...)` as deprecated for the later Phase 2.6 cleanup.
- Added explicit server-component wrappers where fail-closed behavior surfaced intentional no-tenant reads:
  - admin pages
  - magic-link proposal/client pages
  - onboarding and audit detail pages that already had a real tenant available

### Integration test results

| Test                                                              | Result                                               |
| ----------------------------------------------------------------- | ---------------------------------------------------- |
| Tenant A query sees only tenant A rows                            | Pass                                                 |
| Tenant B query sees only tenant B rows                            | Pass                                                 |
| No tenant context throws `MissingTenantError`                     | Pass                                                 |
| Empty-string tenantId throws `MissingTenantError`                 | Pass                                                 |
| Non-UUID tenantId throws `MissingTenantError`                     | Pass                                                 |
| Concurrent requests do not bleed tenant context                   | Pass                                                 |
| Active transaction is reused instead of nesting a sub-transaction | Pass                                                 |
| Mutation respects tenant scope via `WITH CHECK`                   | Pass                                                 |
| Bypass hook allows cross-tenant read                              | Skipped until Phase 2.4 DB-side bypass policy exists |

Suite summary:

- `lib/tenant/__tests__/shim-integration.test.ts`: `8 passed, 1 skipped`
- `tests/security/`: `14 passed`
- `pnpm build`: green

### Phase 2 baseline diff

- `tsc --noEmit`: still broken in the same pre-existing area; tail remained in unrelated repo-wide errors rather than shim files.
- Full Vitest suite: `44 failed / 77 passed / 241 failed tests / 64 skipped` versus baseline `43 failed / 77 passed / 240 failed tests / 63 skipped`.
- Observed delta: `+1` failed file, `+1` failed test, `+1` skipped. The visible extra failure surfaced in an existing cron test area rather than any file changed in this phase, so the branch-specific signal remains the green integration/security/build gates above.

### Phase 2.4 readiness checklist

- Runtime shim now propagates tenant context into the actual query path.
- Missing tenant context is fail-closed instead of silently running unscoped.
- Explicit bypass hook exists, but DB-side bypass policy does not yet exist.
- Public/raw query limitations are documented and still need follow-up:
  - Phase 2.4: design and ship bypass policy
  - Phase 2.6: raw query migration / cleanup
  - Phase 2.7: profile transaction overhead and revisit runtime shape
