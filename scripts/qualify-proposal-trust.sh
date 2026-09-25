#!/usr/bin/env bash
set -euo pipefail

npm run security:audit:prod
npm run test:qualified
npx vitest run tests/security --reporter=dot
bash scripts/bootstrap-test-databases.sh -- npx vitest run \
  lib/tenant/__tests__/isolation.test.ts \
  lib/tenant/__tests__/isolation-stress.test.ts \
  lib/tenant/__tests__/shim-integration.test.ts \
  --reporter=dot
bash scripts/bootstrap-test-databases.sh -- npx tsx scripts/rls-smoke-test.ts
npm run typecheck
npm run lint
npm run build
npx prisma validate
npx prisma format --check
npx prisma generate
npx prisma migrate status
bash scripts/check-migration-replay.sh
npx tsx scripts/check-test-skip-ledger.ts
git diff --check
