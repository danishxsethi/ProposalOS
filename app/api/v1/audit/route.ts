import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { headers } from 'next/headers';
import { rateLimit } from '@/lib/auth/rateLimit'; // Need to ensure this exists or create it
import { getTenantFromApiKey } from '@/lib/auth/apiKeys'; // Helper we likely need

// Helper to validate API Key
async function validateApiKey(req: Request) {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) return null;
    const key = authHeader.split(' ')[1];
    return await getTenantFromApiKey(key);
}

export async function POST(req: Request) {
    try {
        const tenant = await validateApiKey(req);
        if (!tenant) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        // Rate Limit Check (Placeholder for now, usually Redis or DB based)
        // await rateLimit(tenant.id);

        const body = await req.json();
        const { businessName, businessUrl, city, industry } = body;

        if (!businessName || !businessUrl) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const audit = await prisma.audit.create({
            data: {
                tenantId: tenant.id,
                businessName,
                businessUrl,
                businessCity: city,
                businessIndustry: industry,
                status: 'QUEUED'
            }
        });

        // Trigger Audit Background Job (Mocked here, normally via Queue)
        // In real imp, we'd fire the orchestrator.
        import('@/lib/orchestrator').then(mod => {
            mod.runAuditOrchestrator(audit.id).catch(console.error);
        });

        return NextResponse.json({
            id: audit.id,
            status: audit.status,
            createdAt: audit.createdAt
        }, { status: 201 });

    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
