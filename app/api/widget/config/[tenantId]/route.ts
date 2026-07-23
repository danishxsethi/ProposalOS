/**
 * GET /api/widget/config/:tenantId — Get widget configuration for rendering.
 *
 * Requirements: 10.2, 10.4
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function GET(
  _req: Request,
  { params }: { params: { tenantId: string } }
) {
  try {
    const { tenantId } = params;

    if (!tenantId) {
      return NextResponse.json(
        { error: 'tenantId is required' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Look up tenant for branding
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      return NextResponse.json(
        { error: 'Tenant not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    const branding = (tenant.branding as Record<string, unknown>) || {};

    const widgetConfig = {
      tenantId,
      theme: {
        primaryColor: (branding.primaryColor as string) || '#6366f1',
        buttonText: 'Get Free Audit',
        formFields: ['email'],
      },
      behavior: {
        showResultsInline: true,
        captureBeforeResults: true,
      },
    };

    return NextResponse.json(widgetConfig, { headers: corsHeaders });
  } catch (error) {
    console.error('[Widget Config]', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}
