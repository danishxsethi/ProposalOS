import { NextRequest, NextResponse } from 'next/server';
import { mockScanStatus } from '@/lib/mock-data';
import { apiClient } from '@/lib/api-client';
import { scanStore } from '@/lib/stores';
import { ScanStatus } from '@/lib/types';

// Map backend modules to frontend categories
const moduleMapping: Record<string, string[]> = {
    'website': ['website', 'seo'],
    'gbp': ['google', 'reviews'],
    'competitor': ['social', 'competitors'],
};

function mapAuditToScanStatus(audit: any): ScanStatus {
    const completedModules = audit.modulesCompleted || [];
    const failedModules = audit.modulesFailed || [];
    const allModules = ['website', 'google', 'seo', 'reviews', 'social', 'competitors'];

    const modules = allModules.map(categoryId => {
        // Find which backend module maps to this category
        const backendModule = Object.entries(moduleMapping).find(([_, cats]) => cats.includes(categoryId))?.[0];

        let status: 'pending' | 'scanning' | 'complete' | 'error' = 'pending';
        let score: number | undefined;
        let findingsCount: number | undefined;

        if (backendModule) {
            if (completedModules.includes(backendModule)) {
                status = 'complete';
                // Calculate score from findings for this backend module
                const moduleFindings = (audit.findings || []).filter((f: any) => f.module === backendModule);
                findingsCount = moduleFindings.length;
                // Average impact score, scaled to 10 (inverted: high impact = low score)
                if (moduleFindings.length > 0) {
                    const avgImpact = moduleFindings.reduce((sum: number, f: any) => sum + f.impactScore, 0) / moduleFindings.length;
                    score = Math.round((10 - avgImpact) * 10) / 10;
                }
            } else if (failedModules.includes(backendModule)) {
                status = 'error';
            } else if (audit.status === 'RUNNING' || audit.status === 'QUEUED') {
                // If audit is running and this module isn't done, it's scanning
                status = 'scanning';
            }
        }

        return { id: categoryId, status, score, findingsCount };
    });

    const isComplete = audit.status === 'COMPLETE' || audit.status === 'PARTIAL';
    const overallScore = audit.overallScore ? Math.round(audit.overallScore / 10 * 10) / 10 : undefined;

    // Calculate progress percentage
    const completedCount = modules.filter(m => m.status === 'complete' || m.status === 'error').length;
    const progress = Math.round((completedCount / modules.length) * 100);

    return {
        token: audit.id,
        status: isComplete ? 'complete' : audit.status === 'FAILED' ? 'error' : 'scanning',
        modules,
        overallScore,
        progress,
    };
}

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ token: string }> }
) {
    const { token } = await params;

    // Try the Proposal Engine backend
    const audit = await apiClient.getAudit(token);

    if (audit) {
        const scanStatus = mapAuditToScanStatus(audit);

        // If audit just completed, trigger diagnosis + proposal generation in background
        if ((audit.status === 'COMPLETE' || audit.status === 'PARTIAL') && (!audit.proposals || audit.proposals.length === 0)) {
            // Fire and forget - don't block the response
            apiClient.runDiagnosis(token).then(() => {
                return apiClient.generateProposal(token);
            }).catch(err => {
                console.error('[Auto-pipeline] Failed to trigger diagnosis/proposal:', err);
            });
        }

        return NextResponse.json(scanStatus, {
            headers: { 'Cache-Control': 'no-store' },
        });
    }

    // Backend unavailable - fall back to mock
    // Check if token exists in mock store, return 404 if not
    if (!scanStore.has(token)) {
        return NextResponse.json({ error: 'Scan not found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    }

    const status = mockScanStatus(token);
    return NextResponse.json(status, {
        headers: { 'Cache-Control': 'no-store' },
    });
}