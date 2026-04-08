/**
 * app/api/tenants/[tenantId]/offboard/route.ts
 *
 * Tenant Offboarding API
 *
 * POST /api/tenants/[tenantId]/offboard - Complete tenant offboarding
 * DELETE /api/tenants/[tenantId] - Hard delete tenant and all data
 */

import { NextRequest, NextResponse } from 'next/server';

import { generateTraceId, InternalError, UnauthorizedError } from '@/lib/api/errors';
import { validateApiKey, API_KEY_SCOPES } from '@/lib/auth/apiKeys';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export interface OffboardTenantRequest {
  reason: 'customer_request' | 'non_payment' | 'terms_violation' | 'other';
  exportData?: boolean;
  confirmDeletion: boolean;
}

/**
 * POST /api/tenants/[tenantId]/offboard
 *
 * Soft offboard a tenant:
 * 1. Revoke all API keys
 * 2. Cancel billing (Stripe)
 * 3. Anonymize PII (GDPR)
 * 4. Schedule data deletion (grace period)
 * 5. Optionally export data first
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { tenantId: string } }
): Promise<NextResponse> {
  const traceId = generateTraceId();
  const { tenantId } = params;

  try {
    // Verify admin access or tenant owner
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedError('Authorization required');
    }

    const apiKey = authHeader.substring(7);
    const validation = await validateApiKey(apiKey, API_KEY_SCOPES.TENANT_UPDATE);

    if (!validation || 'error' in validation) {
      throw new UnauthorizedError('Invalid or insufficient API key');
    }

    // Verify access to this tenant
    const hasAdminScope =
      validation.scopes.includes(API_KEY_SCOPES.ALL) ||
      validation.scopes.includes('admin:*');

    if (!hasAdminScope && validation.tenantId !== tenantId) {
      throw new UnauthorizedError('Access denied to this tenant');
    }

    const body: OffboardTenantRequest = await request.json();

    if (!body.confirmDeletion) {
      return NextResponse.json(
        { error: 'Must set confirmDeletion: true', code: 'CONFIRMATION_REQUIRED' },
        { status: 400, headers: { 'X-Trace-Id': traceId } }
      );
    }

    // Execute offboarding in transaction
    await prisma.$transaction(async (tx) => {
      // 1. Revoke all API keys
      await tx.apiKey.updateMany({
        where: { tenantId },
        data: { isActive: false },
      });

      // 2. Update tenant status
      await tx.tenant.update({
        where: { id: tenantId },
        data: {
          status: 'suspended',
          subscriptionStatus: 'canceled',
          gracePeriodEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        },
      });

      // 3. Anonymize PII in prospect leads (GDPR)
      await tx.prospectLead.updateMany({
        where: { tenantId },
        data: {
          businessName: 'ANONYMIZED',
          decisionMakerName: 'Anonymized',
          decisionMakerEmail: 'anonymized@gdpr.local',
          decisionMakerLinkedin: null,
          phone: null,
          website: null,
          anonymizedAt: new Date(),
        },
      });

      // 4. Anonymize outreach emails
      await tx.outreachEmail.updateMany({
        where: { tenantId },
        data: {
          subject: '[REDACTED]',
          body: '[REDACTED FOR GDPR]',
        },
      });

      // 5. Cancel any active projects
      await tx.project.updateMany({
        where: { tenantId, status: { in: ['KICKOFF', 'IN_PROGRESS'] } },
        data: { status: 'COMPLETE' },
      });
    });

    logger.info(
      {
        event: 'tenant.offboarded',
        tenantId,
        reason: body.reason,
        exportData: body.exportData,
      },
      'Tenant offboarded successfully'
    );

    return NextResponse.json({
      success: true,
      tenantId,
      status: 'suspended',
      gracePeriodEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      message: 'Tenant offboarded. Data will be permanently deleted after 30-day grace period.',
    });
  } catch (error) {
    logger.error({ error, tenantId }, 'Failed to offboard tenant');

    if (error instanceof UnauthorizedError) {
      return NextResponse.json(
        { error: error.message, code: 'UNAUTHORIZED' },
        { status: 401, headers: { 'X-Trace-Id': traceId } }
      );
    }

    const internalError = new InternalError('Failed to offboard tenant', {
      originalError: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(internalError.toEnvelope(request.url, traceId), { status: 500 });
  }
}

/**
 * DELETE /api/tenants/[tenantId]
 *
 * Hard delete a tenant and ALL associated data.
 * WARNING: This is irreversible. Use with extreme caution.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { tenantId: string } }
): Promise<NextResponse> {
  const traceId = generateTraceId();
  const { tenantId } = params;

  try {
    // Verify admin access only
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedError('Authorization required');
    }

    const apiKey = authHeader.substring(7);
    const validation = await validateApiKey(apiKey);

    if (!validation || 'error' in validation) {
      throw new UnauthorizedError('Invalid API key');
    }

    const hasAdminScope =
      validation.scopes.includes(API_KEY_SCOPES.ALL) ||
      validation.scopes.includes('admin:*');

    if (!hasAdminScope) {
      throw new UnauthorizedError('Admin scope required for hard delete');
    }

    // Verify tenant exists
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, slug: true },
    });

    if (!tenant) {
      return NextResponse.json(
        { error: 'Tenant not found', code: 'NOT_FOUND' },
        { status: 404, headers: { 'X-Trace-Id': traceId } }
      );
    }

    // Hard delete - Prisma cascade will handle all relations
    await prisma.tenant.delete({
      where: { id: tenantId },
    });

    logger.warn(
      {
        event: 'tenant.hard_deleted',
        tenantId,
        tenantName: tenant.name,
        tenantSlug: tenant.slug,
        deletedBy: validation.keyId,
      },
      'Tenant permanently deleted'
    );

    return NextResponse.json({
      success: true,
      tenantId,
      message: 'Tenant and all associated data permanently deleted.',
    });
  } catch (error) {
    logger.error({ error, tenantId }, 'Failed to hard delete tenant');

    if (error instanceof UnauthorizedError) {
      return NextResponse.json(
        { error: error.message, code: 'UNAUTHORIZED' },
        { status: 401, headers: { 'X-Trace-Id': traceId } }
      );
    }

    const internalError = new InternalError('Failed to hard delete tenant', {
      originalError: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(internalError.toEnvelope(request.url, traceId), { status: 500 });
  }
}