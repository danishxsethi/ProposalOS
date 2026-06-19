#!/bin/bash
# Secure Stripe Live Key Seeding Script
set -e

echo "==============================================="
echo "🔒 SECURE STRIPE LIVE KEY SEEDING"
echo "==============================================="
echo ""

# Prompt for Secret Key
read -p "🔑 Enter your Stripe Live Secret Key (starts with sk_live_): " -s STRIPE_SK
echo ""

if [[ ! "$STRIPE_SK" =~ ^sk_live_ ]]; then
  echo "❌ Error: The key must start with 'sk_live_' to ensure it is a valid production key."
  exit 1
fi

echo "Seeding STRIPE_SECRET_KEY to Secret Manager..."
printf '%s' "$STRIPE_SK" | gcloud secrets versions add STRIPE_SECRET_KEY --data-file=- --project=proposal-487522
echo "✅ STRIPE_SECRET_KEY version added successfully!"
echo ""

# Prompt for Webhook Secret
read -p "🔌 Enter your Stripe Webhook Secret (starts with whsec_): " -s STRIPE_WHSEC
echo ""

if [[ ! "$STRIPE_WHSEC" =~ ^whsec_ ]]; then
  echo "❌ Error: The webhook secret must start with 'whsec_' to ensure it is a valid production secret."
  exit 1
fi

echo "Seeding STRIPE_WEBHOOK_SECRET to Secret Manager..."
printf '%s' "$STRIPE_WHSEC" | gcloud secrets versions add STRIPE_WEBHOOK_SECRET --data-file=- --project=proposal-487522
echo "✅ STRIPE_WEBHOOK_SECRET version added successfully!"
echo ""
echo "==============================================="
echo "🎉 ALL SECRETS SEEDED SECURELY!"
echo "==============================================="
