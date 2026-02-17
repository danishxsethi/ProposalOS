import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateCaseStudyPdf } from '@/lib/pdf/generateCaseStudyPdf';
import { logger } from '@/lib/logger';

/**
 * GET /api/case-study/[auditId]/generate
 * Generates a case study PDF from the audit data.
 * Returns the PDF buffer for download.
 */
export async function GET(
    request: Request,
    { params }: { params: Promise<{ auditId: string }> }
) {
    try {
        const { auditId } = await params;

        const audit = await prisma.audit.findUnique({
            where: { id: auditId },
            select: { id: true, businessName: true },
        });

        if (!audit) {
            return NextResponse.json({ error: 'Audit not found' }, { status: 404 });
        }

        const baseUrl = process.env.BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const pdfBuffer = await generateCaseStudyPdf(auditId, baseUrl, audit.businessName);

        const filename = `case-study-${audit.businessName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}-${auditId.slice(0, 8)}.pdf`;

        return new NextResponse(pdfBuffer as unknown as BodyInit, {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${filename}"`,
            },
        });
    } catch (error) {
        logger.error(
            { event: 'case_study.pdf_failed', error: error instanceof Error ? error.message : String(error) },
            'Failed to generate case study PDF'
        );
        return NextResponse.json(
            { error: 'Failed to generate case study PDF', message: String(error) },
            { status: 500 }
        );
    }
}
