import { NextRequest, NextResponse } from 'next/server';

import { apiClient, lastApiError } from '@/lib/api-client';
import { ScanRequest } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    process.stdout.write('[scan route] POST called\n');
    const body: ScanRequest = await req.json();
    process.stdout.write(`[scan route] body: ${JSON.stringify(body)}\n`);
    const { url, businessName, placeId, city, industry } = body;

    // Validate input
    if (!url && !businessName) {
      return NextResponse.json({ error: 'URL or business name is required' }, { status: 400 });
    }

    // Validate URL format if provided
    let formattedUrl = url;
    if (url) {
      try {
        formattedUrl = url.startsWith('http') ? url : `https://${url}`;
        new URL(formattedUrl);
      } catch {
        return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
      }
    }

    // Call the Proposal Engine backend
    const audit = await apiClient.createAudit({
      businessUrl: formattedUrl,
      businessName: businessName || url,
      placeId,
      businessCity: city,
      businessIndustry: industry,
    });
    process.stdout.write(`[scan route] audit result: ${JSON.stringify(audit)}\n`);

    if (audit && (audit.id || audit.auditId)) {
      return NextResponse.json(
        { token: audit.id || audit.auditId, status: 'scanning' },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }

    return NextResponse.json(
      { error: 'Audit service temporarily unavailable', detail: lastApiError },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('[scan] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
