/**
 * POST /api/widget/submit — Process widget submission and trigger audit.
 * Also handles impression tracking when type === 'impression'.
 *
 * Requirements: 10.2, 10.5
 */

import { NextResponse } from 'next/server';
import { processSubmission, recordImpression } from '@/lib/widget/widgetManager';

// CORS headers for cross-origin widget requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { tenantId, sessionId, type } = body;

    if (!tenantId || !sessionId) {
      return NextResponse.json(
        { error: 'tenantId and sessionId are required' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Impression tracking only
    if (type === 'impression') {
      await recordImpression(tenantId, sessionId, body.referrerUrl);
      return NextResponse.json({ ok: true }, { headers: corsHeaders });
    }

    // Full submission
    if (!body.url) {
      return NextResponse.json(
        { error: 'url is required for audit submission' },
        { status: 400, headers: corsHeaders }
      );
    }

    const result = await processSubmission(tenantId, {
      url: body.url,
      email: body.email,
      phone: body.phone,
      name: body.name,
      referrerUrl: body.referrerUrl,
      sessionId,
      metadata: body.metadata,
    });

    return NextResponse.json(result, { headers: corsHeaders });
  } catch (error) {
    console.error('[Widget Submit]', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}
