#!/usr/bin/env npx tsx
import * as dotenv from 'dotenv';
import * as path from 'path';
import { prisma } from '../lib/prisma';
import { DEFAULT_SPRINT2_VERTICALS, normalizeVertical, TOP_50_US_METROS } from '../lib/outreach/sprint2/config';
import { enqueueDiscoveryJobs } from '../lib/outreach/sprint2/worker';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config({ path: path.join(process.cwd(), '.env') });

function parseArgs() {
    const args = process.argv.slice(2);
    const read = (name: string): string | undefined => {
        const prefixed = args.find((arg) => arg.startsWith(`--${name}=`));
        if (prefixed) return prefixed.split('=').slice(1).join('=');
        const index = args.indexOf(`--${name}`);
        if (index >= 0 && index + 1 < args.length) return args[index + 1];
        return undefined;
    };

    const verticalsRaw = read('verticals');
    const verticals = verticalsRaw
        ? verticalsRaw.split(',').map((v) => normalizeVertical(v)).filter(Boolean)
        : [...DEFAULT_SPRINT2_VERTICALS];

    const painThreshold = Number(read('pain-threshold') || 60);
    const targetLeads = Number(read('target-leads') || 200);

    return {
        tenantId: read('tenant-id'),
        verticals,
        painThreshold: Number.isFinite(painThreshold) ? painThreshold : 60,
        targetLeads: Number.isFinite(targetLeads) ? targetLeads : 200,
    };
}

async function resolveTenantId(explicitTenantId?: string): Promise<string> {
    if (explicitTenantId) return explicitTenantId;
    if (process.env.DEFAULT_TENANT_ID) return process.env.DEFAULT_TENANT_ID;

    const tenant = await prisma.tenant.findFirst({
        where: { isActive: true },
        select: { id: true, name: true },
    });
    if (!tenant) {
        throw new Error('No active tenant found. Set --tenant-id or DEFAULT_TENANT_ID');
    }
    return tenant.id;
}

async function main() {
    const args = parseArgs();
    const tenantId = await resolveTenantId(args.tenantId);

    const result = await enqueueDiscoveryJobs({
        tenantId,
        cities: [...TOP_50_US_METROS],
        verticals: args.verticals,
        painThreshold: args.painThreshold,
        targetLeads: args.targetLeads,
    });

    console.log('Sprint 2 queue seeded');
    console.log(`Tenant: ${tenantId}`);
    console.log(`Cities: ${TOP_50_US_METROS.length}`);
    console.log(`Verticals: ${args.verticals.join(', ')}`);
    console.log(`Created jobs: ${result.created.length}`);
    console.log(`Skipped existing jobs: ${result.skipped.length}`);
}

main()
    .catch((error) => {
        console.error('Failed to seed Sprint 2 jobs:', error instanceof Error ? error.message : error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
