#!/usr/bin/env bash
#
# ProposalOS — Run Prisma migrations against Cloud SQL
# Uses Cloud SQL Proxy. Kills any existing proxy on the port first.
#
# Usage:
#   ./scripts/migrate-cloud-sql.sh
#   MIGRATE_PORT=5434 ./scripts/migrate-cloud-sql.sh  # Use different port
#

set -e

PROJECT_ID="proposal-487522"
REGION="us-central1"
INSTANCE="proposal-db"
DB_USER="postgres"
DB_NAME="proposal_engine"
MIGRATE_PORT="${MIGRATE_PORT:-5434}"

# Get password
if [ -n "$DB_PASSWORD" ]; then
  ENCODED_PASSWORD=$(node -e "console.log(encodeURIComponent(process.env.DB_PASSWORD))")
elif [ -f ".db_password_temp" ]; then
  ENCODED_PASSWORD=$(node -e "const fs = require('fs'); console.log(encodeURIComponent(fs.readFileSync('.db_password_temp', 'utf8').trim()))")
else
  echo "❌ Error: Set DB_PASSWORD or ensure .db_password_temp exists"
  exit 1
fi

CONNECTION="${PROJECT_ID}:${REGION}:${INSTANCE}"
DATABASE_URL="postgresql://${DB_USER}:${ENCODED_PASSWORD}@127.0.0.1:${MIGRATE_PORT}/${DB_NAME}"

echo "🔄 Running Prisma migrations against Cloud SQL"
echo "   Instance: ${CONNECTION}"
echo "   User:     ${DB_USER}"
echo "   Database: ${DB_NAME}"
echo "   Port:     ${MIGRATE_PORT}"
echo ""

# Kill any process on this port (e.g. leftover Cloud SQL Proxy)
echo "Freeing port ${MIGRATE_PORT}..."
pkill -f "cloud-sql-proxy.*${INSTANCE}" 2>/dev/null || true
if lsof -ti:${MIGRATE_PORT} >/dev/null 2>&1; then
  lsof -ti:${MIGRATE_PORT} | xargs kill -9 2>/dev/null || true
  sleep 2
fi

# Start proxy in background using gcloud authentication token to bypass expired/challenged ADC RAPT errors
echo "Starting Cloud SQL Proxy..."
cloud-sql-proxy "${CONNECTION}" --port="${MIGRATE_PORT}" --token "$(gcloud auth print-access-token)" &
PROXY_PID=$!
sleep 3

# Resolve any previously failed migration (if applicable)
echo ""
echo "Resolving failed migrations (if any)..."
DATABASE_URL="${DATABASE_URL}" npx prisma migrate resolve --rolled-back 20250211000000_add_batchid_index 2>/dev/null || true

# Run migrations
echo ""
echo "Running migrations..."
if DATABASE_URL="${DATABASE_URL}" npx prisma migrate deploy; then
  echo ""
  echo "✅ Migrations complete!"
else
  echo ""
  echo "❌ Migrations failed"
  kill $PROXY_PID 2>/dev/null || true
  exit 1
fi

# Stop proxy
kill $PROXY_PID 2>/dev/null || true
echo "Proxy stopped."
