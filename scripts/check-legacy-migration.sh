#!/usr/bin/env bash
# check-legacy-migration.sh
#
# Additive verification: replays representative legacy (pre-R1) data through the
# current Prisma migration chain on a disposable local PostgreSQL database.
#
# Flow:
#   1. Create a fresh disposable database on the local Postgres container
#      (same container/URL convention as scripts/check-migration-replay.sh).
#   2. Build the PRE-R1 schema checkpoint by applying every migration in
#      prisma/migrations up to and including the last pre-R1 migration
#      (20260713090000_wave9d_lifecycle_controls), recording each in
#      _prisma_migrations so the tooling sees a real migration history.
#   3. Seed the deterministic legacy fixture (scripts/fixtures/legacy-pre-r1-seed.sql).
#   4. Apply exactly the remaining (current/R1) migrations via
#      `prisma migrate deploy`.
#   5. Run the TS verifier (scripts/verify-legacy-migration.ts) which asserts
#      row/tenant/relationship preservation, confidence normalization, valid
#      enums, and Prisma readback, then writes machine-readable evidence to
#      docs/audits/2026-09-18-proposal-os-ground-up-ga-audit/artifacts/legacy-migration.json.
#
# Usage:
#   ./scripts/check-legacy-migration.sh
#
# Exit codes:
#   0 — migration + all verifications passed
#   1 — any step failed (see output / evidence JSON)

set -euo pipefail

POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-proposal_engine_db}"
DATABASE_URL_BASE="${DATABASE_URL_BASE:-postgresql://postgres:password@localhost:5435}"
TEST_DB_NAME="legacy_migration_verify_$$"
DATABASE_URL="${DATABASE_URL_BASE}/${TEST_DB_NAME}"
ARTIFACT="docs/audits/2026-09-18-proposal-os-ground-up-ga-audit/artifacts/legacy-migration.json"
FIXTURE="scripts/fixtures/legacy-pre-r1-seed.sql"

# Pre-R1 checkpoint: last migration before the R1 (20260924*) chain.
PRE_R1_LAST="20260713090000_wave9d_lifecycle_controls"

cleanup() {
  echo "🧹 Dropping disposable database: ${TEST_DB_NAME}"
  docker exec "${POSTGRES_CONTAINER}" psql -U postgres -c "DROP DATABASE IF EXISTS ${TEST_DB_NAME}" 2>/dev/null || true
}
trap cleanup EXIT

mkdir -p "$(dirname "${ARTIFACT}")"

echo "🗄️  Creating disposable database: ${TEST_DB_NAME}"
docker exec "${POSTGRES_CONTAINER}" psql -U postgres -c "CREATE DATABASE ${TEST_DB_NAME}"

echo "🏗️  Building pre-R1 schema checkpoint (up to ${PRE_R1_LAST})..."
docker exec "${POSTGRES_CONTAINER}" psql -U postgres -d "${TEST_DB_NAME}" -v ON_ERROR_STOP=1 -q \
  -c 'CREATE TABLE "_prisma_migrations" (
        "id"                  VARCHAR(36) PRIMARY KEY NOT NULL,
        "checksum"            VARCHAR(64) NOT NULL,
        "finished_at"         TIMESTAMPTZ,
        "migration_name"      VARCHAR(255) NOT NULL,
        "logs"                TEXT,
        "rolled_back_at"      TIMESTAMPTZ,
        "started_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),
        "applied_steps_count" INTEGER UNSIGNED NOT NULL DEFAULT 0
      )' 2>/dev/null || docker exec "${POSTGRES_CONTAINER}" psql -U postgres -d "${TEST_DB_NAME}" -v ON_ERROR_STOP=1 -q \
  -c 'CREATE TABLE "_prisma_migrations" (
        "id"                  VARCHAR(36) PRIMARY KEY NOT NULL,
        "checksum"            VARCHAR(64) NOT NULL,
        "finished_at"         TIMESTAMPTZ,
        "migration_name"      VARCHAR(255) NOT NULL,
        "logs"                TEXT,
        "rolled_back_at"      TIMESTAMPTZ,
        "started_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),
        "applied_steps_count" INTEGER NOT NULL DEFAULT 0
      )'

for dir in prisma/migrations/*/; do
  name="$(basename "${dir}")"
  [[ "${name}" == "migration_lock.toml" ]] && continue
  [[ "${name}" > "${PRE_R1_LAST}" ]] && continue
  echo "  ▶ checkpoint: ${name}"
  docker exec -i "${POSTGRES_CONTAINER}" psql -U postgres -d "${TEST_DB_NAME}" -v ON_ERROR_STOP=1 -q < "${dir}migration.sql"
  checksum="$(sha256sum "${dir}migration.sql" | cut -d' ' -f1)"
  docker exec "${POSTGRES_CONTAINER}" psql -U postgres -d "${TEST_DB_NAME}" -v ON_ERROR_STOP=1 -q \
    -c "INSERT INTO \"_prisma_migrations\" (\"id\", \"checksum\", \"finished_at\", \"migration_name\", \"logs\", \"rolled_back_at\", \"started_at\", \"applied_steps_count\")
        VALUES (gen_random_uuid()::text, '${checksum}', now(), '${name}', NULL, NULL, now(), 1)"
done

echo "🌱 Seeding deterministic legacy fixture: ${FIXTURE}"
docker exec -i "${POSTGRES_CONTAINER}" psql -U postgres -d "${TEST_DB_NAME}" -v ON_ERROR_STOP=1 -q < "${FIXTURE}"

echo "🚀 Applying current migrations via prisma migrate deploy..."
DATABASE_URL="${DATABASE_URL}" npx prisma migrate deploy

echo "🔍 Verifying migration outcome..."
DATABASE_URL="${DATABASE_URL}" LEGACY_ARTIFACT="${ARTIFACT}" npx tsx scripts/verify-legacy-migration.ts

echo "✅ Legacy migration verification passed. Evidence: ${ARTIFACT}"
