import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { runAuditOrchestrator } from '@/lib/orchestrator';

// Need to handle rate limiting manually or via middleware.
// For now, we'll skip complex IP rate limiting logic code for brevity, 
// but in production, we'd use KV/Redis.

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { businessName, websiteUrl, city, industry } = body;

        if (!businessName || !websiteUrl) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // 1. Create Audit (System Tenant)
        // Ensure 'system' tenant exists or use a default one.
        // We'll upsert a 'system' tenant to be safe.
        const systemTenant = await prisma.tenant.upsert({
            where: { domain: 'proposalengine.com' }, // or id 'system' if uuid
            update: {},
            create: {
                name: 'System / Public Leads',
                domain: 'proposalengine.com',
                planTier: 'agency'
            }
        });

        const audit = await prisma.audit.create({
            data: {
                tenantId: systemTenant.id,
                businessName,
                businessUrl: websiteUrl,
                businessCity: city,
                businessIndustry: industry,
                status: 'QUEUED'
            }
        });

        // 2. Trigger Orchestrator (Fire & Forget)
        // In Vercel, this might be killed if function ends.
        // Ideally use `waitUntil` from `@vercel/functions` or Inngest/Queue.
        // For MVP, we just call it without await, but Node event loop *might* kill it.
        // We'll await it for a microsecond? No.
        // Valid strategy for MVP on "Serverful" or long-timeout functions:
        runAuditOrchestrator(audit.id).catch(e => console.error('Bg audit failed', e));

        return NextResponse.json({ id: audit.id });

    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
