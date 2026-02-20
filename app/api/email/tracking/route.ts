import { NextResponse } from 'next/server';
import { logEmailEvent, EmailEventType } from '@/lib/email/analytics';
import { logger, logError } from '@/lib/logger';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { proposalId, step, variant, eventType } = body;

        if (!proposalId || typeof step !== 'number' || !variant || !eventType) {
            return NextResponse.json({ error: 'Missing required tracking fields' }, { status: 400 });
        }

        const validEventTypes: EmailEventType[] = ['open', 'click', 'reply'];
        if (!validEventTypes.includes(eventType as EmailEventType)) {
            return NextResponse.json({ error: 'Invalid event type. Must be open, click, or reply' }, { status: 400 });
        }

        const success = await logEmailEvent(proposalId, step, variant as 'A' | 'B', eventType as EmailEventType);

        if (!success) {
            return NextResponse.json({ error: 'Email sequence not found for proposal' }, { status: 404 });
        }

        logger.info({
            event: 'email.tracked',
            proposalId,
            step,
            variant,
            eventType
        }, `Email event mapped successfully`);

        return NextResponse.json({ success: true });

    } catch (error) {
        logError('Error tracking email event', error, { proposalId: undefined });
        return NextResponse.json({ error: 'Internal server error processing analytic event' }, { status: 500 });
    }
}
