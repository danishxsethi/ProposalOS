# Remediation 002 — Public Routes Tenant Context

**Date:** 2026-05-14  
**Status:** COMPLETE  
**Blocker resolved:** GA Blocker #3 from Completion Audit 2026-05-14  
**Production/cloud resources touched:** NONE  
**Secrets changed:** NONE

---

## Problem

`lib/prisma.ts` wraps every Prisma operation in a `$extends` hook that calls
`assertTenantContext(operationName, tenantId)`. If no tenant context is set via
`runWithTenantAsync` or `runWithTenantBypass`, it throws `MissingTenantError`.

Four public/no-auth routes called Prisma directly without establishing tenant context:

| Route                                    | Symptom                                                        |
| ---------------------------------------- | -------------------------------------------------------------- |
| `GET /api/public/audit/[id]`             | `MissingTenantError` on `Audit.findUnique` → 500               |
| `GET /api/case-study/[auditId]/generate` | `MissingTenantError` on `Audit.findUnique` → 500               |
| `POST /api/widget/quick-audit`           | `MissingTenantError` on `Tenant.findUnique/findFirst` → 500    |
| `POST /api/public/audit` (bonus)         | `MissingTenantError` on `Tenant.upsert` + `Audit.create` → 500 |

---

## Tenant Resolution Strategy per Route

### `GET /api/public/audit/[id]`

Audits created via `POST /api/public/audit` are always owned by the system tenant
(`domain: 'proposalengine.com'`). The GET status-polling endpoint must:

1. Resolve the system tenant ID via `runWithTenantBypass('public-audit-status-system-tenant-discovery', ...)`.
   The `Tenant` table is not row-scoped by tenant, so this bypass is safe and consistent
   with the established pattern in `lib/pipeline/humanReview.ts`.
2. Read the audit under `runWithTenantAsync(systemTenant.id, ...)`.
   RLS enforces that only audits belonging to the system tenant are visible — a request
   for an audit owned by a different tenant returns 404, not a data leak.

### `GET /api/case-study/[auditId]/generate`

The audit ID comes from the URL. The route has no auth. The fix:

1. Resolve the owning tenant via `runWithTenantBypass('case-study-generate-tenant-discovery', ...)`,
   reading only `{ id, tenantId, businessName }` — the minimum needed to establish context.
2. Run `generateCaseStudyPdf(...)` under `runWithTenantAsync(auditMeta.tenantId, ...)`.
   All Prisma operations inside the PDF generator are now scoped to the owning tenant.
   A request for a non-existent audit returns 404 before any tenant context is set.

**Cross-tenant leakage prevention:** The bypass only reads `tenantId` from the audit record.
The subsequent `runWithTenantAsync` scopes all further reads to that tenant. An attacker
supplying a different audit ID gets the PDF for that audit's tenant — which is the intended
behaviour for a public case-study endpoint (no auth means any audit ID is accessible).
If this endpoint should be auth-gated, that is a separate P1 task.

### `POST /api/widget/quick-audit`

The caller supplies either `tenantId` or `tenantDomain` in the request body (validated by
`quickAuditSchema` — both fields are required by the schema's `.refine` check). The fix:

1. Resolve the tenant via `runWithTenantBypass('widget-quick-audit-tenant-discovery', ...)`.
   The `Tenant` table is not row-scoped, so this is safe.
2. If no tenant is found, return 400 immediately — no audit is created.
3. Run `prisma.audit.create(...)` and the module calls inside `runWithTenantAsync(tenant.id, ...)`.

**Attacker-supplied tenantId:** The raw `tenantId` from the body is passed to
`prisma.tenant.findUnique({ where: { id: tenantId } })`. If no tenant exists with that ID,
the route returns 400. The audit is always created with `tenant.id` from the DB-resolved
record, not the raw body value — so an attacker cannot forge a tenantId that doesn't exist.

### `POST /api/public/audit` (bonus fix)

This route was already partially correct (it called `runWithTenantAsync` for the audit runner)
but had bare `prisma.tenant.upsert` and `prisma.audit.create` calls before establishing context.
Fixed with the same pattern: bypass for the tenant upsert, `runWithTenantAsync` for the audit
create and the error-handler update.

---

## Files Changed

| File                                                   | Change                                                                                                                                                   |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/api/public/audit/[id]/route.ts`                   | Added `runWithTenantBypass` for system tenant discovery; wrapped audit read in `runWithTenantAsync`; added structured error logging                      |
| `app/api/case-study/[auditId]/generate/route.ts`       | Added `runWithTenantBypass` for tenant discovery; wrapped PDF generation in `runWithTenantAsync`                                                         |
| `app/api/widget/quick-audit/route.ts`                  | Added `runWithTenantBypass` for tenant discovery; wrapped audit creation + module calls in `runWithTenantAsync`; removed `as any` cast on gbpRes         |
| `app/api/public/audit/route.ts`                        | Added `runWithTenantBypass` for tenant upsert; wrapped audit create and error-handler update in `runWithTenantAsync`; added `runWithTenantBypass` import |
| `tests/security/public-routes-tenant-context.test.ts`  | New — 19 regression tests covering all three named routes                                                                                                |
| `docs/remediation/002-public-routes-tenant-context.md` | This file                                                                                                                                                |

---

## Exact Diffs (summary)

### `app/api/public/audit/[id]/route.ts`

```diff
-import { prisma } from '@/lib/prisma';
+import { logger } from '@/lib/logger';
+import { prisma } from '@/lib/prisma';
+import { runWithTenantAsync, runWithTenantBypass } from '@/lib/tenant/context';

-    const audit = await prisma.audit.findUnique({ where: { id }, select: { ... } });
+    const systemTenant = await runWithTenantBypass(
+      'public-audit-status-system-tenant-discovery',
+      () => prisma.tenant.findUnique({ where: { domain: 'proposalengine.com' }, select: { id: true } })
+    );
+    if (!systemTenant) return NextResponse.json({ error: 'Not found' }, { status: 404 });
+    const audit = await runWithTenantAsync(systemTenant.id, () =>
+      prisma.audit.findUnique({ where: { id }, select: { ... } })
+    );
```

### `app/api/case-study/[auditId]/generate/route.ts`

```diff
+import { runWithTenantAsync, runWithTenantBypass } from '@/lib/tenant/context';

-    const audit = await prisma.audit.findUnique({ where: { id: auditId }, select: { id, businessName } });
-    const pdfBuffer = await generateCaseStudyPdf(auditId, baseUrl, audit.businessName);
+    const auditMeta = await runWithTenantBypass(
+      'case-study-generate-tenant-discovery',
+      () => prisma.audit.findUnique({ where: { id: auditId }, select: { id, tenantId, businessName } })
+    );
+    if (!auditMeta) return NextResponse.json({ error: 'Audit not found' }, { status: 404 });
+    const pdfBuffer = await runWithTenantAsync(auditMeta.tenantId, () =>
+      generateCaseStudyPdf(auditId, baseUrl, auditMeta.businessName)
+    );
```

### `app/api/widget/quick-audit/route.ts`

```diff
+import { runWithTenantAsync, runWithTenantBypass } from '@/lib/tenant/context';

-    const tenant = tenantId
-      ? await prisma.tenant.findUnique({ where: { id: tenantId } })
-      : await prisma.tenant.findFirst({ where: { domain: tenantDomain } });
+    const tenant = await runWithTenantBypass(
+      'widget-quick-audit-tenant-discovery',
+      () => tenantId
+        ? prisma.tenant.findUnique({ where: { id: tenantId } })
+        : prisma.tenant.findFirst({ where: { domain: tenantDomain } })
+    );

-    const audit = await prisma.audit.create({ data: { tenantId: tenant.id, ... } });
-    const [crawlRes, gbpRes] = await Promise.all([...]);
+    const auditResult = await runWithTenantAsync(tenant.id, async () => {
+      const audit = await prisma.audit.create({ data: { tenantId: tenant.id, ... } });
+      const [crawlRes, gbpRes] = await Promise.all([...]);
+      return { audit, score };
+    });
```

### `app/api/public/audit/route.ts`

```diff
-import { runWithTenantAsync } from '@/lib/tenant/context';
+import { runWithTenantAsync, runWithTenantBypass } from '@/lib/tenant/context';

-    const systemTenant = await prisma.tenant.upsert({ ... });
-    const audit = await prisma.audit.create({ ... });
+    const systemTenant = await runWithTenantBypass(
+      'public-audit-create-system-tenant-upsert',
+      () => prisma.tenant.upsert({ ... })
+    );
+    const audit = await runWithTenantAsync(systemTenant.id, () =>
+      prisma.audit.create({ ... })
+    );

-    await prisma.audit.update({ where: { id: audit.id }, data: { status: 'FAILED', ... } })
+    await runWithTenantAsync(systemTenant.id, () =>
+      prisma.audit.update({ where: { id: audit.id }, data: { status: 'FAILED', ... } })
+    )
```

---

## Tests Added

File: `tests/security/public-routes-tenant-context.test.ts`

| Test                                                                             | Assertion                                                                          |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| public/audit/[id]: returns audit status when system tenant and audit exist       | 200 + correct body                                                                 |
| public/audit/[id]: uses runWithTenantBypass for system tenant discovery          | bypass called with correct reason; runWithTenantAsync called with system tenant ID |
| public/audit/[id]: returns 404 when system tenant does not exist                 | 404; audit never queried                                                           |
| public/audit/[id]: returns 404 when audit does not exist under system tenant     | 404                                                                                |
| public/audit/[id]: does NOT call Prisma outside tenant context                   | not 500; both helpers called                                                       |
| case-study/generate: generates PDF when audit exists                             | 200 + PDF content-type                                                             |
| case-study/generate: uses runWithTenantBypass for tenant discovery               | bypass + runWithTenantAsync called correctly                                       |
| case-study/generate: returns 404 when audit does not exist                       | 404; PDF never generated                                                           |
| case-study/generate: does NOT call Prisma outside tenant context                 | not 500; both helpers called                                                       |
| case-study/generate: returns 500 with structured error when PDF generation fails | 500 + structured body; no stack trace                                              |
| widget/quick-audit: creates audit and returns score when tenant found by domain  | 200 + auditId + score                                                              |
| widget/quick-audit: creates audit and returns score when tenant found by id      | 200 + auditId                                                                      |
| widget/quick-audit: uses runWithTenantBypass for tenant discovery                | bypass + runWithTenantAsync called correctly                                       |
| widget/quick-audit: returns 400 when tenant domain does not match                | 400; audit never created                                                           |
| widget/quick-audit: returns 400 when tenantId does not match                     | 400; audit never created                                                           |
| widget/quick-audit: returns 400 when neither tenantDomain nor tenantId supplied  | 400; no DB calls                                                                   |
| widget/quick-audit: returns 400 when URL is missing                              | 400; no DB calls                                                                   |
| widget/quick-audit: does NOT call Prisma outside tenant context                  | not 500; both helpers called                                                       |
| widget/quick-audit: audit created with DB-resolved tenant id, not raw body value | auditCreate called with correct tenantId                                           |

---

## Commands Run and Outputs

```
npx vitest run tests/security/public-routes-tenant-context.test.ts
→ Test Files  1 passed (1)
→ Tests  19 passed (19)

npx vitest run tests/security/
→ Test Files  5 passed (5)
→ Tests  33 passed (33)
```

---

## Remaining Risks

1. **`GET /api/case-study/[auditId]/generate` has no auth.** Any caller who knows an audit ID
   can download its case-study PDF. This is a separate P1 concern (add token-based auth or
   restrict to authenticated users). The tenant-context fix prevents `MissingTenantError` but
   does not add access control.

2. **Widget CORS reflects any origin.** The `buildCorsHeaders` function echoes the incoming
   `Origin` header. This is a separate P1 security finding (add per-tenant origin allow-list).
   Not in scope for this fix.

3. **`POST /api/public/audit` system tenant upsert.** The `proposalengine.com` domain is
   hardcoded. If the system tenant is ever renamed or the domain changes, this will silently
   create a new tenant. Consider moving this to a seeded constant or env var.

4. **`$queryRaw`/`$executeRaw` bypass.** The Prisma extension does not cover raw SQL calls.
   Any `$queryRaw` in these routes would still bypass RLS. Currently none of the four routes
   use raw SQL, so this is not an immediate risk here.

---

## Acceptance Criteria Status

| Criterion                                                                     | Status                                     |
| ----------------------------------------------------------------------------- | ------------------------------------------ |
| Three named routes no longer call tenant-scoped Prisma outside tenant context | ✅                                         |
| No `MissingTenantError` on valid requests                                     | ✅ (tests confirm)                         |
| Cross-tenant data access remains blocked                                      | ✅ (RLS enforced via `runWithTenantAsync`) |
| Invalid/missing tenant context fails safely (4xx, not 500)                    | ✅ (tests confirm 400/404)                 |
| Tests cover the regression                                                    | ✅ (19 new tests, all passing)             |
| No secrets changed                                                            | ✅                                         |
| No production/cloud resources touched                                         | ✅                                         |
| Changes minimal and focused                                                   | ✅ (4 route files + 1 test file)           |
