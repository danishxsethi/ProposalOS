/**
 * Webhook system for the Public REST API.
 * Implements registration, delivery with retry (3 attempts, exponential backoff),
 * and HMAC-SHA256 signature verification.
 *
 * Requirements: 9.4
 */

import { createHmac, randomBytes } from 'crypto';
import { prisma } from '@/lib/prisma';
import type { WebhookConfig, WebhookDeliveryResult, WebhookEvent } from '@/lib/platform/types';

// ---------------------------------------------------------------------------
// HMAC signature
// ---------------------------------------------------------------------------

export function signPayload(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

export function verifySignature(secret: string, payload: string, signature: string): boolean {
  const expected = signPayload(secret, payload);
  // Constant-time comparison
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export interface RegisterWebhookInput {
  url: string;
  events: WebhookEvent[];
}

export async function registerWebhook(
  tenantId: string,
  input: RegisterWebhookInput
): Promise<WebhookConfig> {
  const secret = randomBytes(32).toString('hex');

  const record = await prisma.webhookEndpoint.create({
    data: {
      tenantId,
      url: input.url,
      events: input.events,
      secretHash: secret, // stored as plaintext secret for HMAC signing
      status: 'active',
      failureCount: 0,
    },
  });

  return {
    id: record.id,
    tenantId: record.tenantId,
    url: record.url,
    events: record.events as WebhookEvent[],
    secret,
    status: record.status as 'active' | 'paused' | 'failed',
    failureCount: record.failureCount,
    lastDeliveredAt: record.lastDeliveredAt ?? undefined,
  };
}

export async function deleteWebhook(webhookId: string, tenantId: string): Promise<boolean> {
  const result = await prisma.webhookEndpoint.deleteMany({
    where: { id: webhookId, tenantId },
  });
  return result.count > 0;
}

export async function listWebhooks(tenantId: string): Promise<WebhookConfig[]> {
  const records = await prisma.webhookEndpoint.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
  });

  return records.map((r) => ({
    id: r.id,
    tenantId: r.tenantId,
    url: r.url,
    events: r.events as WebhookEvent[],
    secret: '[redacted]',
    status: r.status as 'active' | 'paused' | 'failed',
    failureCount: r.failureCount,
    lastDeliveredAt: r.lastDeliveredAt ?? undefined,
  }));
}

// ---------------------------------------------------------------------------
// Delivery with retry (3 attempts, exponential backoff)
// ---------------------------------------------------------------------------

const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 1000; // 1s, 2s, 4s

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function deliverWebhook(
  webhookId: string,
  event: WebhookEvent,
  payload: unknown
): Promise<WebhookDeliveryResult> {
  const webhook = await prisma.webhookEndpoint.findUnique({
    where: { id: webhookId },
  });

  if (!webhook || webhook.status !== 'active') {
    return { success: false, attemptCount: 0 };
  }

  const payloadStr = JSON.stringify({ event, data: payload, timestamp: new Date().toISOString() });
  const signature = signPayload(webhook.secretHash, payloadStr);

  let lastStatusCode: number | undefined;
  let lastResponseBody: string | undefined;
  let attemptCount = 0;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    attemptCount = attempt;

    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Event': event,
          'X-Webhook-Signature': `sha256=${signature}`,
          'X-Webhook-Delivery': webhookId,
        },
        body: payloadStr,
        signal: AbortSignal.timeout(10_000), // 10s timeout
      });

      lastStatusCode = response.status;
      lastResponseBody = await response.text().catch(() => '');

      if (response.ok) {
        // Success — log and update
        await prisma.webhookDelivery.create({
          data: {
            webhookId,
            event,
            payload: payload as object,
            statusCode: lastStatusCode,
            responseBody: lastResponseBody,
            success: true,
            attemptCount,
            deliveredAt: new Date(),
          },
        });

        await prisma.webhookEndpoint.update({
          where: { id: webhookId },
          data: { lastDeliveredAt: new Date(), failureCount: 0 },
        });

        return {
          success: true,
          statusCode: lastStatusCode,
          responseBody: lastResponseBody,
          attemptCount,
          deliveredAt: new Date(),
        };
      }
    } catch {
      // Network error — will retry
    }

    if (attempt < MAX_ATTEMPTS) {
      await sleep(BASE_DELAY_MS * Math.pow(2, attempt - 1));
    }
  }

  // All attempts failed
  await prisma.webhookDelivery.create({
    data: {
      webhookId,
      event,
      payload: payload as object,
      statusCode: lastStatusCode,
      responseBody: lastResponseBody,
      success: false,
      attemptCount,
    },
  });

  const newFailureCount = webhook.failureCount + 1;
  await prisma.webhookEndpoint.update({
    where: { id: webhookId },
    data: {
      failureCount: newFailureCount,
      lastFailedAt: new Date(),
      lastFailureReason: `HTTP ${lastStatusCode ?? 'network error'} after ${MAX_ATTEMPTS} attempts`,
      // Auto-pause after 10 consecutive failures
      status: newFailureCount >= 10 ? 'failed' : webhook.status,
    },
  });

  return {
    success: false,
    statusCode: lastStatusCode,
    responseBody: lastResponseBody,
    attemptCount,
  };
}

// ---------------------------------------------------------------------------
// Fan-out: deliver to all matching webhooks for a tenant + event
// ---------------------------------------------------------------------------

export async function dispatchEvent(
  tenantId: string,
  event: WebhookEvent,
  payload: unknown
): Promise<void> {
  const webhooks = await prisma.webhookEndpoint.findMany({
    where: {
      tenantId,
      status: 'active',
      events: { has: event },
    },
  });

  // Fire-and-forget delivery for each registered webhook
  for (const webhook of webhooks) {
    deliverWebhook(webhook.id, event, payload).catch((err) =>
      console.error(`Webhook delivery failed for ${webhook.id}:`, err)
    );
  }
}
