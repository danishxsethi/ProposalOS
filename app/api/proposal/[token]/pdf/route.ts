import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generatePdf } from '@/lib/pdf/generatePdf';
import { uploadPdf } from '@/lib/storage';

interface Params {
    params: {
        token: string;
    };
}

/**
 * GET /api/proposal/[token]/pdf
 * Generates and downloads the proposal PDF
 */
export async function GET(request: Request, { params }: Params) {
    try {
        const { token } = params;

        const proposal = await prisma.proposal.findUnique({
            where: { webLinkToken: token },
            include: { audit: true },
        });

        if (!proposal) {
            return NextResponse.json(
                { error: 'Proposal not found' },
                { status: 404 }
            );
        }

        // Generate PDF
        console.log(`Generating PDF for proposal ${token}...`);
        const pdfBuffer = await generatePdf(token);

        // Upload to GCS and cache URL (if bucket configured)
        const filename = `proposal-${proposal.audit.businessName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}-${token.substring(0, 8)}.pdf`;
        const pdfUrl = await uploadPdf(pdfBuffer, filename);

        if (pdfUrl) {
            await prisma.proposal.update({
                where: { id: proposal.id },
                data: { pdfUrl },
            });
            console.log(`PDF cached at: ${pdfUrl}`);
        }

        // Return PDF
        return new NextResponse(pdfBuffer as any as BodyInit, {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${filename}"`,
            },
        });

    } catch (error) {
        console.error('[PDF Export] Error:', error);
        return NextResponse.json(
            {
                error: 'Failed to generate PDF',
                message: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        );
    }
}
