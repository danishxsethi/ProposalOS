import { NextRequest, NextResponse } from 'next/server';
import { mockReportData } from '@/lib/mock-data';
import { apiClient } from '@/lib/api-client';

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ token: string }> }
) {
    const { token } = await params;

    // Try the Proposal Engine backend
    const backendResult = await apiClient.getReport(token);

    if (backendResult) {
        return NextResponse.json(backendResult);
    }

    // Backend unavailable - fall back to mock
    return NextResponse.json({
        ...mockReportData,
        token: token,
        generatedAt: new Date().toISOString()
    });
}