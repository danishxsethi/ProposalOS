import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generatePdf } from '@/lib/pdf/generatePdf';
import { uploadPdfToGCS } from '@/lib/pdf/uploadPdf';
import { logger } from '@/lib/logger';

/**
 * GET /api/proposal/[token]/pdf
 * Generates and downloads the proposal PDF
 * Caches PDF to GCS for repeat downloads
 */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
    try {
        const { token } = await params;

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

        // Check if PDF already cached
        if (proposal.pdfUrl) {
            logger.info(
                {
                    event: 'pdf.cache_hit',
                    proposalId: proposal.id,
                    pdfUrl: proposal.pdfUrl,
                },
                'Redirecting to cached PDF'
            );

            // Redirect to cached PDF
            return NextResponse.redirect(proposal.pdfUrl);
        }

        // Generate new PDF
        logger.info(
            {
                event: 'pdf.generating',
                proposalId: proposal.id,
                businessName: proposal.audit.businessName,
            },
            'Generating PDF'
        );

        const pdfBuffer = await generatePdf(token, undefined, proposal.audit.businessName);

        // Upload to GCS and cache URL (optional - if upload fails, still return PDF)
        try {
            const pdfUrl = await uploadPdfToGCS(proposal.id, pdfBuffer);
            await prisma.proposal.update({
                where: { id: proposal.id },
                data: {
                    pdfUrl,
                    pdfGeneratedAt: new Date(),
                },
            });
            logger.info(
                { event: 'pdf.cached', proposalId: proposal.id, pdfUrl },
                'PDF generated and cached'
            );
        } catch (uploadError) {
            logger.warn(
                {
                    event: 'pdf.upload_skipped',
                    proposalId: proposal.id,
                    error: uploadError instanceof Error ? uploadError.message : String(uploadError),
                },
                'GCS upload failed, returning PDF without caching'
            );
        }

        // Return PDF buffer
        const filename = `proposal-${proposal.audit.businessName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}-${token.substring(0, 8)}.pdf`;

        return new NextResponse(pdfBuffer as any as BodyInit, {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${filename}"`,
            },
        });

    } catch (error) {
        logger.error(
            {
                event: 'pdf.generation_failed',
                error: error instanceof Error ? error.message : String(error),
            },
            'Failed to generate PDF'
        );

        return NextResponse.json(
            {
                error: 'Failed to generate PDF',
                message: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        );
    }
}
