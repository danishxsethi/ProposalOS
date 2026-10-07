# Multi-Tenancy & Authorization

## Controls observed

- Tenant IDs are pervasive in Prisma schema and migrations.
- Prisma extension fails closed when tenant context is missing and supports context-bound RLS setup.
- API key and session middleware exist; worker and cron secrets have separate helpers.
- Architecture/security tests cover selected tenant and persistence boundaries.

## Release blockers

- Auth.js JWT update callback merges client/session fields into authorization claims (`lib/auth.config.ts:49-51`). Role and tenant claims must be server-derived.
- Tenant API key `*` scope is documented as tenant-wide but is treated as platform admin in destructive tenant routes.
- `getTenantId()` accepts raw `x-tenant-id` before session resolution; several `withRole` routes do not establish trusted context.
- Audit route treats any non-empty `x-internal-ops-key` as quota bypass.
- Prospect route is public and can accept attacker-selected tenant header.
- Client export/improvement/scan and public token mutation routes do not consistently authenticate or enter tenant context.
- Public proposal status route can mutate accepted/rejected/closed lifecycle state.
- Admin layout authenticates but does not enforce admin role centrally.
- Cron secret is accepted by admin telemetry routes.

**State:** `GA_BLOCKED_BY_NAMED_GATES`.

Live two-tenant negative tests, live RLS role/schema verification, and runtime endpoint testing are blocked by unavailable credentials/runtime. Static defects are sufficient to fail the security gate.
