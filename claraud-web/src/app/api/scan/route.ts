import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { scanStore } from '@/lib/stores';
import { apiClient } from '@/lib/api-client';
import { ScanRequest } from '@/lib/types';

export async function POST(req: NextRequest) {
    try {
        const body: ScanRequest = await req.json();
        const { url, businessName, city, industry } = body;

        // Validate input
        if (!url && !businessName) {
            return NextResponse.json({ error: 'URL or business name is required' }, { status: 400 });
        }

        // Validate URL format if provided
        if (url) {
            try {
                const u = url.startsWith('http') ? url : `https://${url}`;
                new URL(u);
            } catch {
                return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
            }
        }

        const token = crypto.randomUUID();

        // Store scan in memory
        scanStore.set(token, {
            token,
            url: url || businessName || '',
            businessName,
            callCount: 0,
            createdAt: Date.now(),
        });

        // Try calling the Proposal Engine backend
        const result = await apiClient.startScan({ url, businessName, city, industry });

        if (result) {
            // Backend returned a token
            return NextResponse.json(
                { token: result.token, status: 'scanning' },
                { headers: { 'Cache-Control': 'no-store' } }
            );
        }

        // Backend unavailable - fall back to mock
        console.log('[scan] Proposal Engine unreachable, using mock data');
        return NextResponse.json(
            { token, status: 'scanning' },
            { headers: { 'Cache-Control': 'no-store' } }
        );
    } catch (err) {
        console.error('[scan] Error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}