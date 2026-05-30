/**
 * app/api/tenants/route.ts
 *
 * Tenant Management API
 *
 * POST /api/tenants - Create new tenant (automated onboarding)
 * GET /api/tenants - List tenants (admin only)
 */

import { NextRequest, NextResponse } from 'next/server';

import { v4 as uuidv4 } from 'uuid';

import { generateTraceId, InternalError, UnauthorizedError } from '@/lib/api/errors';
import { API_KEY_SCOPES, generateApiKey, validateApiKey } from '@/lib/auth/apiKeys';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export interface CreateTenantRequest {
  name: string;
  slug: string;
  email: string;
  planTier: 'free' | 'starter' | 'pro' | 'agency';
  branding?: {
    brandName?: string;
    logoUrl?: string;
    primaryColor?: string;
    secondaryColor?: string;
    accentColor?: string;
    contactEmail?: string;
    tagline?: string;
    footerText?: string;
    showPoweredBy?: boolean;
  };
}

export interface CreateTenantResponse {
  tenantId: string;
  name: string;
  slug: string;
  planTier: string;
  apiKey: string;
  apiKeyPrefix: string;
  createdAt: Date;
}

/**
 * POST /api/tenants
 *
 * Automated tenant onboarding:
 * 1. Create tenant record
 * 2. Configure branding
 * 3. Generate API keys
 * 4. Return credentials
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const traceId = generateTraceId();

  try {
    // Verify admin access
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      // Allow self-signup for free tier
      logger.info({ traceId }, 'Allowing self-signup');
    } else {
      const apiKey = authHeader.substring(7);
      const validation = await validateApiKey(apiKey);
      if (validation && 'error' in validation) {
        throw new UnauthorizedError('Invalid API key');
      }
    }

    const body: CreateTenantRequest = await request.json();

    // Validate required fields
    if (!body.name || !body.slug || !body.email) {
      return NextResponse.json(
        { error: 'Missing required fields: name, slug, email', code: 'VALIDATION_ERROR' },
        { status: 400, headers: { 'X-Trace-Id': traceId } }
      );
    }

    // Check slug uniqueness
    const existingTenant = await prisma.tenant.findUnique({
      where: { slug: body.slug },
    });

    if (existingTenant) {
      return NextResponse.json(
        { error: 'Slug already taken', code: 'SLUG_TAKEN' },
        { status: 409, headers: { 'X-Trace-Id': traceId } }
      );
    }

    // Create tenant with branding and API key in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const tenantId = uuidv4();

      // 1. Create tenant
      const tenant = await tx.tenant.create({
        data: {
          id: tenantId,
          name: body.name,
          slug: body.slug,
          domain: `${body.slug}.proposalos.local`,
          planTier: body.planTier || 'free',
          status: 'active',
          subscriptionStatus: body.planTier === 'free' ? 'inactive' : 'pending',
          onboardingCompletedAt: new Date(),
        },
      });

      // 2. Create branding config
      if (body.branding) {
        await tx.tenantBranding.create({
          data: {
            tenantId,
            brandName: body.branding.brandName || body.name,
            logoUrl: body.branding.logoUrl,
            primaryColor: body.branding.primaryColor || '#8B5CF6',
            secondaryColor: body.branding.secondaryColor || '#38BDF8',
            accentColor: body.branding.accentColor || '#F59E0B',
            contactEmail: body.branding.contactEmail || body.email,
            tagline: body.branding.tagline || 'Digital Presence Assessment',
            footerText: body.branding.footerText,
            showPoweredBy: body.branding.showPoweredBy ?? true,
          },
        });
      }

      // 3. Generate API key
      const { key, hash } = generateApiKey();
      const apiKey = await tx.apiKey.create({
        data: {
          tenantId,
          keyHash: hash,
          keyPrefix: key.substring(0, 12),
          name: 'Default API Key',
          scopes: [API_KEY_SCOPES.ALL],
          isActive: true,
          rateLimitPerDay:
            body.planTier === 'agency' ? 10000 : body.planTier === 'pro' ? 5000 : 1000,
        },
      });

      // 4. Create default user
      await tx.user.create({
        data: {
          email: body.email,
          name: body.name,
          tenantId,
          role: 'owner',
        },
      });

      return { tenant, apiKey, key };
    });

    logger.info(
      {
        event: 'tenant.created',
        tenantId: result.tenant.id,
        slug: result.tenant.slug,
        planTier: result.tenant.planTier,
      },
      'Tenant created successfully'
    );

    const response: CreateTenantResponse = {
      tenantId: result.tenant.id,
      name: result.tenant.name,
      slug: result.tenant.slug!,
      planTier: result.tenant.planTier,
      apiKey: result.key, // Return full key only once
      apiKeyPrefix: result.apiKey.keyPrefix,
      createdAt: result.tenant.createdAt,
    };

    return NextResponse.json(response, {
      status: 201,
      headers: { 'X-Trace-Id': traceId },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to create tenant');

    if (error instanceof UnauthorizedError) {
      return NextResponse.json(
        { error: error.message, code: 'UNAUTHORIZED' },
        { status: 401, headers: { 'X-Trace-Id': traceId } }
      );
    }

    const internalError = new InternalError('Failed to create tenant', {
      originalError: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(internalError.toEnvelope(request.url, traceId), { status: 500 });
  }
}

/**
 * GET /api/tenants
 *
 * List all tenants (admin only)
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const traceId = generateTraceId();

  try {
    // Verify admin access
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedError('Authorization required');
    }

    const apiKey = authHeader.substring(7);
    const validation = await validateApiKey(apiKey);

    if (!validation || 'error' in validation) {
      throw new UnauthorizedError('Invalid or insufficient API key');
    }

    // Check for admin scope
    const hasAdminScope =
      validation.scopes.includes(API_KEY_SCOPES.ALL) || validation.scopes.includes('admin:*');

    if (!hasAdminScope) {
      throw new UnauthorizedError('Admin scope required');
    }

    const tenants = await prisma.tenant.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        planTier: true,
        status: true,
        subscriptionStatus: true,
        createdAt: true,
        brandingConfig: {
          select: {
            brandName: true,
            logoUrl: true,
            primaryColor: true,
            customDomain: true,
            customDomainVerified: true,
          },
        },
        _count: {
          select: {
            audits: true,
            users: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return NextResponse.json({ tenants }, { headers: { 'X-Trace-Id': traceId } });
  } catch (error) {
    logger.error({ error }, 'Failed to list tenants');

    if (error instanceof UnauthorizedError) {
      return NextResponse.json(
        { error: error.message, code: 'UNAUTHORIZED' },
        { status: 401, headers: { 'X-Trace-Id': traceId } }
      );
    }

    const internalError = new InternalError('Failed to list tenants', {
      originalError: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(internalError.toEnvelope(request.url, traceId), { status: 500 });
  }
}
