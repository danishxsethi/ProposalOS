/**
 * app/api/settings/api-keys/[id]/route.ts
 *
 * API Key Management - Revoke API keys
 *
 * Features:
 * - Auth & Role-based access (owner only)
 * - Rate limiting
 * - Standardized error responses
 */

import { NextResponse } from 'next/server';

import { ForbiddenError, generateTraceId, NotFoundError } from '@/lib/api/errors';
import { withAuth } from '@/lib/middleware/auth';
import { withRateLimit } from '@/lib/middleware/rateLimit';
import { withRole } from '@/lib/middleware/withRole';
import { recordAuditTrailEvent } from '@/lib/observability/auditTrail';
import { prisma } from '@/lib/prisma';
import { getTenantId } from '@/lib/tenant/context';

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * Inner handler for revoking API key
 */
async function handleRevokeKey(req: Request, { params }: Params): Promise<NextResponse> {
  const traceId = generateTraceId();
  const { id } = await params;
  const tenantId = await getTenantId();

  if (!tenantId) {
    return NextResponse.json(
      new ForbiddenError('Tenant context required').toEnvelope(req.url, traceId),
      { status: 403 }
    );
  }

  const apiKey = await prisma.apiKey.findUnique({
    where: { id },
  });

  if (!apiKey) {
    return NextResponse.json(new NotFoundError('API Key', id).toEnvelope(req.url, traceId), {
      status: 404,
    });
  }

  if (apiKey.tenantId !== tenantId) {
    return NextResponse.json(new ForbiddenError('Access denied').toEnvelope(req.url, traceId), {
      status: 403,
    });
  }

  await prisma.apiKey.update({
    where: { id },
    data: { isActive: false },
  });

  await recordAuditTrailEvent({
    eventType: 'apikey.revoked',
    tenantId,
    payload: {
      apiKeyId: apiKey.id,
      name: apiKey.name,
      prefix: apiKey.keyPrefix,
    },
  }).catch(() => {});

  const response = NextResponse.json({ success: true });
  response.headers.set('X-Trace-Id', traceId);
  return response;
}

/**
 * DELETE /api/settings/api-keys/[id]
 * Revoke an API key (requires owner role)
 */
const revokeHandler = (req: Request, params: Params) =>
  withRateLimit({
    windowMs: 60 * 1000,
    max: 5,
    message: 'Too many key revocation requests. Please wait before trying again.',
  })(req, () => handleRevokeKey(req, params));

export const DELETE = withRole('super_admin', withAuth(revokeHandler));
