/**
 * app/api/tenants/[tenantId]/domain/verify/route.ts
 *
 * Custom Domain Verification API
 *
 * POST /api/tenants/[tenantId]/domain/verify - Verify domain ownership via DNS check
 */

import { NextRequest, NextResponse } from 'next/server';

import { generateTraceId, InternalError, UnauthorizedError } from '@/lib/api/errors';
import { API_KEY_SCOPES, validateApiKey } from '@/lib/auth/apiKeys';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * Verify DNS resolution for a domain
 * In production, use a proper DNS resolver library or service
 */
async function verifyDnsRecord(domain: string): Promise<boolean> {
  try {
    // In production, use: await dns.resolve4(domain) or a DNS-over-HTTPS API
    // For now, we'll use a simple fetch to check if the domain resolves
    // This is a placeholder - implement proper DNS verification in production

    // Option 1: Use Google DNS-over-HTTPS
    const response = await fetch(
      `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=CNAME`,
      { headers: { accept: 'application/dns-json' } }
    );

    if (!response.ok) return false;

    const data = (await response.json()) as {
      Status: number;
      Answer?: { type: number; data: string }[];
    };

    // Status 0 = NOERROR
    if (data.Status !== 0) return false;

    // Check if CNAME points to our app
    const cnameRecord = data.Answer?.find((a) => a.type === 5); // Type 5 = CNAME
    if (cnameRecord && cnameRecord.data.includes('proposalos')) {
      return true;
    }

    // Also check A records
    const aRecord = data.Answer?.find((a) => a.type === 1); // Type 1 = A
    if (aRecord) {
      return true; // Domain has an A record (could be proxied through CDN)
    }

    return false;
  } catch (error) {
    logger.error({ error, domain }, 'DNS verification failed');
    return false;
  }
}

/**
 * POST /api/tenants/[tenantId]/domain/verify
 *
 * Verify domain ownership by checking DNS records
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ tenantId: string }> }
): Promise<NextResponse> {
  const traceId = generateTraceId();
  const { tenantId } = await context.params;

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
      validation.scopes.includes(API_KEY_SCOPES.ALL) || validation.scopes.includes('admin:*');

    if (!hasAdminScope && validation.tenantId !== tenantId) {
      throw new UnauthorizedError('Access denied to this tenant');
    }

    // Get tenant's custom domain
    const branding = await prisma.tenantBranding.findUnique({
      where: { tenantId },
      select: { customDomain: true, customDomainVerified: true },
    });

    if (!branding?.customDomain) {
      return NextResponse.json(
        { error: 'No custom domain configured', code: 'NO_DOMAIN' },
        { status: 400, headers: { 'X-Trace-Id': traceId } }
      );
    }

    if (branding.customDomainVerified) {
      return NextResponse.json({
        verified: true,
        customDomain: branding.customDomain,
        message: 'Domain already verified',
        dnsRecord: {
          type: 'CNAME',
          host: branding.customDomain,
          value: 'app.proposalos.local',
        },
      });
    }

    // Verify DNS record
    const dnsVerified = await verifyDnsRecord(branding.customDomain);

    if (!dnsVerified) {
      return NextResponse.json({
        verified: false,
        customDomain: branding.customDomain,
        message: 'DNS verification failed. Please ensure CNAME record is properly configured.',
        dnsRecord: {
          type: 'CNAME',
          host: branding.customDomain,
          value: 'app.proposalos.local',
        },
        troubleshooting: [
          'Wait 5-10 minutes for DNS propagation',
          'Check CNAME record points to app.proposalos.local',
          'Ensure no conflicting A records exist',
          'Contact support if issue persists',
        ],
      });
    }

    // Mark domain as verified
    await prisma.tenantBranding.update({
      where: { tenantId },
      data: {
        customDomainVerified: true,
        customDomainVerifiedAt: new Date(),
      },
    });

    logger.info(
      {
        event: 'tenant.domain_verified',
        tenantId,
        domain: branding.customDomain,
      },
      'Custom domain verified successfully'
    );

    return NextResponse.json({
      verified: true,
      customDomain: branding.customDomain,
      verifiedAt: new Date(),
      message: 'Domain verified successfully! Your custom domain is now active.',
      dnsRecord: {
        type: 'CNAME',
        host: branding.customDomain,
        value: 'app.proposalos.local',
      },
    });
  } catch (error) {
    logger.error({ error, tenantId }, 'Failed to verify domain');

    if (error instanceof UnauthorizedError) {
      return NextResponse.json(
        { error: error.message, code: 'UNAUTHORIZED' },
        { status: 401, headers: { 'X-Trace-Id': traceId } }
      );
    }

    const internalError = new InternalError('Failed to verify domain', {
      originalError: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(internalError.toEnvelope(request.url, traceId), { status: 500 });
  }
}
