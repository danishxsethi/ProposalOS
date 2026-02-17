import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/middleware/auth';
import { getTenantId } from '@/lib/tenant/context';
import { processDiscoveryJobs } from '@/lib/outreach/sprint2/worker';
import { processSniperOutreach } from '@/lib/outreach/sprint2/sniperWorker';

function toPositiveInt(value: unknown, fallback: number, min: number, max: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
    const rounded = Math.round(value);
    return Math.max(min, Math.min(max, rounded));
}

export const GET = withAuth(async () => {
    return NextResponse.json({
        ok: true,
        message: 'Use POST to process queued outreach jobs',
    });
});

export const POST = withAuth(async (req: Request) => {
    const tenantId = await getTenantId();
    if (!tenantId) {
        return NextResponse.json({ error: 'Unauthorized: No Tenant' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const payload = (body && typeof body === 'object') ? body as Record<string, unknown> : {};

    const discoveryResult = await processDiscoveryJobs(tenantId, {
        limitJobs: toPositiveInt(payload.limitJobs, 3, 1, 25),
        leadsPerJob: toPositiveInt(payload.leadsPerJob, 200, 25, 500),
        qualificationLimit: toPositiveInt(payload.qualificationLimit, 200, 10, 500),
        enrichmentLimit: toPositiveInt(payload.enrichmentLimit, 150, 5, 500),
    });

    const runSniper = payload.runSniper === true || payload.runEmails === true;
    const sniperResult = runSniper
        ? await processSniperOutreach(tenantId, {
            limitLeads: toPositiveInt(payload.limitLeads, 200, 1, 500),
            dryRun: payload.dryRun === true,
        })
        : null;

    return NextResponse.json({
        success: true,
        ...discoveryResult,
        sniper: sniperResult,
    });
});
