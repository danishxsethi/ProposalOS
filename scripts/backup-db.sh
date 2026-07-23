#!/bin/bash
# FIX-06: Database backup script
# Backs up Cloud SQL PostgreSQL database to Google Cloud Storage.
#
# Usage:
#   ./scripts/backup-db.sh [optional: override GCS bucket name]
#
# Required env vars:
#   DATABASE_URL            - PostgreSQL connection string
#   GCS_BACKUP_BUCKET       - GCS bucket name (e.g. proposal-os-db-backups)
#   GCP_PROJECT_ID          - GCP project ID
#
# To run automatically, add to Cloud Scheduler:
#   Schedule: 0 3 * * *   (daily at 3 AM)
#   Target:   This script via a Cloud Run job or Cloud Build trigger.

set -euo pipefail

# ── Config ──────────────────────────────────────────────────────────────────
PROJECT_ID="${GCP_PROJECT_ID:-proposal}"
BUCKET="${1:-${GCS_BACKUP_BUCKET:-proposal-os-db-backups}}"
TIMESTAMP=$(date +"%Y-%m-%dT%H-%M-%S")
BACKUP_FILENAME="proposalOS-backup-${TIMESTAMP}.sql.gz"
TEMP_FILE="/tmp/${BACKUP_FILENAME}"
RETENTION_DAYS=30

echo "🗄️  ProposalOS Database Backup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Timestamp : ${TIMESTAMP}"
echo "Bucket    : gs://${BUCKET}"
echo "File      : ${BACKUP_FILENAME}"
echo ""

# ── Validate deps ────────────────────────────────────────────────────────────
command -v pg_dump >/dev/null 2>&1 || { echo "❌ pg_dump not found. Install postgresql-client."; exit 1; }
command -v gcloud >/dev/null 2>&1 || { echo "❌ gcloud not found. Install Google Cloud SDK."; exit 1; }

# ── Ensure GCS bucket exists ─────────────────────────────────────────────────
if ! gcloud storage buckets describe "gs://${BUCKET}" --project="${PROJECT_ID}" &>/dev/null; then
  echo "📦 Creating GCS bucket gs://${BUCKET}..."
  gcloud storage buckets create "gs://${BUCKET}" \
    --project="${PROJECT_ID}" \
    --location="us-central1" \
    --uniform-bucket-level-access

  # Set 30-day lifecycle retention policy
  gcloud storage buckets update "gs://${BUCKET}" \
    --lifecycle-file=- <<EOF
{
  "rule": [
    {
      "action": { "type": "Delete" },
      "condition": { "age": ${RETENTION_DAYS} }
    }
  ]
}
EOF
  echo "✅ Bucket created with ${RETENTION_DAYS}-day retention policy"
fi

# ── Run pg_dump ──────────────────────────────────────────────────────────────
echo "📤 Dumping database..."

pg_dump \
  --no-password \
  --format=custom \
  --compress=9 \
  "${DATABASE_URL}" \
  | gzip > "${TEMP_FILE}"

DUMP_SIZE=$(du -sh "${TEMP_FILE}" | cut -f1)
echo "✅ Dump complete — size: ${DUMP_SIZE}"

# ── Upload to GCS ─────────────────────────────────────────────────────────────
echo "☁️  Uploading to GCS..."

gcloud storage cp "${TEMP_FILE}" "gs://${BUCKET}/${BACKUP_FILENAME}" \
  --project="${PROJECT_ID}"

echo "✅ Uploaded: gs://${BUCKET}/${BACKUP_FILENAME}"

# ── Cleanup ───────────────────────────────────────────────────────────────────
rm -f "${TEMP_FILE}"
echo ""
echo "🎉 Backup complete: gs://${BUCKET}/${BACKUP_FILENAME} (${DUMP_SIZE})"
