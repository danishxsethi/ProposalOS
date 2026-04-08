import { NextRequest, NextResponse } from 'next/server';

import { apiClient } from '@/lib/api-client';
import { ScanRequest } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const body: ScanRequest = await req.json();
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

    if (audit && audit.id) {
      return NextResponse.json(
        { token: audit.id, status: 'scanning' },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }

    return NextResponse.json(
      { error: 'Audit service temporarily unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('[scan] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
