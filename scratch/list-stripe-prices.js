const Stripe = require('stripe');

async function main() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    console.error('Error: STRIPE_SECRET_KEY environment variable is not set.');
    process.exit(1);
  }

  const stripe = new Stripe(secretKey);

  try {
    console.log('Fetching products from Stripe...');
    const products = await stripe.products.list({ limit: 100 });
    console.log(`Found ${products.data.length} products.`);
    for (const prod of products.data) {
      console.log(`Product: ${prod.name} (ID: ${prod.id}), Active: ${prod.active}`);
    }

    console.log('\nFetching prices from Stripe...');
    const prices = await stripe.prices.list({ limit: 100 });
    console.log(`Found ${prices.data.length} prices.`);
    for (const price of prices.data) {
      console.log(`Price: ${price.id}, Active: ${price.active}, Amount: ${price.unit_amount / 100} ${price.currency}, Product ID: ${price.product}`);
    }
  } catch (error) {
    console.error('Stripe Error:', error.message);
  }
}

main();
