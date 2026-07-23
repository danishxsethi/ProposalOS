import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/middleware/auth';

interface Params {
    params: Promise<{ id: string }>;
}

/**
 * POST /api/proposal/[id]/outcome
 * Update proposal outcome and sales signals
 */
export const POST = withAuth(async (req: Request, { params }: Params) => {
    try {
        const { id } = await params;
        const body = await req.json();
        const {
            outcome,
            dealValue,
            lostReason,
            notes,
            replyReceived,
            replyReceivedAt,
            meetingBooked,
            meetingBookedAt,
            tierChosen,
        } = body;

        const normalizedOutcome = typeof outcome === 'string' ? outcome.toUpperCase() : undefined;
        if (normalizedOutcome && !['WON', 'LOST', 'PENDING'].includes(normalizedOutcome)) {
            return NextResponse.json(
                { error: 'Valid outcome required (WON, LOST, or PENDING)' },
                { status: 400 }
            );
        }

        const tierAlias: Record<string, string> = {
            essentials: 'starter',
            starter: 'starter',
            growth: 'growth',
            premium: 'premium',
        };
        const normalizedTier =
            typeof tierChosen === 'string' && tierChosen.trim().length > 0
                ? tierAlias[tierChosen.trim().toLowerCase()]
                : tierChosen === null
                    ? null
                    : undefined;
        if (typeof tierChosen === 'string' && !normalizedTier) {
            return NextResponse.json(
                { error: 'tierChosen must be starter, growth, or premium' },
                { status: 400 }
            );
        }

        const parseDate = (value: unknown): Date | null | undefined => {
            if (value === undefined) return undefined;
            if (value === null || value === '') return null;
            const parsed = new Date(String(value));
            if (Number.isNaN(parsed.getTime())) return undefined;
            return parsed;
        };

        let parsedReplyAt = parseDate(replyReceivedAt);
        let parsedMeetingAt = parseDate(meetingBookedAt);
        if (replyReceivedAt !== undefined && parsedReplyAt === undefined) {
            return NextResponse.json(
                { error: 'replyReceivedAt must be a valid ISO date, null, or omitted' },
                { status: 400 }
            );
        }
        if (meetingBookedAt !== undefined && parsedMeetingAt === undefined) {
            return NextResponse.json(
                { error: 'meetingBookedAt must be a valid ISO date, null, or omitted' },
                { status: 400 }
            );
        }
        const now = new Date();
        if (replyReceived === true && parsedReplyAt === undefined) parsedReplyAt = now;
        if (replyReceived === false) parsedReplyAt = null;
        if (meetingBooked === true && parsedMeetingAt === undefined) parsedMeetingAt = now;
        if (meetingBooked === false) parsedMeetingAt = null;

        const hasAnyUpdateField =
            normalizedOutcome !== undefined ||
            dealValue !== undefined ||
            lostReason !== undefined ||
            notes !== undefined ||
            parsedReplyAt !== undefined ||
            parsedMeetingAt !== undefined ||
            normalizedTier !== undefined;

        if (!hasAnyUpdateField) {
            return NextResponse.json(
                { error: 'At least one outcome or signal field is required' },
                { status: 400 }
            );
        }

        const existing = await prisma.proposal.findUnique({
            where: { id },
            select: {
                id: true,
                outcome: true,
                replyReceivedAt: true,
            },
        });

        if (!existing) {
            return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
        }

        const updateData: any = {
            notes: notes ?? undefined,
        };

        if (normalizedOutcome) {
            updateData.outcome = normalizedOutcome;
            if (normalizedOutcome === 'WON' || normalizedOutcome === 'LOST') {
                updateData.closedAt = now;
            } else {
                updateData.closedAt = null;
            }
            if (normalizedOutcome === 'WON') updateData.status = 'ACCEPTED';
            if (normalizedOutcome === 'LOST') updateData.status = 'REJECTED';
        }

        if (dealValue !== undefined) {
            if (dealValue === null || dealValue === '') {
                updateData.dealValue = null;
            } else {
                const numericDealValue = Number(dealValue);
                if (!Number.isFinite(numericDealValue) || numericDealValue < 0) {
                    return NextResponse.json(
                        { error: 'dealValue must be a positive number' },
                        { status: 400 }
                    );
                }
                updateData.dealValue = numericDealValue;
            }
        }

        if (lostReason !== undefined) {
            updateData.lostReason = lostReason || null;
        }

        if (normalizedTier !== undefined) {
            updateData.tierChosen = normalizedTier;
        }

        if (parsedReplyAt !== undefined) {
            updateData.replyReceivedAt = parsedReplyAt;
        }

        if (parsedMeetingAt !== undefined) {
            updateData.meetingBookedAt = parsedMeetingAt;
            // Meeting implies at least one reply signal.
            if (parsedMeetingAt && parsedReplyAt === undefined && !existing.replyReceivedAt) {
                updateData.replyReceivedAt = parsedMeetingAt;
            }
        }

        if (
            !normalizedOutcome &&
            (updateData.replyReceivedAt || updateData.meetingBookedAt || normalizedTier) &&
            !existing.outcome
        ) {
            updateData.outcome = 'PENDING';
        }

        const proposal = await prisma.proposal.update({
            where: { id },
            data: updateData,
        });

        return NextResponse.json({
            proposal: {
                ...proposal,
                dealValue: proposal.dealValue ? Number(proposal.dealValue) : null,
            },
        });
    } catch (error) {
        console.error('[API] Error updating proposal outcome:', error);
        return NextResponse.json(
            { error: 'Failed to update proposal outcome' },
            { status: 500 }
        );
    }
});
