const { execSync } = require('child_process');
const Stripe = require('stripe');

async function main() {
  const tenantId = process.argv[2];
  if (!tenantId) {
    console.error('Usage: node generate-live-checkout-session.js <tenantId>');
    process.exit(1);
  }

  console.log('🔒 Securely retrieving Stripe Live Secret Key from Secret Manager...');
  let stripeSecretKey;
  try {
    stripeSecretKey = execSync(
      'gcloud secrets versions access latest --secret=STRIPE_SECRET_KEY --project=proposal-487522',
      { encoding: 'utf8' }
    ).trim();
  } catch (error) {
    console.error('❌ Failed to retrieve Stripe Live Secret Key:', error.message);
    process.exit(1);
  }

  if (!stripeSecretKey || !stripeSecretKey.startsWith('sk_live_')) {
    console.error('❌ Retrieved key is invalid or not a production key (does not start with sk_live_).');
    process.exit(1);
  }

  console.log('✅ Key format verified (starts with sk_live_). Initializing Stripe...');
  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: '2024-12-18.acacia',
  });

  const priceId = 'price_1TdvECEVNVRGZFatj3QQ1iGF'; // Live $1.00 USD/month recurring starter price
  const appUrl = 'https://claraud-web-120416863832.us-central1.run.app'; // Mapped custom frontend domain or stable url

  try {
    console.log(`Creating active Stripe Checkout Session for Price ID: ${priceId}...`);
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: tenantId,
      metadata: {
        tenantId,
        planId: 'starter',
        checkoutType: 'saas',
      },
      subscription_data: {
        // DO NOT use trial days so that payment happens immediately for real verification
        metadata: {
          tenantId,
          planId: 'starter',
        },
      },
      success_url: `${appUrl}/onboarding?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/settings/billing?checkout=cancel`,
    });

    console.log('\n==============================================');
    console.log('🎉 STRIPE CHECKOUT SESSION GENERATED SUCCESSFULLY!');
    console.log('==============================================');
    console.log(`Checkout URL: ${session.url}`);
    console.log('==============================================\n');

  } catch (error) {
    console.error('❌ Stripe checkout session creation failed:', error.message);
  }
}

main();
