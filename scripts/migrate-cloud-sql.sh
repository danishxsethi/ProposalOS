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

PROJECT_ID="${PROJECT_ID:-proposal-487522}"
REGION="${REGION:-us-central1}"
INSTANCE="proposal-db"
MIGRATE_PORT="${MIGRATE_PORT:-5434}"

# Get password
if [ -n "$DB_PASSWORD" ]; then
  :
elif [ -f ".db_password_temp" ]; then
  DB_PASSWORD=$(cat .db_password_temp)
else
  echo "❌ Error: Set DB_PASSWORD or ensure .db_password_temp exists"
  exit 1
fi

CONNECTION="${PROJECT_ID}:${REGION}:${INSTANCE}"
DATABASE_URL="postgresql://postgres:${DB_PASSWORD}@127.0.0.1:${MIGRATE_PORT}/proposal_engine"

echo "🔄 Running Prisma migrations against Cloud SQL"
echo "   Instance: ${CONNECTION}"
echo "   Port: ${MIGRATE_PORT}"
echo ""

# Kill any process on this port (e.g. leftover Cloud SQL Proxy)
echo "Freeing port ${MIGRATE_PORT}..."
pkill -f "cloud-sql-proxy.*${INSTANCE}" 2>/dev/null || true
if lsof -ti:${MIGRATE_PORT} >/dev/null 2>&1; then
  lsof -ti:${MIGRATE_PORT} | xargs kill -9 2>/dev/null || true
  sleep 2
fi

# Ensure ADC uses correct project for Cloud SQL Admin API (avoids swinglabs-fund etc.)
echo "Setting quota project for Application Default Credentials..."
gcloud auth application-default set-quota-project "${PROJECT_ID}" 2>/dev/null || true

# Start proxy in background
echo "Starting Cloud SQL Proxy..."
cloud-sql-proxy "${CONNECTION}" --port="${MIGRATE_PORT}" &
PROXY_PID=$!
sleep 3

# Resolve any previously failed migration (e.g. 20250211 ran before base schema)
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
