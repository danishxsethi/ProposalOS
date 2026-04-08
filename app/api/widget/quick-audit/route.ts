/**
 * POST /api/widget/quick-audit
 * Lightweight audit for widget embed.
 *
 * Features:
 * - Zod validation with quickAuditSchema
 * - Rate limiting (10 requests/minute for widget)
 * - Standardized error responses
 * - CORS enabled for external widget calls
 */

import { NextResponse } from 'next/server';

import { generateTraceId, InternalError, NotFoundError, ValidationError } from '@/lib/api/errors';
import { quickAuditSchema } from '@/lib/api/schemas/audit';
import { RateLimitPresets, withRateLimit } from '@/lib/middleware/rateLimit';
import { runGBPModule } from '@/lib/modules/gbp';
import { crawlWebsite } from '@/lib/modules/websiteCrawler';
import { prisma } from '@/lib/prisma';

function buildCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') || req.headers.get('x-widget-origin') || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers':
      'Content-Type, Authorization, Idempotency-Key, X-Trace-Id, X-Widget-Origin',
    Vary: 'Origin',
  };
}

/**
 * Inner handler for quick audit
 */
async function handleQuickAudit(req: Request): Promise<NextResponse> {
  const traceId = generateTraceId();

  try {
    const body = await req.json();
    const result = quickAuditSchema.safeParse(body);

    if (!result.success) {
      const errorDetails = result.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      const response = NextResponse.json(
        new ValidationError('Invalid input', errorDetails).toEnvelope(req.url, traceId),
        { status: 400 }
      );
      Object.entries(buildCorsHeaders(req)).forEach(([key, value]) =>
        response.headers.set(key, value)
      );
      return response;
    }

    const { url, websiteUrl, email, tenantDomain, tenantId, businessName } = result.data;
    const normalizedUrl = websiteUrl || url;

    // Verify Tenant Exists (by id or domain)
    const tenant = tenantId
      ? await prisma.tenant.findUnique({ where: { id: tenantId } })
      : await prisma.tenant.findFirst({ where: { domain: tenantDomain } });

    if (!tenant) {
      const response = NextResponse.json(
        new NotFoundError('Tenant', tenantDomain).toEnvelope(req.url, traceId),
        { status: 400 }
      );
      Object.entries(buildCorsHeaders(req)).forEach(([key, value]) =>
        response.headers.set(key, value)
      );
      return response;
    }

    // Create Audit Record
    const audit = await prisma.audit.create({
      data: {
        tenantId: tenant.id,
        businessName: businessName || email?.split('@')[0] || 'Unknown',
        businessUrl: normalizedUrl!,
        status: 'QUEUED',
      },
    });

    // Run Fast Modules in Parallel
    const [crawlRes, gbpRes] = await Promise.all([
      crawlWebsite({ url: normalizedUrl!, businessName: audit.businessName }),
      runGBPModule({ businessName: audit.businessName, city: 'Unknown' }),
    ]);

    // Calculate rudimentary score
    let score = 50; // Base
    score += 10; // Crawl succeeded
    const gbpVal = gbpRes as any;
    if (gbpVal.status === 'failed') score -= 10;
    else score += 20;
    score = Math.min(score, 90); // Cap at 90

    const topIssue = 'Website optimization needed';
    const grade = score > 80 ? 'B' : score > 60 ? 'C' : 'D';

    const response = NextResponse.json({
      auditId: audit.id,
      score,
      grade,
      topIssue,
      redirectUrl: `/proposal/preview/${audit.id}`,
    });

    response.headers.set('X-Trace-Id', traceId);
    Object.entries(buildCorsHeaders(req)).forEach(([key, value]) =>
      response.headers.set(key, value)
    );
    return response;
  } catch (error) {
    const internalError = new InternalError('Quick audit failed', {
      originalError: error instanceof Error ? error.message : String(error),
    });

    const response = NextResponse.json(internalError.toEnvelope(req.url, traceId), { status: 500 });
    Object.entries(buildCorsHeaders(req)).forEach(([key, value]) =>
      response.headers.set(key, value)
    );
    return response;
  }
}

// Apply rate limiting
const rateLimitedHandler = (req: Request) =>
  withRateLimit(RateLimitPresets.publicApi)(req, () => handleQuickAudit(req));

export const POST = rateLimitedHandler;

// Enable CORS for this route since it's called from external sites
export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 200,
    headers: buildCorsHeaders(request),
  });
}
