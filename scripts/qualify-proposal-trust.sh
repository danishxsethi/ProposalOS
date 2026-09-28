#!/usr/bin/env bash
set -euo pipefail

npm run security:audit:prod
npx vitest run tests/security/maps-provider.test.ts tests/security/commercial-lifecycle.test.ts tests/security/outbound-delivery.test.ts tests/security/image-size-advisory-regression.test.ts tests/security/presentation-export-boundary.test.ts --reporter=dot
npx vitest run lib/modules/__tests__/gbpIdentityMatch.test.ts lib/modules/__tests__/gbpDeepImplementation.test.ts --reporter=dot
npm run typecheck
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
