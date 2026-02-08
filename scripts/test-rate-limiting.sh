#!/bin/bash

# Test API Rate Limiting
# Tests that rate limits are enforced with proper headers and 429 responses

set -e

echo "🧪 Testing API Rate Limiting"
echo "============================"
echo ""

# Configuration
API_KEY="${TEST_API_KEY:-}"
BASE_URL="${BASE_URL:-http://localhost:3000}"

if [ -z "$API_KEY" ]; then
    echo "⚠️  ERROR: TEST_API_KEY environment variable not set"
    echo "   Usage: TEST_API_KEY=pe_live_xxx ./scripts/test-rate-limiting.sh"
    exit 1
fi

echo "📋 Configuration:"
echo "  Base URL: $BASE_URL"
echo "  API Key: ${API_KEY:0:20}..."
echo ""

# Test 1: Check rate limit headers on successful request
echo "TEST 1: Checking rate limit headers on success..."
RESPONSE=$(curl -s -i -X POST "$BASE_URL/api/v1/audit" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "businessName": "Test Business",
    "businessUrl": "https://example.com",
    "city": "Chicago",
    "industry": "restaurant"
  }')

# Extract headers
LIMIT=$(echo "$RESPONSE" | grep -i "X-RateLimit-Limit:" | cut -d' ' -f2 | tr -d '\r')
REMAINING=$(echo "$RESPONSE" | grep -i "X-RateLimit-Remaining:" | cut -d' ' -f2 | tr -d '\r')
USED=$(echo "$RESPONSE" | grep -i "X-RateLimit-Used:" | cut -d' ' -f2 | tr -d '\r')
RESET=$(echo "$RESPONSE" | grep -i "X-RateLimit-Reset:" | cut -d' ' -f2 | tr -d '\r')

if [ -n "$LIMIT" ] && [ -n "$REMAINING" ] && [ -n "$USED" ] && [ -n "$RESET" ]; then
    echo "✅ Rate limit headers present:"
    echo "   Limit: $LIMIT"
    echo "   Remaining: $REMAINING"
    echo "   Used: $USED"
    echo "   Reset: $RESET"
else
    echo "❌ Missing rate limit headers"
    echo "$RESPONSE"
    exit 1
fi

echo ""

# Test 2: Exceed rate limit
echo "TEST 2: Testing rate limit enforcement..."
echo "Making multiple requests to exceed limit (limit: $LIMIT)..."

HIT_LIMIT=false
for i in $(seq 1 20); do
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/v1/audit" \
      -H "Authorization: Bearer $API_KEY" \
      -H "Content-Type: application/json" \
      -d '{
        "businessName": "Test",
        "businessUrl": "https://example.com"
      }')
    
    echo "  Request #$i: HTTP $STATUS"
    
    if [ "$STATUS" = "429" ]; then
        echo ""
        echo "✅ Rate limit enforced at request #$i"
        HIT_LIMIT=true
        
        # Check for Retry-After header
        RETRY_RESPONSE=$(curl -s -i -X POST "$BASE_URL/api/v1/audit" \
          -H "Authorization: Bearer $API_KEY" \
          -H "Content-Type: application/json" \
          -d '{}')
        
        RETRY_AFTER=$(echo "$RETRY_RESPONSE" | grep -i "Retry-After:" | cut -d' ' -f2 | tr -d '\r')
        
        if [ -n "$RETRY_AFTER" ]; then
            echo "✅ Retry-After header present: ${RETRY_AFTER}s"
        else
            echo "⚠️  Retry-After header missing"
        fi
        
        # Check response body
        BODY=$(echo "$RETRY_RESPONSE" | tail -n 1)
        echo ""
        echo "Response body:"
        echo "$BODY"
        
        break
    fi
    
    # Small delay to avoid overwhelming server
    sleep 0.1
done

if [ "$HIT_LIMIT" = false ]; then
    echo ""
    echo "⚠️  Warning: Rate limit not reached after 20 requests"
    echo "   This might mean the limit is set very high"
fi

echo ""
echo "============================"
echo ""
echo "📊 Summary:"
echo "  ✅ Rate limit headers working"
echo "  $([ "$HIT_LIMIT" = true ] && echo '✅' || echo '⚠️ ') Rate limit enforcement $([ "$HIT_LIMIT" = true ] && echo 'working' || echo 'not tested')"
echo ""
echo "To reset the rate limit counter, wait until midnight UTC or:"
echo "  1. Open Prisma Studio: npx prisma studio"
echo "  2. Navigate to ApiKey table"
echo "  3. Set usageCount = 0 and lastResetAt to yesterday"
echo ""
