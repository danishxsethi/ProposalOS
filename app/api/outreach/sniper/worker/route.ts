import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/middleware/auth';
import { getTenantId } from '@/lib/tenant/context';
import { processSniperOutreach } from '@/lib/outreach/sprint2/sniperWorker';

function toBoundedInt(value: unknown, fallback: number, min: number, max: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
    return Math.max(min, Math.min(max, Math.round(value)));
}

export const GET = withAuth(async () => {
    return NextResponse.json({
        ok: true,
        message: 'Use POST to process sniper outreach emails',
    });
});

export const POST = withAuth(async (req: Request) => {
    const tenantId = await getTenantId();
    if (!tenantId) {
        return NextResponse.json({ error: 'Unauthorized: No Tenant' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const payload = (body && typeof body === 'object') ? body as Record<string, unknown> : {};

    const result = await processSniperOutreach(tenantId, {
        limitLeads: toBoundedInt(payload.limitLeads, 200, 1, 500),
        dryRun: payload.dryRun === true,
    });

    return NextResponse.json({
        success: true,
        ...result,
    });
});

