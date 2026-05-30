/**
 * POST /api/stripe/webhook
 * Stripe webhook handler for payment events.
 *
 * Enforces:
 * - Signature verification using STRIPE_WEBHOOK_SECRET
 * - Delegate execution to centralized, tenant-safe handleStripeWebhookEvent
 * - Zero secret or PII exposure in logs
 */

import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { generateTraceId, InternalError } from '@/lib/api/errors';
import { checkRateLimit } from '@/lib/middleware/rateLimit';
import { recordAuditTrailEvent } from '@/lib/observability/auditTrail';
import { stripe, stripeWebhookSecret } from '@/lib/stripe/stripe';
import { handleStripeWebhookEvent } from '@/lib/stripe/webhookHandler';

export async function POST(req: Request) {
  const traceId = generateTraceId();
  const body = await req.text();
  const headerList = await headers();
  const signature = headerList.get('Stripe-Signature') || headerList.get('stripe-signature');

  if (!signature) {
    return NextResponse.json(
      {
        error: {
          code: 'MISSING_HEADER',
          message: 'Missing Stripe signature',
          timestamp: new Date().toISOString(),
          traceId,
        },
      },
      { status: 400 }
    );
  }

  let webhookSecret: string;
  try {
    webhookSecret = stripeWebhookSecret();
  } catch (error: any) {
    const internalError = new InternalError(
      'Webhook processing failed: Stripe webhook secret is missing or unconfigured',
      {
        originalError: error instanceof Error ? error.message : String(error),
      }
    );
    return NextResponse.json(internalError.toEnvelope(req.url, traceId), { status: 500 });
  }

  let event: any;
  try {
    // Construct & cryptographically verify Stripe signature
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (error: any) {
    // Safe sanitize log
    const sanitizedMsg = error.message.replace(/sk_test_[a-zA-Z0-9]+/g, 'sk_test_***');

    // Emit signature failure event
    await recordAuditTrailEvent({
      eventType: 'stripe.webhook_signature_failed',
      tenantId: null,
      payload: {
        error: sanitizedMsg,
        unverifiedType: (() => {
          try {
            return JSON.parse(body).type;
          } catch {
            return 'unknown';
          }
        })(),
      },
    }).catch(() => {});

    // Rate-limit invalid signature attempts by IP (windowMs: 1m, max: 10)
    const limitResult = await checkRateLimit(req, {
      windowMs: 60 * 1000, // 1 minute
      max: 10,
      endpoint: 'stripe_webhook_signature_failure',
      routeClass: 'stripe_webhook',
      auditOnBlock: true,
      failClosed: true,
    });

    if (!limitResult.success) {
      return NextResponse.json(
        {
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many invalid webhook signature attempts.',
            timestamp: new Date().toISOString(),
            traceId,
          },
        },
        { status: 429, headers: { 'Retry-After': String(limitResult.retryAfter ?? 60) } }
      );
    }

    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: `Webhook Error: ${sanitizedMsg}`,
          timestamp: new Date().toISOString(),
          traceId,
        },
      },
      { status: 400 }
    );
  }

  try {
    // Process the verified event via the secure, idempotent, tenant-isolated handler
    const result = await handleStripeWebhookEvent(event);

    const response = NextResponse.json({
      received: true,
      deduplicated: result.deduplicated || false,
      eventId: event.id,
    });
    response.headers.set('X-Trace-Id', traceId);
    return response;
  } catch (error: any) {
    // Failed events are already recorded to FailedWebhookEvent in handleStripeWebhookEvent.
    // Return proper 500 error envelope so Stripe knows to retry the event.
    const internalError = new InternalError('Webhook processing failed', {
      originalError: error instanceof Error ? error.message : String(error),
    });

    const responseEnvelope = internalError.toEnvelope(req.url, traceId);
    // Sanitize any potential secrets from the propagated response
    if (responseEnvelope.error?.message) {
      responseEnvelope.error.message = responseEnvelope.error.message.replace(
        /sk_test_[a-zA-Z0-9]+/g,
        'sk_test_***'
      );
    }

    return NextResponse.json(responseEnvelope, { status: 500 });
  }
}
