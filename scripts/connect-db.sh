#!/bin/bash

# Connect to Production Cloud SQL Database locally
# Usage: ./scripts/connect-db.sh

INSTANCE_CONNECTION_NAME="proposal-487522:us-central1:proposal-db"
LOCAL_PORT="5433"

echo "🚀 Starting Cloud SQL Proxy..."
echo "🔌 Connecting to: $INSTANCE_CONNECTION_NAME"
echo "👉 Local Port: $LOCAL_PORT"
echo ""
echo "To connect via psql:"
echo '   export DATABASE_URL="postgresql://<user>:<password>@localhost:'"$LOCAL_PORT"'/proposal_engine"'
echo '   psql "$DATABASE_URL"'
echo ""
echo "To use with Prisma locally (e.g. for Studio):"
echo '   npx prisma studio'

# Check if proxy binary exists
if [ ! -f "./cloud-sql-proxy" ]; then
    echo "❌ cloud-sql-proxy not found in current directory."
    echo "   Please download it: curl -o cloud-sql-proxy https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.14.2/cloud-sql-proxy.darwin.arm64 && chmod +x cloud-sql-proxy"
    exit 1
fi

./cloud-sql-proxy $INSTANCE_CONNECTION_NAME --port=$LOCAL_PORT
