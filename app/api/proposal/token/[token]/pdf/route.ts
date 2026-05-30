/**
 * GET /api/proposal/[token]/pdf
 * Generates and downloads the proposal PDF
 * Caches PDF to GCS for repeat downloads
 *
 * Features:
 * - Rate limiting
 * - Standardized error responses
 */

import { NextResponse } from 'next/server';

import { generateTraceId, InternalError, NotFoundError } from '@/lib/api/errors';
import { logger } from '@/lib/logger';
import { RateLimitPresets, withRateLimit } from '@/lib/middleware/rateLimit';
import { generatePdf } from '@/lib/pdf/generatePdf';
import { uploadPdfToGCS } from '@/lib/pdf/uploadPdf';
import { prisma } from '@/lib/prisma';

interface Params {
  params: Promise<{ token: string }>;
}

/**
 * Inner handler for PDF generation
 */
async function handlePdf(req: Request, { params }: Params): Promise<NextResponse> {
  const traceId = generateTraceId();

  try {
    const { token } = await params;

    const proposal = await prisma.proposal.findUnique({
      where: { webLinkToken: token },
      include: { audit: true },
    });

    if (!proposal) {
      return NextResponse.json(new NotFoundError('Proposal', token).toEnvelope(req.url, traceId), {
        status: 404,
      });
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
      const response = NextResponse.redirect(proposal.pdfUrl);
      response.headers.set('X-Trace-Id', traceId);
      response.headers.set('X-Cache', 'HIT');
      return response;
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

    const response = new NextResponse(pdfBuffer as any as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-Trace-Id': traceId,
        'X-Cache': 'MISS',
      },
    });

    return response;
  } catch (error) {
    const internalError = new InternalError('Failed to generate PDF', {
      originalError: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(internalError.toEnvelope(req.url, traceId), { status: 500 });
  }
}

// Apply rate limiting (10 requests per minute for PDF generation - expensive operation)
const rateLimitedHandler = (req: Request, params: Params) =>
  withRateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: 'Too many PDF requests. Please wait before trying again.',
  })(req, () => handlePdf(req, params));

export const GET = (req: Request, params: Params) => rateLimitedHandler(req, params);
