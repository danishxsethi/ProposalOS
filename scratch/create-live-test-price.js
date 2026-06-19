const Stripe = require('stripe');

async function main() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    console.error('Error: STRIPE_SECRET_KEY environment variable is not set.');
    process.exit(1);
  }

  const stripe = new Stripe(secretKey);

  try {
    console.log('Creating live Stripe Product and Price for low-value billing verification...');

    // 1. Create a Product
    const product = await stripe.products.create({
      name: 'ProposalOS Starter (Live Test)',
      description: 'Low-value price for automated go-live verification',
      metadata: {
        environment: 'production',
        purpose: 'golive_verification',
      },
    });
    console.log(`✅ Product created: ${product.name} (ID: ${product.id})`);

    // 2. Create a recurring Price of $1.00 USD
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: 100, // $1.00 USD
      currency: 'usd',
      recurring: {
        interval: 'month',
      },
      metadata: {
        environment: 'production',
        purpose: 'golive_verification',
      },
    });
    console.log(`✅ Price created: $1.00 USD/month (ID: ${price.id})`);

    console.log('\n--- Actions Required ---');
    console.log(`Set the following environment variables on Cloud Run:`);
    console.log(`STRIPE_PRICE_ID_STARTER_LIVE="${price.id}"`);
    console.log(`STRIPE_PRODUCT_ID_STARTER_LIVE="${product.id}"`);

  } catch (error) {
    console.error('Stripe Error:', error.message);
  }
}

main();
