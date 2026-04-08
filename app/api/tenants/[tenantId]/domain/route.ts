/**
 * app/api/tenants/[tenantId]/domain/route.ts
 *
 * Custom Domain Management API
 *
 * POST /api/tenants/[tenantId]/domain - Set custom domain
 * GET /api/tenants/[tenantId]/domain - Get domain status
 * DELETE /api/tenants/[tenantId]/domain - Remove custom domain
 * POST /api/tenants/[tenantId]/domain/verify - Verify domain ownership
 */

import { NextRequest, NextResponse } from 'next/server';

import { generateTraceId, InternalError, UnauthorizedError } from '@/lib/api/errors';
import { validateApiKey, API_KEY_SCOPES } from '@/lib/auth/apiKeys';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export interface SetCustomDomainRequest {
  customDomain: string;
}

export interface VerifyDomainResponse {
  verified: boolean;
  dnsRecord: {
    type: string;
    host: string;
    value: string;
  };
  message: string;
}

/**
 * POST /api/tenants/[tenantId]/domain
 *
 * Set custom domain for tenant
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { tenantId: string } }
): Promise<NextResponse> {
  const traceId = generateTraceId();
  const { tenantId } = params;

  try {
    // Verify tenant owner or admin access
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedError('Authorization required');
    }

    const apiKey = authHeader.substring(7);
    const validation = await validateApiKey(apiKey, API_KEY_SCOPES.TENANT_UPDATE);

    if (!validation || 'error' in validation) {
      throw new UnauthorizedError('Invalid or insufficient API key');
    }

    const hasAdminScope =
      validation.scopes.includes(API_KEY_SCOPES.ALL) ||
      validation.scopes.includes('admin:*');

    if (!hasAdminScope && validation.tenantId !== tenantId) {
      throw new UnauthorizedError('Access denied to this tenant');
    }

    const body: SetCustomDomainRequest = await request.json();

    if (!body.customDomain) {
      return NextResponse.json(
        { error: 'customDomain is required', code: 'VALIDATION_ERROR' },
        { status: 400, headers: { 'X-Trace-Id': traceId } }
      );
    }

    // Validate domain format
    const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$/;
    if (!domainRegex.test(body.customDomain)) {
      return NextResponse.json(
        { error: 'Invalid domain format', code: 'INVALID_DOMAIN' },
        { status: 400, headers: { 'X-Trace-Id': traceId } }
      );
    }

    // Check if domain is already in use by another tenant
    const existingDomain = await prisma.tenantBranding.findFirst({
      where: {
        customDomain: body.customDomain,
        tenantId: { not: tenantId },
      },
    });

    if (existingDomain) {
      return NextResponse.json(
        { error: 'Domain already in use by another tenant', code: 'DOMAIN_TAKEN' },
        { status: 409, headers: { 'X-Trace-Id': traceId } }
      );
    }

    // Set custom domain (unverified initially)
    await prisma.tenantBranding.upsert({
      where: { tenantId },
      update: {
        customDomain: body.customDomain,
        customDomainVerified: false,
        customDomainVerifiedAt: null,
      },
      create: {
        tenantId,
        customDomain: body.customDomain,
        customDomainVerified: false,
      },
    });

    logger.info(
      {
        event: 'tenant.domain_set',
        tenantId,
        domain: body.customDomain,
      },
      'Custom domain set for tenant'
    );

    return NextResponse.json({
      success: true,
      customDomain: body.customDomain,
      verified: false,
      dnsRecord: {
        type: 'CNAME',
        host: body.customDomain,
        value: 'app.proposalos.local',
      },
      message: `Please create a CNAME record pointing ${body.customDomain} to app.proposalos.local, then verify the domain.`,
    });
  } catch (error) {
    logger.error({ error, tenantId }, 'Failed to set custom domain');

    if (error instanceof UnauthorizedError) {
      return NextResponse.json(
        { error: error.message, code: 'UNAUTHORIZED' },
        { status: 401, headers: { 'X-Trace-Id': traceId } }
      );
    }

    const internalError = new InternalError('Failed to set custom domain', {
      originalError: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(internalError.toEnvelope(request.url, traceId), { status: 500 });
  }
}

/**
 * GET /api/tenants/[tenantId]/domain
 *
 * Get custom domain status
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { tenantId: string } }
): Promise<NextResponse> {
  const traceId = generateTraceId();
  const { tenantId } = params;

  try {
    // Verify access
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedError('Authorization required');
    }

    const apiKey = authHeader.substring(7);
    const validation = await validateApiKey(apiKey, API_KEY_SCOPES.TENANT_READ);

    if (!validation || 'error' in validation) {
      throw new UnauthorizedError('Invalid or insufficient API key');
    }

    const hasAdminScope =
      validation.scopes.includes(API_KEY_SCOPES.ALL) ||
      validation.scopes.includes('admin:*');

    if (!hasAdminScope && validation.tenantId !== tenantId) {
      throw new UnauthorizedError('Access denied to this tenant');
    }

    const branding = await prisma.tenantBranding.findUnique({
      where: { tenantId },
      select: {
        customDomain: true,
        customDomainVerified: true,
        customDomainVerifiedAt: true,
      },
    });

    return NextResponse.json({
      customDomain: branding?.customDomain || null,
      verified: branding?.customDomainVerified || false,
      verifiedAt: branding?.customDomainVerifiedAt || null,
      dnsRecord: branding?.customDomain
        ? {
            type: 'CNAME',
            host: branding.customDomain,
            value: 'app.proposalos.local',
          }
        : null,
    });
  } catch (error) {
    logger.error({ error, tenantId }, 'Failed to get custom domain');

    if (error instanceof UnauthorizedError) {
      return NextResponse.json(
        { error: error.message, code: 'UNAUTHORIZED' },
        { status: 401, headers: { 'X-Trace-Id': traceId } }
      );
    }

    const internalError = new InternalError('Failed to get custom domain', {
      originalError: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(internalError.toEnvelope(request.url, traceId), { status: 500 });
  }
}

/**
 * DELETE /api/tenants/[tenantId]/domain
 *
 * Remove custom domain
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { tenantId: string } }
): Promise<NextResponse> {
  const traceId = generateTraceId();
  const { tenantId } = params;

  try {
    // Verify tenant owner or admin access
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedError('Authorization required');
    }

    const apiKey = authHeader.substring(7);
    const validation = await validateApiKey(apiKey, API_KEY_SCOPES.TENANT_UPDATE);

    if (!validation || 'error' in validation) {
      throw new UnauthorizedError('Invalid or insufficient API key');
    }

    const hasAdminScope =
      validation.scopes.includes(API_KEY_SCOPES.ALL) ||
      validation.scopes.includes('admin:*');

    if (!hasAdminScope && validation.tenantId !== tenantId) {
      throw new UnauthorizedError('Access denied to this tenant');
    }

    await prisma.tenantBranding.update({
      where: { tenantId },
      data: {
        customDomain: null,
        customDomainVerified: false,
        customDomainVerifiedAt: null,
      },
    });

    logger.info(
      {
        event: 'tenant.domain_removed',
        tenantId,
      },
      'Custom domain removed for tenant'
    );

    return NextResponse.json({
      success: true,
      message: 'Custom domain removed successfully',
    });
  } catch (error) {
    logger.error({ error, tenantId }, 'Failed to remove custom domain');

    if (error instanceof UnauthorizedError) {
      return NextResponse.json(
        { error: error.message, code: 'UNAUTHORIZED' },
        { status: 401, headers: { 'X-Trace-Id': traceId } }
      );
    }

    const internalError = new InternalError('Failed to remove custom domain', {
      originalError: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(internalError.toEnvelope(request.url, traceId), { status: 500 });
  }
}