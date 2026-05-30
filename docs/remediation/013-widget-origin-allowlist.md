# 013 — Widget Origin Allow-List

**Status:** COMPLETE  
**Branch:** phase-2-rls-migration  
**Date:** 2026-05-15

---

## Original Issue

`OPTIONS /api/widget/quick-audit` reflected any `Origin` header value back as
`Access-Control-Allow-Origin`, and the corresponding `POST` handler did the
same. Combined with the route being public, this gave any third-party site
the ability to:

- Trigger audits in any tenant by supplying a known `tenantId` or
  `tenantDomain` in the body.
- Bypass standard browser-side same-origin restrictions because the server
  echoed every request origin as allow-listed.
- Spoof a tenant's branded widget on attacker-controlled domains.

The previous `buildCorsHeaders` helper:

```ts
const origin = req.headers.get('origin') || req.headers.get('x-widget-origin') || '*';
return { 'Access-Control-Allow-Origin': origin, ... };
```

fell back to `*` when no Origin was present, and trusted `X-Widget-Origin`
(an attacker-controlled header) as a tenant signal.

---

## Origin Allow-List Model

**Storage:** `TenantBranding.allowedWidgetOrigins TEXT[]`

- Tenant-level field, exact-match only.
- Empty array (default) → widget is **disabled** for that tenant.
- No wildcards. No subdomain matching. No path/query/fragment.
- Per-tenant, so cross-tenant origin reuse is impossible.

**Storage migration:** `prisma/migrations/20260515120000_widget_origin_allowlist/migration.sql`

- Forward-only `ADD COLUMN ... TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]`.
- Safe for empty-DB replay (no data manipulation).
- Existing tenants get an empty list — widget is disabled until they
  configure origins. This is the safe default for security.

---

## Validation Logic

`lib/widget/origin.ts`:

```ts
normalizeOrigin(rawOrigin)
  → null on missing/malformed/literal "null"/non-http(s)/path-bearing
  → lowercase host, scheme://host[:port] otherwise

checkOriginAgainstAllowList(rawOrigin, allowList)
  → { allowed: true,  origin }            on exact match
  → { allowed: false, reason: 'missing'        }
  → { allowed: false, reason: 'malformed'      }
  → { allowed: false, reason: 'not_allow_listed' }

buildAllowedCorsHeaders(allowedOrigin)
  → echoes the *exact normalized origin* (never '*')
  → adds Vary: Origin
  → minimal Allow-Methods/Allow-Headers
buildDeniedCorsHeaders()
  → only Vary: Origin (no Allow-Origin)
```

The allow-list is read from the **resolved tenant's** `TenantBranding.
allowedWidgetOrigins`, so attacker-supplied `tenantId`/`tenantDomain` cannot
escape origin validation:

1. Body's `tenantId`/`tenantDomain` is the lookup key, not the trust source.
2. The resolved DB row's allow-list is the trust source.
3. The request's `Origin` must be in that resolved tenant's list.

---

## CORS Behavior Before / After

### OPTIONS preflight

| Case                                       | Before                                    | After                                           |
| ------------------------------------------ | ----------------------------------------- | ----------------------------------------------- |
| Origin `https://attacker.com`              | 200, `Allow-Origin: https://attacker.com` | 403, no Allow-Origin                            |
| Origin missing                             | 200, `Allow-Origin: *`                    | 403, no Allow-Origin                            |
| Origin `https://agency.com` (allow-listed) | 200, `Allow-Origin: https://agency.com`   | 204, `Allow-Origin: https://agency.com` (exact) |
| Tenant identifier missing                  | 200, `Allow-Origin: *`                    | 403, no Allow-Origin                            |
| Unknown tenant                             | 200, `Allow-Origin: <attacker>`           | 403, no Allow-Origin                            |

### POST

| Case                                      | Before                                             | After                                               |
| ----------------------------------------- | -------------------------------------------------- | --------------------------------------------------- |
| Allow-listed origin                       | 200, `Allow-Origin: <reflected>`                   | 200, `Allow-Origin: <exact-normalized>`             |
| Disallowed origin                         | 200, audit created                                 | 403 `ORIGIN_NOT_ALLOWED`, no audit, no Allow-Origin |
| Missing origin                            | 200, `Allow-Origin: *`, audit created              | 403, no audit, no Allow-Origin                      |
| Malformed origin (`javascript:`)          | 200, `Allow-Origin: javascript:...`, audit created | 403, no audit, no Allow-Origin                      |
| Cross-tenant origin (tenant A → tenant B) | 200, audit created in tenant B                     | 403, no audit                                       |
| Tenant with empty allow-list              | 200, audit created                                 | 403, no audit                                       |
| `*` ever returned for widget              | yes (fallback path)                                | never                                               |

`Vary: Origin` is set on every response (allowed or denied) so caches
do not poison across origins.

---

## Files Changed

| File                                                                     | Change                                                                                 |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `prisma/schema.prisma`                                                   | Added `TenantBranding.allowedWidgetOrigins String[] @default([])`                      |
| `prisma/migrations/20260515120000_widget_origin_allowlist/migration.sql` | New migration (forward-only, default empty array)                                      |
| `lib/widget/origin.ts`                                                   | **New** — origin parsing, allow-list check, header builders, structured denial logging |
| `app/api/widget/quick-audit/route.ts`                                    | Rewritten — strict per-tenant origin validation in OPTIONS + POST                      |
| `tests/security/widget-origin-allowlist.test.ts`                         | **New** — 30 tests                                                                     |
| `tests/security/public-routes-tenant-context.test.ts`                    | Updated existing widget tests to include `Origin` header + branding fixture            |

---

## Tenant Resolution & Cross-Cutting Safety

- **SSRF protection**: still enforced — `quickAuditSchema` validates the
  audit target URL with `urlSchema` (https only, valid URL). No change here.
- **Rate limiting**: unchanged — `RateLimitPresets.publicApi` still wraps
  POST. Origin denial happens _inside_ the rate-limited handler so
  malicious origins still consume rate-limit budget (intentional).
- **Tenant context / RLS**: unchanged — `runWithTenantBypass` is used only
  for the narrow tenant lookup; all data work runs under `runWithTenantAsync`.
- **Idempotency**: not previously applied to this route; not added now (out
  of scope).
- **Logging**: denial events log only `route`, `reason`, normalized
  `origin`, and `tenantId` — no body content, no headers, no secrets.

---

## Tests Added

`tests/security/widget-origin-allowlist.test.ts` — 30 tests covering:

**Unit — origin module**

- `normalizeOrigin`: 7 cases (lower-case host, default ports, schemes,
  malformed, paths/query/fragments)
- `checkOriginAgainstAllowList`: 8 cases (exact match, scheme/subdomain/port
  diff, missing, malformed, empty list, wildcard literal not matched)
- Header builders: 2 cases (exact origin echoed, never `*`; denied has only
  Vary)

**Integration — OPTIONS preflight**

- Allowed origin → 204 with exact origin
- Disallowed origin → 403, no Allow-Origin
- Malformed origin → 403
- Missing origin → 403
- Missing tenant identifier → 403, no DB lookup
- Unknown tenant → 403

**Integration — POST**

- Allowed origin → 200
- Disallowed origin → 403 `ORIGIN_NOT_ALLOWED`, no audit created
- Missing origin → 403
- Malformed origin → 403
- Attacker-supplied tenantId + foreign origin → 403
- Cross-tenant origin attempt → 403
- Empty allow-list → 403 even from sensible origin
- Never `Allow-Origin: *` on POST
- Body validation failure → 400 with no permissive CORS
- Origin denial logs structured event with safe metadata only

Plus updated **public-routes-tenant-context.test.ts** widget cases (10) to
include the `Origin` header + branding fixture.

---

## Commands Run and Outputs

```
$ npx vitest run tests/security/widget-origin-allowlist.test.ts \
                 tests/security/public-routes-tenant-context.test.ts
 Test Files  2 passed (2)
       Tests  53 passed (53)

$ npx vitest run tests/security/
 Test Files  10 passed (10)
       Tests  143 passed (143)
    Duration  6.17s
```

---

## Acceptance Criteria

| Criterion                                                    | Status                                                                         |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Widget preflight no longer reflects arbitrary origins        | ✅ Strict allow-list, denied = 403 + no Allow-Origin                           |
| Widget POST no longer reflects arbitrary origins             | ✅ Same logic shared via `lib/widget/origin.ts`                                |
| Only tenant-approved origins can call the widget route       | ✅ Per-tenant `TenantBranding.allowedWidgetOrigins`                            |
| Tenant A's allowed origin cannot access Tenant B's widget    | ✅ Tested                                                                      |
| Disallowed/malformed/missing origins fail safely (4xx)       | ✅ All return 403                                                              |
| `Access-Control-Allow-Origin: *` not used for widget traffic | ✅ Asserted in tests                                                           |
| Tests cover allowed/denied/malformed/cross-tenant cases      | ✅ 30 new tests                                                                |
| Tenant context and SSRF protections remain intact            | ✅ `quickAuditSchema` URL validation unchanged; `runWithTenantAsync` unchanged |
| Remediation note exists                                      | ✅ This file                                                                   |
| No production/staging/cloud resources touched                | ✅                                                                             |
| No secrets changed                                           | ✅                                                                             |

---

## Remaining Risks

- **Existing tenants need to populate `allowedWidgetOrigins`.** The
  migration defaults to an empty array, which means widget calls will be
  denied until the tenant configures origins. This is the safe default
  but operators must communicate the change to active tenants before
  rolling forward. No production database is touched by this change —
  this is a deployment coordination note.
- **Embed snippets must include the tenant identifier.** The OPTIONS
  preflight needs `?tenantId=` or `?tenantDomain=` in the URL because
  preflight requests carry no body. The widget JS embed should be
  updated to attach the tenant identifier as a query string parameter on
  every fetch URL. This is a follow-up for the widget client team.
- **Audit/dashboard UI for managing the allow-list is out of scope.** Until
  a UI exists, allow-list values must be set via direct DB write or admin
  tooling.
