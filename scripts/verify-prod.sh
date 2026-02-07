#!/bin/bash
set -e

# Verification script for Production Deployment
# Usage: ./scripts/verify-prod.sh [Business Name] [City]

SERVICE_URL="https://proposal-engine-lzgezqezmq-uc.a.run.app"
NAME="${1:-Joe's Plumbing}"
CITY="${2:-Saskatoon}"

echo "🚀 Verifying Production Service..."
echo "📍 Target: $SERVICE_URL"
echo "🏢 Business: $NAME, $CITY"

# Get Auth Token
echo "🔑 Getting Identity Token..."
TOKEN=$(gcloud auth print-identity-token)

if [ -z "$TOKEN" ]; then
    echo "❌ Failed to get identity token. Run 'gcloud auth login' first."
    exit 1
fi

# Create payload
printf '{"businessName": "%s", "businessCity": "%s"}' "$NAME" "$CITY" > /tmp/audit_payload.json

# Run Audit
echo "⚡ Triggering Audit (this may take 30-60s)..."
RESPONSE=$(curl -s -X POST "$SERVICE_URL/api/audit" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d @/tmp/audit_payload.json)

# Check response
if [[ "$RESPONSE" == *"id"* ]]; then
    ID=$(echo "$RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin)['id'])")
    echo "✅ Audit Started! ID: $ID"
    echo "🔗 View Status: $SERVICE_URL/api/audit/$ID"
else
    echo "❌ Audit Failed!"
    echo "Response: $RESPONSE"
    exit 1
fi

rm /tmp/audit_payload.json
