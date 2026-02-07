import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendProposalEmail } from '@/lib/email/sender';

interface Params {
    params: Promise<{ token: string }>;
}

/**
 * POST /api/proposal/[token]/email
 * Send proposal via email
 */
export async function POST(request: Request, { params }: Params) {
    try {
        const { token } = await params;
        const body = await request.json();
        const { email } = body;

        if (!email) {
            return NextResponse.json({ error: 'Email is required' }, { status: 400 });
        }

        // Verify proposal exists
        const proposal = await prisma.proposal.findUnique({
            where: { webLinkToken: token },
            include: { audit: true },
        });

        if (!proposal) {
            return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
        }

        const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
        const proposalUrl = `${baseUrl}/proposal/${token}`;
        const pdfUrl = `${baseUrl}/api/proposal/${token}/pdf`;

        // Send email
        const result = await sendProposalEmail({
            to: email,
            businessName: proposal.audit.businessName,
            proposalUrl,
            pdfUrl,
        });

        if (!result.success) {
            return NextResponse.json(
                { error: result.error || 'Failed to send email' },
                { status: 500 }
            );
        }

        // Update proposal status to 'SENT'
        await prisma.proposal.update({
            where: { id: proposal.id },
            data: {
                status: 'SENT',
                sentAt: new Date(),
            },
        });

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error('[Email API] Error:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}
