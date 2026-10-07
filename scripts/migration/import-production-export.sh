#!/usr/bin/env bash
set -Eeuo pipefail

phase=bootstrap
on_error() {
  local status=$?
  trap - ERR
  printf 'production importer failed; phase=%s; exit_code=%s\n' "$phase" "$status" >&2
  exit "$status"
}
trap on_error ERR

fail() {
  printf 'production database import stopped: %s\n' "$1" >&2
  exit 1
}

: "${AWS_REGION:?AWS_REGION is required}"
: "${EXPECTED_AWS_ACCOUNT_ID:?EXPECTED_AWS_ACCOUNT_ID is required}"
: "${EXPECTED_RDS_IDENTIFIER:?EXPECTED_RDS_IDENTIFIER is required}"
: "${MIGRATION_EXPORT_BUCKET:?MIGRATION_EXPORT_BUCKET is required}"
: "${MIGRATION_EXPORT_KEY:?MIGRATION_EXPORT_KEY is required}"
: "${MIGRATION_EXPORT_ETAG:?MIGRATION_EXPORT_ETAG is required}"
: "${MIGRATION_EXPORT_SIZE_BYTES:?MIGRATION_EXPORT_SIZE_BYTES is required}"
: "${TARGET_DATABASE:?TARGET_DATABASE is required}"
: "${DATABASE_URL_SECRET_ARN:?DATABASE_URL_SECRET_ARN is required}"
: "${RDS_ENDPOINT:?RDS_ENDPOINT is required}"
: "${RDS_PORT:?RDS_PORT is required}"
: "${RDS_MASTER_SECRET_JSON:?RDS_MASTER_SECRET_JSON is required}"

if [[ "$AWS_REGION" != "us-east-2" || "$EXPECTED_AWS_ACCOUNT_ID" != "410432886960" || "$EXPECTED_RDS_IDENTIFIER" != "proposalos-production-db" ]]; then
  fail "task is not configured for the approved production AWS account, region, and RDS instance"
fi

if [[ "$TARGET_DATABASE" != "proposal_engine" ]]; then
  fail "target database is outside the approved production database"
fi

case "$MIGRATION_EXPORT_BUCKET" in
  "proposalos-migration-${EXPECTED_AWS_ACCOUNT_ID}-"*) ;;
  *) fail "export bucket is outside the private ProposalOS migration bucket namespace" ;;
esac

if [[ ! "$MIGRATION_EXPORT_KEY" =~ ^final/proposal_engine-[0-9]{8}T[0-9]{6}Z[.]sql$ ]]; then
  fail "source key must identify a timestamped final write-paused production export"
fi

case "$RDS_ENDPOINT" in
  "${EXPECTED_RDS_IDENTIFIER}."*) ;;
  *) fail "RDS endpoint is not the approved production instance" ;;
esac
case "$RDS_ENDPOINT" in
  *".${AWS_REGION}.rds.amazonaws.com") ;;
  *) fail "RDS endpoint is outside the approved AWS region" ;;
esac

expected_secret_prefix="arn:aws:secretsmanager:${AWS_REGION}:${EXPECTED_AWS_ACCOUNT_ID}:secret:proposalos/app/production/DATABASE_URL-"
case "$DATABASE_URL_SECRET_ARN" in
  "${expected_secret_prefix}"*) ;;
  *) fail "secret target is outside the ProposalOS production DATABASE_URL secret" ;;
esac

if [[ ! "$MIGRATION_EXPORT_SIZE_BYTES" =~ ^[1-9][0-9]*$ ]]; then
  fail "export byte size must be a positive integer"
fi

phase=verify_aws_account
printf 'phase=%s starting\n' "$phase"
actual_account="$(aws sts get-caller-identity --region "$AWS_REGION" --query Account --output text)" || fail "cannot verify the AWS task account"
if [[ "$actual_account" != "$EXPECTED_AWS_ACCOUNT_ID" ]]; then
  fail "task role is operating in an unexpected AWS account"
fi

phase=verify_export_metadata
printf 'phase=%s starting\n' "$phase"
metadata="$(aws s3api head-object \
  --region "$AWS_REGION" \
  --bucket "$MIGRATION_EXPORT_BUCKET" \
  --key "$MIGRATION_EXPORT_KEY" \
  --query '[ETag,ContentLength]' \
  --output json)" || fail "cannot read final migration export metadata"
actual_etag="$(printf '%s' "$metadata" | jq -r '.[0]' | tr -d '"')"
actual_size="$(printf '%s' "$metadata" | jq -r '.[1]')"

if [[ "$actual_etag" != "$MIGRATION_EXPORT_ETAG" || "$actual_size" != "$MIGRATION_EXPORT_SIZE_BYTES" ]]; then
  fail "final source export does not match the supplied ETag and byte size"
fi

phase=configure_db_connection
PGHOST="$RDS_ENDPOINT"
PGPORT="$RDS_PORT"
PGUSER="$(printf '%s' "$RDS_MASTER_SECRET_JSON" | jq -er '.username')"
PGPASSWORD="$(printf '%s' "$RDS_MASTER_SECRET_JSON" | jq -er '.password')"
PGSSLMODE=require
export PGHOST PGPORT PGUSER PGPASSWORD PGSSLMODE
unset RDS_MASTER_SECRET_JSON

if [[ "$PGUSER" != "proposalos_master" ]]; then
  fail "RDS master username is not the approved production database owner"
fi

psql_flags=(-X --no-psqlrc --set ON_ERROR_STOP=1)
phase=verify_empty_database
printf 'phase=%s starting\n' "$phase"
table_count="$(psql "${psql_flags[@]}" --dbname "$TARGET_DATABASE" --tuples-only --no-align \
  --command "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';")" || fail "cannot verify the production target database"
if [[ "$table_count" != "0" ]]; then
  fail "production target is not empty; refusing to replay the export"
fi

printf '%s\n' "streaming verified final SQL export into the empty private production database"
phase=restore_sql_export
# Cloud SQL exports contain source ownership and ACL statements. Recreate
# ownership on RDS and apply the restricted application-role grants below.
env -u PGHOST -u PGPORT -u PGUSER -u PGPASSWORD -u PGSSLMODE \
  aws s3 cp \
  "s3://${MIGRATION_EXPORT_BUCKET}/${MIGRATION_EXPORT_KEY}" - \
  --region "$AWS_REGION" \
  --only-show-errors \
  | sed -E '/^[[:space:]]*(ALTER [^;]* OWNER TO |ALTER DEFAULT PRIVILEGES |GRANT |REVOKE |SET SESSION AUTHORIZATION )/d' \
  | psql "${psql_flags[@]}" --dbname "$TARGET_DATABASE" >/dev/null 2>&1 || fail "PostgreSQL rejected the production export; preserve the generic task log and rebuild the empty target before retrying"

phase=preflight_schema_migrations
printf 'phase=%s starting\n' "$phase"
mapfile -t migration_paths < <(find /app/prisma/migrations -type f -name migration.sql | sort)
expected_migrations="${#migration_paths[@]}"
if [[ ! "$expected_migrations" =~ ^[1-9][0-9]*$ ]]; then
  fail "production Prisma migration files are missing from the importer image"
fi
expected_latest_path="${migration_paths[$((expected_migrations - 1))]}"
expected_latest="${expected_latest_path%/migration.sql}"
expected_latest="${expected_latest##*/}"
if [[ -z "$expected_latest" ]]; then
  fail "cannot identify the latest Prisma migration in the importer image"
fi

completed_before="$(psql "${psql_flags[@]}" --dbname "$TARGET_DATABASE" --tuples-only --no-align \
  --command "SELECT count(*)::text || ':' || count(DISTINCT migration_name)::text || ':' || COALESCE(max(migration_name), 'none') FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;")" || fail "cannot inspect restored Prisma migration history"
IFS=: read -r completed_rows_before completed_names_before latest_before <<< "$completed_before"
if [[ ! "$completed_rows_before" =~ ^[0-9]+$ || ! "$completed_names_before" =~ ^[0-9]+$ || "$completed_rows_before" != "$completed_names_before" ]]; then
  fail "restored Prisma history contains duplicate or invalid completed migration records"
fi
unfinished_migrations="$(psql "${psql_flags[@]}" --dbname "$TARGET_DATABASE" --tuples-only --no-align \
  --command "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL;")" || fail "cannot check for incomplete Prisma migrations"
if [[ ! "$unfinished_migrations" =~ ^[0-9]+$ || "$unfinished_migrations" != "0" ]]; then
  fail "restored Prisma history contains an unresolved migration attempt"
fi

legacy_manifest_count="$(jq -er 'length' /app/production-legacy-migrations.json)" || fail "production legacy migration manifest is missing or invalid"
if [[ ! "$legacy_manifest_count" =~ ^[0-9]+$ ]]; then
  fail "production legacy migration manifest has an invalid entry count"
fi

declare -A expected_checksums=()
pending_migrations=0
applied_source_migrations=0
for migration_path in "${migration_paths[@]}"; do
  migration_name="${migration_path%/migration.sql}"
  migration_name="${migration_name##*/}"
  if [[ ! "$migration_name" =~ ^[a-z0-9_]+$ ]]; then
    fail "migration directory contains an unsupported name"
  fi
  migration_checksum="$(sha256sum "$migration_path" | awk '{print $1}')" || fail "cannot checksum a packaged migration"
  expected_checksums["$migration_name"]="$migration_checksum"
  existing_migration="$(psql "${psql_flags[@]}" --dbname "$TARGET_DATABASE" --tuples-only --no-align \
    --command "SELECT count(*)::text || ':' || COALESCE(max(checksum), 'none') FROM _prisma_migrations WHERE migration_name = '${migration_name}' AND finished_at IS NOT NULL AND rolled_back_at IS NULL;")" || fail "cannot compare restored Prisma migration checksums"
  existing_count="${existing_migration%%:*}"
  existing_checksum="${existing_migration#*:}"
  if [[ "$existing_count" == "0" ]]; then
    pending_migrations=$((pending_migrations + 1))
  elif [[ "$existing_count" != "1" || "$existing_checksum" != "$migration_checksum" ]]; then
    fail "an applied source migration is duplicated or its checksum differs from the packaged SQL"
  else
    applied_source_migrations=$((applied_source_migrations + 1))
  fi
done
legacy_migrations_without_source=$((completed_names_before - applied_source_migrations))
if [[ "$legacy_migrations_without_source" != "$legacy_manifest_count" ]]; then
  fail "restored migration history is inconsistent with the packaged source chain"
fi
while IFS=$'\t' read -r migration_name migration_checksum; do
  if [[ ! "$migration_name" =~ ^[a-z0-9_]+$ || ! "$migration_checksum" =~ ^[a-f0-9]{64}$ ]]; then
    fail "production legacy migration manifest contains an invalid entry"
  fi
  legacy_migration="$(psql "${psql_flags[@]}" --dbname "$TARGET_DATABASE" --tuples-only --no-align \
    --command "SELECT count(*)::text || ':' || COALESCE(max(checksum), 'none') FROM _prisma_migrations WHERE migration_name = '${migration_name}' AND finished_at IS NOT NULL AND rolled_back_at IS NULL;")" || fail "cannot verify a recorded legacy migration"
  legacy_count="${legacy_migration%%:*}"
  legacy_checksum="${legacy_migration#*:}"
  if [[ "$legacy_count" != "1" || "$legacy_checksum" != "$migration_checksum" ]]; then
    fail "a production legacy migration is missing, duplicated, or has an unexpected checksum"
  fi
done < <(jq -r 'to_entries[] | [.key, .value] | @tsv' /app/production-legacy-migrations.json)
printf 'migration_history_preflight_completed=%s; applied_source=%s; legacy_without_source=%s; pending=%s; unresolved=%s; latest_before=%s\n' \
  "$completed_names_before" "$applied_source_migrations" "$legacy_migrations_without_source" "$pending_migrations" "$unfinished_migrations" "$latest_before"

finding_summary_before="$(psql "${psql_flags[@]}" --dbname "$TARGET_DATABASE" --tuples-only --no-align \
  --command "SELECT count(*)::text || ':' || count(*) FILTER (WHERE \"confidenceScore\" > 10)::text || ':' || count(*) FILTER (WHERE \"confidenceScore\" < 0 OR \"confidenceScore\" > 100 OR \"impactScore\" < 1 OR \"impactScore\" > 10)::text FROM \"Finding\";")" || fail "cannot preflight the audit-score conversion migration"
IFS=: read -r finding_rows_before confidence_percent_rows_before invalid_score_rows_before <<< "$finding_summary_before"
if [[ ! "$finding_rows_before" =~ ^[0-9]+$ || ! "$confidence_percent_rows_before" =~ ^[0-9]+$ || ! "$invalid_score_rows_before" =~ ^[0-9]+$ ]]; then
  fail "audit-score preflight did not return valid aggregate counts"
fi
if [[ "$invalid_score_rows_before" != "0" ]]; then
  fail "audit-score migration would violate the candidate 0-10 confidence and 1-10 impact ranges"
fi
printf 'audit_score_preflight_rows=%s; confidence_values_above_10=%s; out_of_range_values=%s\n' \
  "$finding_rows_before" "$confidence_percent_rows_before" "$invalid_score_rows_before"

phase=apply_prisma_migrations
printf 'phase=%s starting; source_migrations=%s; pending=%s; latest=%s\n' "$phase" "$expected_migrations" "$pending_migrations" "$expected_latest"
DATABASE_URL="$(node -e 'process.stdout.write("postgresql://" + encodeURIComponent(process.env.PGUSER) + ":" + encodeURIComponent(process.env.PGPASSWORD) + "@" + process.env.PGHOST + ":" + process.env.PGPORT + "/" + process.env.TARGET_DATABASE + "?sslmode=require")')" || fail "cannot construct the private migration connection string"
export DATABASE_URL
prisma migrate deploy --schema=/app/prisma/schema.prisma || fail "Prisma migrations failed; the API database URL has not been published"
unset DATABASE_URL

phase=verify_import
printf 'phase=%s starting\n' "$phase"
table_count="$(psql "${psql_flags[@]}" --dbname "$TARGET_DATABASE" --tuples-only --no-align \
  --command "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';")" || fail "cannot verify the restored schema"
migration_summary="$(psql "${psql_flags[@]}" --dbname "$TARGET_DATABASE" --tuples-only --no-align \
  --command "SELECT count(*)::text || ':' || count(DISTINCT migration_name)::text || ':' || COALESCE(max(migration_name), 'none') FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;")" || fail "cannot verify Prisma migration metadata"
IFS=: read -r migration_count migration_name_count actual_latest <<< "$migration_summary"
expected_migration_count=$((completed_names_before + pending_migrations))
if [[ "$migration_count" != "$expected_migration_count" || "$migration_name_count" != "$expected_migration_count" || "$actual_latest" != "$expected_latest" ]]; then
  fail "restored database does not match the complete Prisma migration chain in the importer image"
fi
for migration_name in "${!expected_checksums[@]}"; do
  verified_migration="$(psql "${psql_flags[@]}" --dbname "$TARGET_DATABASE" --tuples-only --no-align \
    --command "SELECT count(*)::text || ':' || COALESCE(max(checksum), 'none') FROM _prisma_migrations WHERE migration_name = '${migration_name}' AND finished_at IS NOT NULL AND rolled_back_at IS NULL;")" || fail "cannot verify an imported Prisma migration checksum"
  verified_count="${verified_migration%%:*}"
  verified_checksum="${verified_migration#*:}"
  if [[ "$verified_count" != "1" || "$verified_checksum" != "${expected_checksums[$migration_name]}" ]]; then
    fail "an imported Prisma migration is missing, duplicated, or has an unexpected checksum"
  fi
done
finding_summary_after="$(psql "${psql_flags[@]}" --dbname "$TARGET_DATABASE" --tuples-only --no-align \
  --command "SELECT count(*)::text || ':' || count(*) FILTER (WHERE \"confidenceScore\" > 10)::text || ':' || count(*) FILTER (WHERE \"confidenceScore\" < 0 OR \"confidenceScore\" > 10 OR \"impactScore\" < 1 OR \"impactScore\" > 10)::text FROM \"Finding\";")" || fail "cannot verify the audit-score conversion migration"
IFS=: read -r finding_rows_after confidence_percent_rows_after invalid_score_rows_after <<< "$finding_summary_after"
if [[ "$finding_rows_after" != "$finding_rows_before" || "$confidence_percent_rows_after" != "0" || "$invalid_score_rows_after" != "0" ]]; then
  fail "audit-score migration did not preserve finding rows within the candidate score ranges"
fi
printf 'audit_score_postflight_rows=%s; confidence_values_above_10=%s; out_of_range_values=%s\n' \
  "$finding_rows_after" "$confidence_percent_rows_after" "$invalid_score_rows_after"

app_password="$(openssl rand -hex 32)"
app_role="proposalos_app_$(openssl rand -hex 4)"
secret_file="$(mktemp)"
cleanup() {
  if [[ -n "${secret_file:-}" ]]; then
    rm -f -- "$secret_file"
  fi
  unset app_password app_database_url PGPASSWORD
}
trap cleanup EXIT
chmod 600 "$secret_file"

phase=provision_app_role
printf 'phase=%s starting\n' "$phase"
printf "CREATE ROLE \"%s\" WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '%s';\n" "$app_role" "$app_password" > "$secret_file"
psql "${psql_flags[@]}" --dbname "$TARGET_DATABASE" --file "$secret_file" >/dev/null || fail "could not provision the restricted production application role"

phase=grant_app_access
printf 'phase=%s starting\n' "$phase"
psql "${psql_flags[@]}" --dbname "$TARGET_DATABASE" --command \
  "GRANT CONNECT ON DATABASE proposal_engine TO \"${app_role}\"; GRANT USAGE ON SCHEMA public TO \"${app_role}\"; GRANT app_user TO \"${app_role}\"; GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO \"${app_role}\"; GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO \"${app_role}\"; ALTER DEFAULT PRIVILEGES FOR ROLE proposalos_master IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO \"${app_role}\"; ALTER DEFAULT PRIVILEGES FOR ROLE proposalos_master IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO \"${app_role}\";" >/dev/null || fail "could not apply restricted production application grants"

role_safe="$(psql "${psql_flags[@]}" --dbname "$TARGET_DATABASE" --tuples-only --no-align \
  --command "SELECT (NOT role.rolsuper AND NOT role.rolbypassrls AND EXISTS (SELECT 1 FROM pg_auth_members AS membership JOIN pg_roles AS granted ON granted.oid = membership.roleid WHERE membership.member = role.oid AND granted.rolname = 'app_user'))::text FROM pg_roles AS role WHERE role.rolname = '${app_role}';")" || fail "could not verify production role safety"
if [[ "$role_safe" != "true" ]]; then
  fail "production application role does not satisfy the non-superuser, RLS, and app_user membership guards"
fi

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
    --output text >/dev/null || fail "could not store the production application database URL"

unset app_database_url app_password PGPASSWORD
printf 'production import complete; public_tables=%s; completed_migrations=%s; legacy_without_source=%s; migrations_applied=%s\n' \
  "$table_count" "$migration_count" "$legacy_migrations_without_source" "$pending_migrations"
