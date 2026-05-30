#!/usr/bin/env bash
# check-migration-replay.sh
#
# CI guard: verifies that the full Prisma migration chain replays cleanly
# from an empty local Postgres database.
#
# Usage:
#   ./scripts/check-migration-replay.sh
#
# Requirements:
#   - Docker running with a local Postgres container named proposal_engine_db
#     (or set POSTGRES_CONTAINER env var to override)
#   - DATABASE_URL_BASE env var pointing to the Postgres host/port/user/password
#     (defaults to postgresql://postgres:password@localhost:5435)
#
# Exit codes:
#   0 — all migrations applied successfully
#   1 — migration replay failed (see output for details)

set -euo pipefail

POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-proposal_engine_db}"
DATABASE_URL_BASE="${DATABASE_URL_BASE:-postgresql://postgres:password@localhost:5435}"
TEST_DB_NAME="migration_replay_ci_$$"
DATABASE_URL="${DATABASE_URL_BASE}/${TEST_DB_NAME}"

cleanup() {
  echo "🧹 Cleaning up test database: ${TEST_DB_NAME}"
  docker exec "${POSTGRES_CONTAINER}" psql -U postgres -c "DROP DATABASE IF EXISTS ${TEST_DB_NAME}" 2>/dev/null || true
}

trap cleanup EXIT

echo "🗄️  Creating fresh test database: ${TEST_DB_NAME}"
docker exec "${POSTGRES_CONTAINER}" psql -U postgres -c "CREATE DATABASE ${TEST_DB_NAME}"

echo "🚀 Running prisma migrate deploy against empty database..."
DATABASE_URL="${DATABASE_URL}" npx prisma migrate deploy

echo "✅ Migration replay succeeded — all migrations applied cleanly from empty DB."
