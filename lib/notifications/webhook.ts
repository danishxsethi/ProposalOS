
import { logger } from '@/lib/logger';

const WEBHOOK_URL = process.env.WEBHOOK_URL;

export type WebhookEvent = 'audit.complete' | 'proposal.ready' | 'proposal.viewed' | 'batch.complete';

export async function sendWebhook(event: WebhookEvent, payload: Record<string, any>) {
    if (!WEBHOOK_URL) {
        return;
    }

    // Fire and forget - do not await
    fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Event-Source': 'ProposalOS'
        },
        body: JSON.stringify({
            event,
            timestamp: new Date().toISOString(),
            data: payload
        })
    }).catch(error => {
        // Just log, don't throw
        logger.error({ error, event }, 'Webhook failed');
    });
}
