# Post-transfer API authentication boundary review

Date checked: 2026-10-09. Source-only changes; no runtime or database was accessed.

## Changes

- The architecture test normalizes route paths across Windows and Linux. This makes the exact public auth-route exemptions work consistently on both platforms.
- The test no longer exempts the whole `admin/` tree. It recognizes the explicit `withRole(...)`, `withAuth`, `verifyCronAuth`, and `verifyAdminOrCronAuth` guards. Public registration and the NextAuth callback remain exact-route exemptions.
- `/api/admin/model-metrics` returns fixed sample metrics, not database data. It now requires an authenticated session/API key through `withAuth`.
- `/api/admin/observability-metrics` and `/api/admin/qa-telemetry` retained their existing `ADMIN_API_KEY` and `CRON_SECRET` bearer credentials but now use one shared verifier. It fails closed if neither secret is configured, compares fixed-length SHA-256 digests with `timingSafeEqual`, and applies the existing fail-closed rate limiter to invalid attempts.

## Qualification

The focused auth-session architecture test, SSRF boundary test, and shared admin-auth unit tests pass together: 3 files, 12 tests. Full application, tenant/RLS, and database-backed tests are not implied by this focused result.

No admin endpoint was added to the test's public allowlist. The public liveness endpoint remains an exact exemption with process-only output, as documented by the existing architecture test.
