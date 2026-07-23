/**
 * POST /api/proposal/[token]/contact
 * Lead capture: Name, Email (required), Phone (optional), Preferred tier, Best time, Message (optional).
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendProposalInterest } from '@/lib/notifications/email';

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
    try {
        const { token } = await params;
        const body = await req.json();

        const proposal = await prisma.proposal.findUnique({
            where: { webLinkToken: token },
            include: { audit: { select: { businessName: true } } },
        });

        if (!proposal) {
            return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
        }

        const { name, email, phone, preferredTier, bestTime, message } = body;

        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return NextResponse.json({ error: 'Name is required' }, { status: 400 });
        }

        if (!email || typeof email !== 'string' || email.trim().length === 0) {
            return NextResponse.json({ error: 'Email is required' }, { status: 400 });
        }

        const tierAlias: Record<string, string> = {
            essentials: 'starter',
            starter: 'starter',
            growth: 'growth',
            premium: 'premium',
        };
        const normalizedPreferredTier = typeof preferredTier === 'string' ? preferredTier.toLowerCase() : '';
        const tier = tierAlias[normalizedPreferredTier] || null;

        const now = new Date();

        await prisma.$transaction(async (tx) => {
            await tx.contactRequest.create({
                data: {
                    proposalId: proposal.id,
                    name: name.trim(),
                    email: email.trim(),
                    phone: typeof phone === 'string' ? phone.trim() || null : null,
                    preferredTier: tier,
                    bestTime: typeof bestTime === 'string' ? bestTime.trim() || null : null,
                    message: typeof message === 'string' ? message.trim() || null : null,
                },
            });

            // Outcome tracking signals:
            // - Contact form submit counts as a reply.
            // - Preferred tier is stored as buyer intent.
            const updateData: Record<string, unknown> = {};
            if (!proposal.replyReceivedAt) updateData.replyReceivedAt = now;
            if (!proposal.outcome) updateData.outcome = 'PENDING';
            if (tier && !proposal.tierChosen) updateData.tierChosen = tier;

            if (Object.keys(updateData).length > 0) {
                await tx.proposal.update({
                    where: { id: proposal.id },
                    data: updateData,
                });
            }
        });

        const proposalUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/proposal/${token}`;
        await sendProposalInterest(proposal.audit.businessName, proposalUrl, {
            name: name.trim(),
            email: email.trim(),
            phone: typeof phone === 'string' ? phone.trim() || null : null,
            preferredTier: tier,
            bestTime: typeof bestTime === 'string' ? bestTime.trim() || null : null,
            message: typeof message === 'string' ? message.trim() || null : null,
        });

        return NextResponse.json({
            success: true,
            tracked: {
                replyReceivedAt: now.toISOString(),
                tierChosen: tier,
            },
        });
    } catch (error) {
        console.error('Proposal contact error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
