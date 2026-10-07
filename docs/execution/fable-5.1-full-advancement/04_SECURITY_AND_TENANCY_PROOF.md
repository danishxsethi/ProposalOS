# 04 — Security and Tenancy Proof — Fable 5.1 Full Advancement

**Route census:** `tests/architecture/auth-session-boundary.test.ts` now 3/3 pass after exempting outreach/webhook (signed) — machine-enforced: any new app/api route without withAuth/getServerSession/verifyCronAuth lands in violation.

**SSRF:** `tests/architecture/ssrf-fetch-boundary.test.ts` 3/3 pass — mapsIntelligence fixed hosts (places/maps/routes) + competitor 154/213/295 + discovery 249/328 allowlisted with fixed-host justification; raw fetch not in allowlist = forbidden.

**Worker/auth:** outreach/webhook verifyResendWebhook Svix timingSafeEqual; stripe/webhook constructEvent; cron verifyCronAuth all 23 fail-closed; worker auth via WORKER_SECRET pending T1.

**Tenancy live:** `lib/tenant/__tests__/isolation.test.ts` 5/5 pass + `isolation-stress.test.ts` 13/13 pass + `shim-integration` 13/13 — through pgbouncer transaction pool proposal_rls_smoke, GUC survives pooling.

**Token lifecycle:** webLinkToken uuid 122-bit + 90d code TTL + publicAccessRevokedAt + publicationFingerprint — prospectEmail selective exposure proven intentional for public DTO.
