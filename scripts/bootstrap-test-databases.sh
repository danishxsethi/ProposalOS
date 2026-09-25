#!/usr/bin/env bash
set -euo pipefail

# Deterministic, local-only bootstrap for repository DB tests. This script only
# creates missing databases and applies forward Prisma migrations; it never drops
# schemas/databases. RLS suites use proposal_rls_smoke and the restricted app_user.

DB_HOST="${PROPOSALOS_TEST_DB_HOST:-localhost}"
DB_PORT="${PROPOSALOS_TEST_DB_PORT:-5435}"
ADMIN_USER="${PROPOSALOS_TEST_DB_ADMIN_USER:-postgres}"
ADMIN_PASSWORD="${PROPOSALOS_TEST_DB_ADMIN_PASSWORD:-password}"
APP_USER="${PROPOSALOS_TEST_DB_APP_USER:-app_user}"
APP_PASSWORD="${PROPOSALOS_TEST_DB_APP_PASSWORD:-password}"
APP_DB="${PROPOSALOS_TEST_DB:-proposal_engine_test}"
RLS_DB="${PROPOSALOS_RLS_TEST_DB:-proposal_rls_smoke}"
POOL_HOST="${PROPOSALOS_PGBOUNCER_HOST:-localhost}"
POOL_PORT="${PROPOSALOS_PGBOUNCER_PORT:-6432}"
PGBOUNCER_CONTAINER="${PROPOSALOS_PGBOUNCER_CONTAINER:-proposalos-pgbouncer}"
POSTGRES_CONTAINER="${PROPOSALOS_POSTGRES_CONTAINER:-proposal_engine_db}"

if [[ "$DB_HOST" != "localhost" && "$DB_HOST" != "127.0.0.1" ]] || \
   [[ "$POOL_HOST" != "localhost" && "$POOL_HOST" != "127.0.0.1" ]]; then
  printf '%s\n' 'Refusing to bootstrap a non-local database. Use localhost/127.0.0.1 only.' >&2
  exit 2
fi

for db in "$APP_DB" "$RLS_DB"; do
  if [[ ! "$db" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]]; then
    printf 'Invalid test database name: %s\n' "$db" >&2
    exit 2
  fi
done

command -v psql >/dev/null
command -v pg_isready >/dev/null
pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$ADMIN_USER" >/dev/null
PGPASSWORD="$ADMIN_PASSWORD" psql -X -v ON_ERROR_STOP=1 -h "$DB_HOST" -p "$DB_PORT" -U "$ADMIN_USER" -d postgres \
  -v app_db="$APP_DB" -v rls_db="$RLS_DB" -v app_user="$APP_USER" -v app_password="$APP_PASSWORD" <<'SQL'
SELECT format('CREATE DATABASE %I', :'app_db')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'app_db')\gexec
SELECT format('CREATE DATABASE %I', :'rls_db')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'rls_db')\gexec
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'app_user', :'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_user')\gexec
SELECT format('ALTER ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOBYPASSRLS', :'app_user', :'app_password')\gexec
SQL

for db in "$APP_DB" "$RLS_DB"; do
  admin_url="postgresql://${ADMIN_USER}:${ADMIN_PASSWORD}@${DB_HOST}:${DB_PORT}/${db}"
  DATABASE_URL="$admin_url" DIRECT_URL="$admin_url" npx prisma migrate deploy
  PGPASSWORD="$ADMIN_PASSWORD" psql -X -v ON_ERROR_STOP=1 -h "$DB_HOST" -p "$DB_PORT" -U "$ADMIN_USER" -d "$db" \
    -v app_user="$APP_USER" <<'SQL'
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), :'app_user')\gexec
SELECT format('GRANT USAGE ON SCHEMA public TO %I', :'app_user')\gexec
SELECT format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO %I', :'app_user')\gexec
SELECT format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO %I', :'app_user')\gexec
SELECT format('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I', :'app_user')\gexec
SELECT format('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO %I', :'app_user')\gexec
SQL
done

if [[ "${PROPOSALOS_RLS_SET_ROLE_PASSWORD:-1}" == "1" ]]; then
  PGPASSWORD="$ADMIN_PASSWORD" psql -X -v ON_ERROR_STOP=1 -h "$DB_HOST" -p "$DB_PORT" -U "$ADMIN_USER" -d postgres \
    -v app_user="$APP_USER" -v app_password="$APP_PASSWORD" <<'SQL'
SELECT format('ALTER ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOBYPASSRLS', :'app_user', :'app_password')\gexec
SQL
fi

if ! pg_isready -h "$POOL_HOST" -p "$POOL_PORT" -U "$APP_USER" -d "$RLS_DB" >/dev/null; then
  printf 'PgBouncer is not ready at %s:%s for app_user/%s. Start the repository pgbouncer service.\n' "$POOL_HOST" "$POOL_PORT" "$RLS_DB" >&2
  exit 3
fi

printf 'Test DB bootstrap complete. App DB: %s; RLS DB: %s; RLS endpoint: %s:%s (transaction pool).\n' \
  "$APP_DB" "$RLS_DB" "$POOL_HOST" "$POOL_PORT"

if [[ "$#" -gt 0 ]]; then
  if [[ "$1" == "--" ]]; then shift; fi
  if [[ "$#" -eq 0 ]]; then
    printf '%s\n' 'Expected a command after --' >&2
    exit 2
  fi
  export DATABASE_URL="postgresql://${ADMIN_USER}:${ADMIN_PASSWORD}@${DB_HOST}:${DB_PORT}/${APP_DB}"
  export DIRECT_URL="$DATABASE_URL"
  export PROPOSALOS_RLS_DIRECT_URL="postgresql://${ADMIN_USER}:${ADMIN_PASSWORD}@${DB_HOST}:${DB_PORT}/${RLS_DB}"
  export PROPOSALOS_RLS_APP_URL="postgresql://${APP_USER}:${APP_PASSWORD}@${POOL_HOST}:${POOL_PORT}/${RLS_DB}?pgbouncer=true"
  export PROPOSALOS_RLS_TEST_DB="$RLS_DB"
  exec "$@"
fi
