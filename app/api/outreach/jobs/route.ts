import { NextResponse } from 'next/server';
import { Prisma, ProspectDiscoveryJobStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/middleware/auth';
import { getTenantId } from '@/lib/tenant/context';
import { DEFAULT_SPRINT2_VERTICALS, normalizeVertical, TOP_50_US_METROS } from '@/lib/outreach/sprint2/config';
import { enqueueDiscoveryJobs } from '@/lib/outreach/sprint2/worker';

function parseCities(body: Record<string, unknown>): Array<{ city: string; state?: string | null; metro?: string | null }> {
    if (Array.isArray(body.cities)) {
        const cities: Array<{ city: string; state?: string | null; metro?: string | null }> = [];
        for (const row of body.cities) {
            if (!row || typeof row !== 'object') continue;
            const candidate = row as Record<string, unknown>;
            const city = typeof candidate.city === 'string' ? candidate.city.trim() : '';
            if (!city) continue;
            const state = typeof candidate.state === 'string' ? candidate.state.trim() : null;
            const metro = typeof candidate.metro === 'string' ? candidate.metro.trim() : null;
            cities.push({ city, state, metro });
        }
        return cities;
    }

    const singleCity = typeof body.city === 'string' ? body.city.trim() : '';
    if (!singleCity) return [];

    return [{
        city: singleCity,
        state: typeof body.state === 'string' ? body.state.trim() : null,
        metro: typeof body.metro === 'string' ? body.metro.trim() : null,
    }];
}

function parseVerticals(body: Record<string, unknown>): string[] {
    if (Array.isArray(body.verticals) && body.verticals.length > 0) {
        return body.verticals
            .filter((value): value is string => typeof value === 'string')
            .map((value) => normalizeVertical(value))
            .filter(Boolean);
    }

    if (typeof body.vertical === 'string' && body.vertical.trim().length > 0) {
        return [normalizeVertical(body.vertical)];
    }

    return [...DEFAULT_SPRINT2_VERTICALS];
}

export const GET = withAuth(async (req: Request) => {
    const tenantId = await getTenantId();
    if (!tenantId) {
        return NextResponse.json({ error: 'Unauthorized: No Tenant' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const city = searchParams.get('city');
    const vertical = searchParams.get('vertical');
    const limit = Math.max(1, Math.min(200, Number(searchParams.get('limit') || 50)));

    const where: Prisma.ProspectDiscoveryJobWhereInput = { tenantId };
    if (status) {
        const allowed = new Set(Object.values(ProspectDiscoveryJobStatus));
        if (allowed.has(status as ProspectDiscoveryJobStatus)) {
            where.status = status as ProspectDiscoveryJobStatus;
        }
    }
    if (city) where.city = city;
    if (vertical) where.vertical = normalizeVertical(vertical);

    const jobs = await prisma.prospectDiscoveryJob.findMany({
        where,
        take: limit,
        orderBy: [{ createdAt: 'desc' }],
    });

    return NextResponse.json({
        jobs,
        count: jobs.length,
    });
});

export const POST = withAuth(async (req: Request) => {
    const tenantId = await getTenantId();
    if (!tenantId) {
        return NextResponse.json({ error: 'Unauthorized: No Tenant' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const payload = (body && typeof body === 'object') ? body as Record<string, unknown> : {};

    const seedTop50 = payload.seedTop50 === true;
    const cities = seedTop50 ? [...TOP_50_US_METROS] : parseCities(payload);
    const verticals = parseVerticals(payload);

    if (cities.length === 0) {
        return NextResponse.json(
            { error: 'At least one city is required, or set seedTop50=true' },
            { status: 400 },
        );
    }
    if (verticals.length === 0) {
        return NextResponse.json(
            { error: 'At least one vertical is required' },
            { status: 400 },
        );
    }

    const painThreshold = typeof payload.painThreshold === 'number' ? payload.painThreshold : undefined;
    const targetLeads = typeof payload.targetLeads === 'number' ? payload.targetLeads : undefined;
    const sourceConfig = payload.sourceConfig && typeof payload.sourceConfig === 'object'
        ? payload.sourceConfig as Record<string, unknown>
        : undefined;

    const result = await enqueueDiscoveryJobs({
        tenantId,
        cities,
        verticals,
        painThreshold,
        targetLeads,
        sourceConfig: sourceConfig
            ? {
                googlePlaces: sourceConfig.googlePlaces === undefined ? undefined : Boolean(sourceConfig.googlePlaces),
                yelp: sourceConfig.yelp === undefined ? undefined : Boolean(sourceConfig.yelp),
                directories: sourceConfig.directories === undefined ? undefined : Boolean(sourceConfig.directories),
            }
            : undefined,
    });

    return NextResponse.json({
        success: true,
        createdCount: result.created.length,
        skippedCount: result.skipped.length,
        createdJobIds: result.created,
        skipped: result.skipped.slice(0, 25),
    });
});
