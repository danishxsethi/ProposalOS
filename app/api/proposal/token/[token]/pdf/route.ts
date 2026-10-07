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

import { generateTraceId, InternalError } from '@/lib/api/errors';
import { getBranding } from '@/lib/config/branding';
import { withRateLimit } from '@/lib/middleware/rateLimit';
import { generatePdf } from '@/lib/pdf/generatePdf';
import {
  PublicProposalAccessError,
  resolvePublicProposalAccess,
} from '@/lib/proposal/publicAccess';
import { runWithTenantAsync } from '@/lib/tenant/context';

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

    const access = await resolvePublicProposalAccess(token);
    const { proposal } = access;
    return runWithTenantAsync(access.tenantId, async () => {
      const branding = await getBranding(access.tenantId);
      const pdfBuffer = await generatePdf(
        token,
        process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
        proposal.audit.businessName,
        'A4',
        branding
      );
      const filename = `proposal-${proposal.audit.businessName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}-${token.substring(0, 8)}.pdf`;
      return new NextResponse(pdfBuffer as any as BodyInit, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'X-Trace-Id': traceId,
          'X-Proposal-Version': String(proposal.version),
        },
      });
    });
  } catch (error) {
    if (error instanceof PublicProposalAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
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
