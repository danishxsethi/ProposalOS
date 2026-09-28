# 11 — CI/CD and Deployment — Fable 5.1 Full Advancement

**CI run in this session:** `npm run lint 0 errors`, `npm run typecheck PASS`, `npm run build PASS`, `npm test 2755/2755 PASS` (266 suites), `npm run security:audit:prod PASS` (0 HIGH/CRITICAL), `prisma validate` + empty-DB `migrate deploy 26` proven, `scripts/build-target-list.ts` mapsIntelligence provider-wired.

**Staging deploy:** not run — canonical is `Dockerfile node:20-alpine+chromium standalone` → Cloud Run + Secret Manager SKIP_ENV_VALIDATION build trick → instrumentation.ts env validate at runtime.
