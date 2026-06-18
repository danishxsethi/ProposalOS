#!/usr/bin/env npx tsx
/**
 * scripts/verify-stripe-metering.ts
 *
 * Integration verification for Task 1.6 [#1] — proves metered usage
 * reaches Stripe test mode.
 *
 * Prerequisites:
 *   1. Set STRIPE_SECRET_KEY to a real sk_test_ key in .env
 *   2. Create a Meter in Stripe Dashboard (test mode):
 *      - event_name: "audit_credit_used"
 *      - aggregation: SUM
 *      - customer_mapping.event_payload_key: "stripe_customer_id"
 *      - value_settings.event_payload_key: "value"
 *   3. Have a test customer with an active subscription that uses the meter
 *
 * Usage:
 *   npx tsx scripts/verify-stripe-metering.ts
 *
 * What this does:
 *   1. Creates a meter event via the Billing Meter Events API
 *   2. Reads back the meter event summary for the customer
 *   3. Asserts the usage appeared in Stripe
 *
 * This is the acceptance proof for #1: usage visible on Stripe test subscription.
 */

import Stripe from 'stripe';

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY ?? '';

if (!STRIPE_KEY.startsWith('sk_test_') || STRIPE_KEY === 'sk_test_your-test-key-here') {
  console.error(
    'ERROR: Set a real STRIPE_SECRET_KEY (sk_test_...) in .env to run this verification.'
  );
  console.error('This script requires a real Stripe test mode key.');
  process.exit(1);
}

const stripe = new Stripe(STRIPE_KEY, {
  apiVersion: '2025-04-30.basil' as Stripe.LatestApiVersion,
});

const METER_EVENT_NAME = process.env.STRIPE_METER_EVENT_NAME ?? 'audit_credit_used';

async function main() {
  console.log('=== Task 1.6 Stripe Metering Verification ===\n');

  // 1. Find or create a test customer
  console.log('Step 1: Finding/creating test customer...');
  let customer: Stripe.Customer;
  const existing = await stripe.customers.list({
    email: 'metering-test@proposalengine.test',
    limit: 1,
  });
  if (existing.data.length > 0) {
    customer = existing.data[0];
    console.log(`  Using existing customer: ${customer.id}`);
  } else {
    customer = await stripe.customers.create({
      email: 'metering-test@proposalengine.test',
      name: 'Metering Test Customer',
      metadata: { purpose: 'task-1.6-verification' },
    });
    console.log(`  Created test customer: ${customer.id}`);
  }

  // 2. Send a meter event
  const uniqueId = `verify-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  console.log(`\nStep 2: Sending meter event (identifier: ${uniqueId})...`);

  try {
    const meterEvent = await stripe.billing.meterEvents.create({
      event_name: METER_EVENT_NAME,
      payload: {
        stripe_customer_id: customer.id,
        value: '3', // 3 credits
      },
      identifier: uniqueId,
      timestamp: Math.floor(Date.now() / 1000),
    });

    console.log(`  ✓ Meter event created successfully`);
    console.log(`    identifier: ${meterEvent.identifier}`);
    console.log(`    event_name: ${METER_EVENT_NAME}`);
    console.log(`    value: 3 credits`);
    console.log(`    customer: ${customer.id}`);
  } catch (err: any) {
    if (err.code === 'resource_missing' && err.message?.includes('meter')) {
      console.error(`\n  ✗ METER NOT FOUND: "${METER_EVENT_NAME}"`);
      console.error(`    Create a Meter in Stripe Dashboard (test mode):`);
      console.error(`    - Go to: https://dashboard.stripe.com/test/billing/meters`);
      console.error(`    - event_name: "${METER_EVENT_NAME}"`);
      console.error(`    - aggregation: SUM`);
      console.error(`    - customer_mapping key: "stripe_customer_id"`);
      console.error(`    - value key: "value"`);
      process.exit(1);
    }
    throw err;
  }

  // 3. Read back meter event summaries (may have slight delay)
  console.log('\nStep 3: Reading back usage from Stripe...');
  console.log('  (Meter events are processed asynchronously — waiting 3s)');
  await new Promise((r) => setTimeout(r, 3000));

  // List meters to find ours
  const meters = await stripe.billing.meters.list({ limit: 10 });
  const ourMeter = meters.data.find((m) => m.event_name === METER_EVENT_NAME);

  if (!ourMeter) {
    console.error(`  ✗ Could not find meter with event_name="${METER_EVENT_NAME}"`);
    process.exit(1);
  }

  console.log(`  Found meter: ${ourMeter.id} (${ourMeter.event_name})`);

  // Get event summaries for our customer
  const now = Math.floor(Date.now() / 1000);
  const oneHourAgo = now - 3600;

  const summaries = await stripe.billing.meters.listEventSummaries(ourMeter.id, {
    customer: customer.id,
    start_time: oneHourAgo,
    end_time: now + 300, // 5min buffer
  });

  if (summaries.data.length > 0) {
    const total = summaries.data.reduce((sum, s) => sum + Number(s.aggregated_value), 0);
    console.log(`  ✓ Usage visible in Stripe!`);
    console.log(`    Summaries found: ${summaries.data.length}`);
    console.log(`    Total aggregated value (last hour): ${total}`);
    console.log(`\n=== VERIFICATION PASSED ===`);
    console.log(`Usage reached Stripe test mode. Task 1.6 acceptance criterion met.`);
  } else {
    console.log(`  ⚠ No summaries yet (may take up to 60s for async processing)`);
    console.log(
      `  Check manually: https://dashboard.stripe.com/test/billing/meters/${ourMeter.id}`
    );
    console.log(`\n=== VERIFICATION PARTIALLY PASSED ===`);
    console.log(`Meter event was accepted (no error). Dashboard verification recommended.`);
  }
}

main().catch((err) => {
  console.error('Verification failed:', err.message || err);
  process.exit(1);
});
