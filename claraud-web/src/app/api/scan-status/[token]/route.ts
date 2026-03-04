import { NextRequest, NextResponse } from 'next/server';
import { mockScanStatus, scanStore } from '@/lib/mock-data';
import { apiClient } from '@/lib/api-client';

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ token: string }> }
) {
    const { token } = await params;

    // Try the Proposal Engine backend
    const backendResult = await apiClient.getScanStatus(token);

    if (backendResult) {
        return NextResponse.json(backendResult);
    }

    // Ensure token is registered (handle direct URL access)
    if (!scanStore.has(token)) {
        scanStore.set(token, { token, url: 'demo-business.com', callCount: 0, createdAt: Date.now() });
    }

    const status = mockScanStatus(token);
    return NextResponse.json(status);
}