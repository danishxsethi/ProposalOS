import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

describe('Stripe webhook architecture boundary tests', () => {
  const webhookRoutePath = path.resolve(__dirname, '../../app/api/stripe/webhook/route.ts');

  it('verifies that the Stripe webhook route exists', () => {
    expect(fs.existsSync(webhookRoutePath)).toBe(true);
  });

  it('proves that the Stripe webhook route does NOT parse request JSON before verifying signatures', () => {
    const content = fs.readFileSync(webhookRoutePath, 'utf8');

    // It should read the body raw text/buffer
    expect(content).toContain('req.text()');

    // It must NOT read JSON directly from the request before verification
    expect(content).not.toContain('req.json()');
  });

  it('proves that the Stripe webhook route enforces cryptographic constructEvent signature verification', () => {
    const content = fs.readFileSync(webhookRoutePath, 'utf8');

    // Ensure constructEvent is used
    const hasConstructEvent = /stripe\.webhooks\.constructEvent\s*\(/.test(content);
    expect(hasConstructEvent).toBe(true);
  });

  it('proves that the Stripe webhook route delegates event processing to handleStripeWebhookEvent helper and does not handle switch-case raw business events in-situ', () => {
    const content = fs.readFileSync(webhookRoutePath, 'utf8');

    // It must delegate to handleStripeWebhookEvent
    expect(content).toContain('handleStripeWebhookEvent(event)');

    // It must NOT do switch-case inline of billing event names itself (such as checkout.session.completed etc.)
    expect(content).not.toContain('checkout.session.completed');
    expect(content).not.toContain('customer.subscription.updated');
    expect(content).not.toContain('customer.subscription.deleted');
    expect(content).not.toContain('invoice.payment_failed');
    expect(content).not.toContain('invoice.paid');
  });

  it('scans the lib/ stripe folder and validates that any reference to webhook processing uses the approved handleStripeWebhookEvent helper', () => {
    const stripeLibPath = path.resolve(__dirname, '../../lib/stripe');
    const files = fs.readdirSync(stripeLibPath);

    for (const file of files) {
      const fullPath = path.join(stripeLibPath, file);
      if (fs.statSync(fullPath).isFile() && file !== 'webhookHandler.ts') {
        const content = fs.readFileSync(fullPath, 'utf8');
        // If they handle checkout.session.completed or invoice.paid inside lib/stripe, they must go through webhookHandler
        if (
          content.includes('checkout.session.completed') ||
          content.includes('invoice.paid') ||
          content.includes('invoice.payment_failed')
        ) {
          expect(content).toContain('handleStripeWebhookEvent');
        }
      }
    }
  });
});
