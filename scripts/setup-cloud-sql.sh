#!/usr/bin/env bash
#
# ProposalOS — Cloud SQL setup
# Creates database and user, then updates Cloud Run with DATABASE_URL.
#
# Prerequisites:
#   - Cloud SQL instance "proposal-db" exists (run: gcloud sql instances list)
#   - DB password in .db_password_temp or pass DB_PASSWORD env var
#
# Usage:
#   ./scripts/setup-cloud-sql.sh
#   DB_PASSWORD=yourpass ./scripts/setup-cloud-sql.sh
#

set -e

PROJECT_ID="${PROJECT_ID:-proposal-487522}"
REGION="${REGION:-us-central1}"
INSTANCE="proposal-db"
DB_NAME="proposal_engine"
DB_USER="postgres"

# Get password
if [ -n "$DB_PASSWORD" ]; then
  echo "Using DB_PASSWORD from environment"
elif [ -f ".db_password_temp" ]; then
  DB_PASSWORD=$(cat .db_password_temp)
  echo "Using password from .db_password_temp"
else
  echo "❌ Error: Set DB_PASSWORD or ensure .db_password_temp exists"
  exit 1
fi

echo "📦 Setting up Cloud SQL for ProposalOS"
echo "   Project:  ${PROJECT_ID}"
echo "   Instance: ${INSTANCE}"
echo "   Database: ${DB_NAME}"
echo ""

# Create database
echo "🗄️  Creating database ${DB_NAME}..."
gcloud sql databases create "${DB_NAME}" \
  --instance="${INSTANCE}" \
  --project="${PROJECT_ID}" 2>/dev/null || echo "   (database may already exist)"

# Cloud SQL connection string for Cloud Run (Unix socket via Cloud SQL Proxy)
# Prisma requires localhost in URI; host= points to socket directory (trailing slash)
CONNECTION_NAME="${PROJECT_ID}:${REGION}:${INSTANCE}"
DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@localhost/proposal_engine?host=/cloudsql/${CONNECTION_NAME}/"

echo ""
echo "✅ Cloud SQL ready!"
echo ""
echo "Connection name: ${CONNECTION_NAME}"
echo "DATABASE_URL (for Cloud Run): postgresql://${DB_USER}:****@localhost/proposal_engine?host=/cloudsql/${CONNECTION_NAME}/"
echo ""
echo "Next steps:"
echo "  1. Run migrations (with Cloud SQL Proxy on 127.0.0.1:5433):"
echo "     DATABASE_URL=\"postgresql://${DB_USER}:${DB_PASSWORD}@127.0.0.1:5433/proposal_engine\" npx prisma migrate deploy"
echo "     (Use Cloud SQL Proxy locally, or run from Cloud Shell with instance connection)"
echo ""
echo "  2. Store DATABASE_URL in Secret Manager and update Cloud Run:"
echo "     echo -n \"${DATABASE_URL}\" | gcloud secrets create DATABASE_URL --data-file=- --project=${PROJECT_ID}"
echo "     (or: gcloud secrets versions add DATABASE_URL --data-file=- --project=${PROJECT_ID})"
echo ""
echo "  3. Or redeploy with: ./deploy.sh  (after updating deploy.sh with Cloud SQL config)"
echo ""
