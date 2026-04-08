import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface RouteContext {
    params: Promise<{ token: string }>;
}

export async function POST(
    req: Request,
    context: RouteContext
) {
    try {
        const { token } = await context.params;
        const { platform } = await req.json();

        // Validate platform
        const validPlatforms = ['twitter', 'linkedin', 'facebook', 'email', 'copy'];
        if (!validPlatforms.includes(platform)) {
            return NextResponse.json(
                { error: 'Invalid platform' },
                { status: 400 }
            );
        }

        // Find proposal
        const proposal = await prisma.proposal.findUnique({
            where: { webLinkToken: token }
        });

        if (!proposal) {
            return NextResponse.json(
                { error: 'Proposal not found' },
                { status: 404 }
            );
        }

        // Track share event by incrementing counter
        // We'll add a shareCount field to Proposal model
        await prisma.proposal.update({
            where: { id: proposal.id },
            data: {
                shareCount: {
                    increment: 1
                }
            }
        });

        // Optionally: Log to a separate events table for detailed analytics
        // await prisma.proposalEvent.create({
        //     data: {
        //         proposalId: proposal.id,
        //         eventType: 'SHARED',
        //         platform,
        //         timestamp: new Date()
        //     }
        // });

        return NextResponse.json({
            success: true,
            message: 'Share tracked successfully'
        });

    } catch (error) {
        console.error('[Share API] Error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
