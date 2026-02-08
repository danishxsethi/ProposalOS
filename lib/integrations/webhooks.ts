import { prisma } from '@/lib/prisma';
import crypto from 'crypto';
import { logger } from '@/lib/logger';

export type WebhookEvent =
    | 'audit.started'
    | 'audit.completed'
    | 'audit.failed'
    | 'proposal.generated'
    | 'proposal.viewed'
    | 'proposal.accepted'
    | 'proposal.declined'
    | 'monitoring.alert';

interface WebhookPayload {
    id: string; // Event ID
    event: WebhookEvent;
    timestamp: string;
    data: any;
}

export async function dispatchWebhook(tenantId: string, event: WebhookEvent, data: any) {
    // 1. Find subscribers
    const endpoints = await prisma.webhookEndpoint.findMany({
        where: {
            tenantId,
            isActive: true,
            events: { has: event }
        }
    });

    if (endpoints.length === 0) return;

    const payload: WebhookPayload = {
        id: crypto.randomUUID(),
        event,
        timestamp: new Date().toISOString(),
        data
    };

    const promises = endpoints.map(endpoint => sendToEndpoint(endpoint, payload));

    // Fire and forget (or await if critical)
    // We usually want this async so it doesn't block the main thread response
    Promise.allSettled(promises);
}

async function sendToEndpoint(endpoint: any, payload: WebhookPayload) {
    const body = JSON.stringify(payload);
    const signature = crypto
        .createHmac('sha256', endpoint.secret)
        .update(body)
        .digest('hex');

    try {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 10000); // 10s timeout

        const response = await fetch(endpoint.url, {
            method: 'POST',
            body,
            headers: {
                'Content-Type': 'application/json',
                'X-ProposalOS-Signature': signature,
                'X-ProposalOS-Event': payload.event
            },
            signal: controller.signal
        });
        clearTimeout(id);

        if (!response.ok) {
            throw new Error(\`HTTP \${response.status}\`);
        }

        // Success
        await prisma.webhookEndpoint.update({
            where: { id: endpoint.id },
            data: {
                failCount: 0,
                lastDeliveredAt: new Date()
            }
        });

    } catch (error) {
        logger.error({ error, endpointId: endpoint.id }, 'Webhook delivery failed');
        
        // Update Fail Count
        const updated = await prisma.webhookEndpoint.update({
            where: { id: endpoint.id },
            data: { failCount: { increment: 1 } }
        });

        // Deactivate if too many failures
        if (updated.failCount >= 10) {
           await prisma.webhookEndpoint.update({
               where: { id: endpoint.id },
               data: { isActive: false }
           });
           // TODO: Notify tenant owner
        }
    }
}
