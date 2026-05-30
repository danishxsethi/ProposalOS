import { logger } from '@/lib/logger';
import { getObservabilityContext } from '@/lib/observability/context';

const WEBHOOK_URL = process.env.WEBHOOK_URL;

export type WebhookEvent =
  | 'audit.complete'
  | 'audit.completed'
  | 'audit.failed'
  | 'proposal.ready'
  | 'proposal.viewed'
  | 'batch.complete'
  | 'chat.escalated';

export async function sendWebhook(event: WebhookEvent, payload: Record<string, any>) {
  if (!WEBHOOK_URL) {
    return;
  }

  const context = getObservabilityContext();

  // Fire and forget - do not await
  fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Event-Source': 'ProposalOS',
      ...(context?.correlationId ? { 'X-Correlation-Id': context.correlationId } : {}),
      ...(context?.traceId ? { 'X-Trace-Id': context.traceId } : {}),
      ...(context?.traceparent ? { traceparent: context.traceparent } : {}),
    },
    body: JSON.stringify({
      event,
      timestamp: new Date().toISOString(),
      data: payload,
    }),
  }).catch((error) => {
    // Just log, don't throw
    logger.error({ error, event }, 'Webhook failed');
  });
}
