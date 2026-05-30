import { NextResponse } from 'next/server';

import { getServerSession } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { checkRateLimit } from '@/lib/middleware/rateLimit';
import { recordAuditTrailEvent } from '@/lib/observability/auditTrail';
import { generateCaseStudyPdf } from '@/lib/pdf/generateCaseStudyPdf';
import { prisma } from '@/lib/prisma';
import { hashSensitive } from '@/lib/security/abuseDefense/policies';
import { validateCaseStudyAccess } from '@/lib/security/caseStudyAuth';
import { runWithTenantAsync, runWithTenantBypass } from '@/lib/tenant/context';

function extractToken(request: Request): string | null {
  const authHeader = request.headers.get('Authorization');
  if (authHeader) {
    const parts = authHeader.split(' ');
    const firstPart = parts[0];
    const secondPart = parts[1];
    if (parts.length === 2 && firstPart && secondPart && firstPart.toLowerCase() === 'bearer') {
      return secondPart;
    }
  }

  const url = new URL(request.url);
  return url.searchParams.get('token');
}

export async function GET(request: Request, { params }: { params: Promise<{ auditId: string }> }) {
  try {
    const { auditId } = await params;
    const token = extractToken(request);

    // Get internal agency session if available
    const session = await getServerSession();
    const sessionTenantId = session?.user?.tenantId ?? null;

    // Perform production-grade token and scoping validation
    const authResult = await validateCaseStudyAccess(auditId, token, sessionTenantId);

    if (!authResult.authorized) {
      if (
        ['INVALID_TOKEN', 'EXPIRED_TOKEN', 'CROSS_TENANT_MISMATCH', 'MISSING_TOKEN'].includes(
          authResult.error || ''
        )
      ) {
        const invalidLimit = await checkRateLimit(request, {
          windowMs: 60 * 60 * 1000, // 1 hour
          max: 10,
          endpoint: 'invalid_token_attempt',
          routeClass: 'token_download',
          auditOnBlock: false,
          failClosed: true,
        });

        if (!invalidLimit.success) {
          const forwarded = request.headers.get('x-forwarded-for');
          const realIp = request.headers.get('x-real-ip');
          const ip = forwarded?.split(',')[0]?.trim() ?? realIp?.split(',')[0]?.trim() ?? 'unknown';

          await recordAuditTrailEvent({
            eventType: 'abuse.invalid_token_rate_limited',
            tenantId: sessionTenantId,
            payload: {
              routeClass: 'token_download',
              ipHash: hashSensitive(ip),
              endpoint: request.url,
              limit: 10,
              retryAfter: invalidLimit.retryAfter ?? 3600,
            },
          }).catch(() => {});

          return NextResponse.json(
            { error: 'Too many invalid attempts. Please try again later.' },
            { status: 429, headers: { 'Retry-After': String(invalidLimit.retryAfter ?? 3600) } }
          );
        }
      }

      await recordAuditTrailEvent({
        eventType: 'casestudy.token_blocked',
        tenantId: sessionTenantId,
        auditId,
        payload: {
          error: authResult.error,
          token: token ? '***' : null,
        },
      }).catch(() => {});

      if (authResult.error === 'NOT_FOUND') {
        return NextResponse.json({ error: 'Audit not found' }, { status: 404 });
      }
      if (authResult.error === 'MISSING_TOKEN') {
        return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
      }
      // INVALID_TOKEN, EXPIRED_TOKEN, CROSS_TENANT_MISMATCH are all 403 Forbidden
      return NextResponse.json({ error: 'Forbidden', message: authResult.error }, { status: 403 });
    }

    // Step 2: Resolve business name safely via narrow bypass to pass to generator.
    const auditMeta = await runWithTenantBypass('case-study-generate-business-discovery', () =>
      prisma.audit.findUnique({
        where: { id: auditId },
        select: { id: true, tenantId: true, businessName: true },
      })
    );

    if (!auditMeta) {
      return NextResponse.json({ error: 'Audit not found' }, { status: 404 });
    }

    // Scraping limit for valid case studies (100 requests per hour)
    const rateLimitSessionKey = token || session?.user?.id || 'anonymous';
    const validLimit = await checkRateLimit(request, {
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 100,
      sessionId: rateLimitSessionKey,
      endpoint: 'valid_token_scrape',
      routeClass: 'token_download',
      auditOnBlock: true,
      failClosed: true,
      tenantId: (auditMeta.tenantId || sessionTenantId) ?? undefined,
    });

    if (!validLimit.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded for this case-study.' },
        { status: 429, headers: { 'Retry-After': String(validLimit.retryAfter ?? 3600) } }
      );
    }

    // Step 3: Generate the PDF under the owning tenant context.
    const baseUrl =
      process.env.BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    // Propagate the token so that Puppeteer navigates to the authorized page path
    const pdfBuffer = await runWithTenantAsync(auditMeta.tenantId, () =>
      generateCaseStudyPdf(auditId, baseUrl, auditMeta.businessName, token || undefined)
    );

    const filename = `case-study-${auditMeta.businessName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}-${auditId.slice(0, 8)}.pdf`;

    // Emit casestudy.downloaded event
    await recordAuditTrailEvent({
      eventType: 'casestudy.downloaded',
      tenantId: auditMeta.tenantId,
      auditId,
      payload: {
        businessName: auditMeta.businessName,
        filename,
      },
    }).catch(() => {});

    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    logger.error(
      {
        event: 'case_study.pdf_failed',
        error: error instanceof Error ? error.message : String(error),
      },
      'Failed to generate case study PDF'
    );
    return NextResponse.json(
      { error: 'Failed to generate case study PDF', message: String(error) },
      { status: 500 }
    );
  }
}
