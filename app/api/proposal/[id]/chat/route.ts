import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { runClosingAgent } from '@/lib/closing/agent';
import { logger, logError } from '@/lib/logger';

export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const resolvedParams = await params;
        const proposalId = resolvedParams.id;
        const body = await req.json();

        const { message, sessionId } = body;

        if (!message || !sessionId) {
            return NextResponse.json({ error: 'Missing message or sessionId' }, { status: 400 });
        }

        const proposal = await prisma.proposal.findUnique({
            where: { id: proposalId },
            include: { audit: true }
        });

        if (!proposal) {
            return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
        }

        const businessName = proposal.audit.businessName;
        // Build a concise context representation string
        const prospectContext = `
Audit Status: Complete
Executive Summary:
${proposal.executiveSummary}

Pricing Tier Structure:
${JSON.stringify(proposal.pricing)}
        `.trim();

        const result = await runClosingAgent(
            proposalId,
            sessionId,
            businessName,
            prospectContext,
            message
        );

        logger.info({
            event: 'closing_chat.message_processed',
            proposalId,
            sessionId,
            escalated: result.escalated,
            sentiment: result.sentiment
        }, 'Closing Chat message generated');

        return NextResponse.json({
            reply: result.reply,
            escalated: result.escalated,
            sentiment: result.sentiment
        });

    } catch (error) {
        logError('Error processing prospect chat', error, { proposalId: undefined });
        return NextResponse.json({ error: 'Internal server error while processing chat' }, { status: 500 });
    }
}
