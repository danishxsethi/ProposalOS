import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { scanStore } from '@/lib/stores';
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

        // Try calling the Proposal Engine backend
        const audit = await apiClient.createAudit({
            businessUrl: formattedUrl,
            businessName: businessName || url,
            placeId,
            businessCity: city,
            businessIndustry: industry,
        });

        if (audit && audit.id) {
            // Backend returned an audit object - use its id as the token
            return NextResponse.json(
                { token: audit.id, status: 'scanning', source: 'live' },
                { headers: { 'Cache-Control': 'no-store' } }
            );
        }

        // Backend unavailable - fall back to mock
        console.log('[scan] Proposal Engine unreachable, using mock data');
        const mockToken = crypto.randomUUID();
        scanStore.set(mockToken, {
            token: mockToken,
            url: url || businessName || '',
            businessName,
            callCount: 0,
            createdAt: Date.now(),
        });
        return NextResponse.json(
            { token: mockToken, status: 'scanning', source: 'mock' },
            { headers: { 'Cache-Control': 'no-store' } }
        );
    } catch (err) {
        console.error('[scan] Error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}