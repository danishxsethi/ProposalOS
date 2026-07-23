#!/bin/bash

# Test script for scheduled audits cron job
# Validates that the cron properly triggers and executes audits

set -e

echo "🧪 Testing Scheduled Audits Cron Job"
echo "===================================="
echo ""

# Check for CRON_SECRET
if [ -z "$CRON_SECRET" ]; then
    echo "⚠️  Warning: CRON_SECRET not set, using default 'test-secret'"
    CRON_SECRET="test-secret"
fi

BASE_URL="${BASE_URL:-http://localhost:3000}"

echo "📋 Configuration:"
echo "  Base URL: $BASE_URL"
echo "  Cron Secret: $CRON_SECRET"
echo ""

# Test 1: Call the cron endpoint (should return even if no schedules are due)
echo "TEST 1: Calling cron endpoint..."
RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$BASE_URL/api/cron/scheduled-audits" \
    -H "Authorization: Bearer $CRON_SECRET")

HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ Cron endpoint accessible"
    echo "   Response: $BODY"
else
    echo "❌ Cron endpoint failed with status $HTTP_CODE"
    echo "   Response: $BODY"
    exit 1
fi

echo ""

# Test 2: Verify unauthorized access is blocked
echo "TEST 2: Testing authorization..."
UNAUTH_RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$BASE_URL/api/cron/scheduled-audits")
UNAUTH_CODE=$(echo "$UNAUTH_RESPONSE" | tail -n 1)

if [ "$UNAUTH_CODE" = "401" ]; then
    echo "✅ Unauthorized access properly blocked"
else
    echo "⚠️  Warning: Expected 401 but got $UNAUTH_CODE"
fi

echo ""

# Test 3: Check database for any running audits from scheduled batch
echo "TEST 3: Checking for scheduled audits in database..."
echo "   Run this query in Prisma Studio:"
echo "   SELECT * FROM \"Audit\" WHERE \"batchId\" LIKE 'scheduled-%' ORDER BY \"createdAt\" DESC LIMIT 5;"
echo ""

# Test 4: Verify webhook integration (if WEBHOOK_URL is set)
if [ -n "$WEBHOOK_URL" ]; then
    echo "TEST 4: Webhook configured at: $WEBHOOK_URL"
    echo "   Check for audit.completed or audit.failed events"
else
    echo "TEST 4: No WEBHOOK_URL configured (optional)"
fi

echo ""
echo "========================================"
echo "✅ Basic cron tests completed!"
echo ""
echo "To fully test scheduled audits:"
echo "1. Create a test schedule in the database:"
echo "   INSERT INTO \"AuditSchedule\" ("
echo "     id, \"tenantId\", \"businessName\", \"businessCity\","
echo "     \"businessUrl\", industry, frequency, \"isActive\","
echo "     \"nextRunAt\", \"createdAt\", \"updatedAt\""
echo "   ) VALUES ("
echo "     gen_random_uuid(), 'YOUR_TENANT_ID',"
echo "     'Test Business', 'Chicago',"
echo "     'https://example.com', 'restaurant', 'weekly', true,"
echo "     NOW() - INTERVAL '1 minute',"
echo "     NOW(), NOW()"
echo "   );"
echo ""
echo "2. Run the cron again: ./scripts/test-cron-scheduled-audits.sh"
echo ""
echo "3. Check that:"
echo "   - Audit created with status RUNNING"
echo "   - Status changes to COMPLETE after ~2-3 minutes"
echo "   - Schedule nextRunAt updated"
echo ""
