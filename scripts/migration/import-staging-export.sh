#!/bin/bash
set -Eeuo pipefail

phase=bootstrap
on_error() {
  local status=$?
  trap - ERR
  printf 'importer command failed; phase=%s; exit_code=%s\n' "$phase" "$status" >&2
  exit "$status"
}
trap on_error ERR

printf '%s\n' "staging database importer starting"

fail() {
  printf '%s\n' "database import stopped: $1" >&2
  exit 1
}

: "${AWS_REGION:?AWS_REGION is required}"
: "${MIGRATION_EXPORT_BUCKET:?MIGRATION_EXPORT_BUCKET is required}"
: "${MIGRATION_EXPORT_KEY:?MIGRATION_EXPORT_KEY is required}"
: "${MIGRATION_EXPORT_ETAG:?MIGRATION_EXPORT_ETAG is required}"
: "${MIGRATION_EXPORT_SIZE_BYTES:?MIGRATION_EXPORT_SIZE_BYTES is required}"
: "${TARGET_DATABASE:?TARGET_DATABASE is required}"
: "${DATABASE_URL_SECRET_ARN:?DATABASE_URL_SECRET_ARN is required}"
: "${RDS_ENDPOINT:?RDS_ENDPOINT is required}"
: "${RDS_PORT:?RDS_PORT is required}"
: "${RDS_MASTER_SECRET_JSON:?RDS_MASTER_SECRET_JSON is required}"

if [ "$TARGET_DATABASE" != "proposal_engine" ]; then
  fail "the target database is outside the approved staging database"
fi

case "$MIGRATION_EXPORT_BUCKET/$MIGRATION_EXPORT_KEY" in
  proposalos-migration-410432886960-20261003/proposal_engine.sql) ;;
  *) fail "the source is outside the approved candidate export" ;;
esac

phase=verify_export_metadata
printf 'phase=%s starting\n' "$phase"
metadata="$(aws s3api head-object \
  --region "$AWS_REGION" \
  --bucket "$MIGRATION_EXPORT_BUCKET" \
  --key "$MIGRATION_EXPORT_KEY" \
  --query '[ETag,ContentLength]' \
  --output json)" || fail "cannot read migration export metadata"
actual_etag="$(printf '%s' "$metadata" | jq -r '.[0]' | tr -d '"')"
actual_size="$(printf '%s' "$metadata" | jq -r '.[1]')"

if [ "$actual_etag" != "$MIGRATION_EXPORT_ETAG" ] || [ "$actual_size" != "$MIGRATION_EXPORT_SIZE_BYTES" ]; then
  fail "the source export does not match the recorded size and checksum"
fi

phase=configure_db_connection
printf 'phase=%s starting\n' "$phase"
PGHOST="$RDS_ENDPOINT"
PGPORT="$RDS_PORT"
PGUSER="$(printf '%s' "$RDS_MASTER_SECRET_JSON" | jq -er '.username')"
PGPASSWORD="$(printf '%s' "$RDS_MASTER_SECRET_JSON" | jq -er '.password')"
PGSSLMODE=require
export PGHOST PGPORT PGUSER PGPASSWORD PGSSLMODE
unset RDS_MASTER_SECRET_JSON

phase=verify_empty_database
printf 'phase=%s starting\n' "$phase"
psql_flags=(-X --no-psqlrc --set ON_ERROR_STOP=1)
table_count="$(psql "${psql_flags[@]}" --dbname "$TARGET_DATABASE" --tuples-only --no-align \
  --command "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';")" || fail "cannot verify the staging database"
if [ "$table_count" != "0" ]; then
  fail "the staging target is not empty; refusing to replay the export"
fi

app_password="$(openssl rand -hex 32)"
secret_file="$(mktemp)"
cleanup() {
  if [ -n "${secret_file:-}" ]; then
    rm -f -- "$secret_file"
  fi
  unset app_password app_database_url PGPASSWORD
}
trap cleanup EXIT
chmod 600 "$secret_file"

phase=provision_app_role
printf 'phase=%s starting\n' "$phase"
app_role="proposalos_app_$(openssl rand -hex 4)"
printf "CREATE ROLE \"%s\" WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '%s';\n" "$app_role" "$app_password" > "$secret_file"
psql "${psql_flags[@]}" --dbname "$TARGET_DATABASE" --file "$secret_file" >/dev/null || fail "could not provision the restricted staging application role"

app_database_url="postgresql://${app_role}:${app_password}@${PGHOST}:${PGPORT}/${TARGET_DATABASE}?sslmode=require"
printf '%s' "$app_database_url" > "$secret_file"
phase=store_app_database_url
printf 'phase=%s starting\n' "$phase"
env -u PGHOST -u PGPORT -u PGUSER -u PGPASSWORD -u PGSSLMODE \
  aws secretsmanager put-secret-value \
    --region "$AWS_REGION" \
    --secret-id "$DATABASE_URL_SECRET_ARN" \
    --secret-string "file://${secret_file}" \
    --query VersionId \
    --output text >/dev/null || fail "could not store the staging application database URL"
unset app_database_url app_password

phase=grant_database_access
printf 'phase=%s starting\n' "$phase"
psql "${psql_flags[@]}" --dbname "$TARGET_DATABASE" --command \
  "GRANT CONNECT ON DATABASE proposal_engine TO \"${app_role}\"; GRANT USAGE ON SCHEMA public TO \"${app_role}\";" >/dev/null || fail "could not grant staging application database access"

printf '%s\n' "streaming verified SQL export into the empty private staging database"
phase=restore_sql_export
# Cloud SQL exports carry source-platform ownership and ACL commands. They can
# refer to Google-managed roles that do not exist in RDS; recreate ownership on
# the AWS side and apply the restricted application-role grants below instead.
env -u PGHOST -u PGPORT -u PGUSER -u PGPASSWORD -u PGSSLMODE \
  aws s3 cp \
  "s3://${MIGRATION_EXPORT_BUCKET}/${MIGRATION_EXPORT_KEY}" - \
  --region "$AWS_REGION" \
  --only-show-errors \
  | sed -E '/^[[:space:]]*(ALTER [^;]* OWNER TO |ALTER DEFAULT PRIVILEGES |GRANT |REVOKE |SET SESSION AUTHORIZATION )/d' \
  | psql "${psql_flags[@]}" --dbname "$TARGET_DATABASE" >/dev/null 2>&1 || fail "PostgreSQL rejected the filtered export; preserve logs and rebuild the staging target before retrying"

phase=grant_app_access
printf 'phase=%s starting\n' "$phase"
psql "${psql_flags[@]}" --dbname "$TARGET_DATABASE" --command \
  "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO \"${app_role}\"; GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO \"${app_role}\"; ALTER DEFAULT PRIVILEGES FOR ROLE proposalos_master IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO \"${app_role}\"; ALTER DEFAULT PRIVILEGES FOR ROLE proposalos_master IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO \"${app_role}\";" >/dev/null || fail "could not apply restricted staging application grants"

phase=verify_import
printf 'phase=%s starting\n' "$phase"
role_safe="$(psql "${psql_flags[@]}" --dbname "$TARGET_DATABASE" --tuples-only --no-align \
  --command "SELECT (NOT rolsuper AND NOT rolbypassrls)::text FROM pg_roles WHERE rolname = '${app_role}';")" || fail "could not verify staging role safety"
if [ "$role_safe" != "true" ]; then
  fail "staging application role does not satisfy the non-superuser RLS role guard"
fi

table_count="$(psql "${psql_flags[@]}" --dbname "$TARGET_DATABASE" --tuples-only --no-align \
  --command "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';")" || fail "could not verify imported schema metadata"
migration_summary="$(psql "${psql_flags[@]}" --dbname "$TARGET_DATABASE" --tuples-only --no-align \
  --command "SELECT count(*) || ':' || COALESCE(max(migration_name), 'none') FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;")" || fail "could not verify Prisma migration metadata"

printf 'import complete; public_tables=%s; completed_migrations=%s\n' "$table_count" "$migration_summary"
