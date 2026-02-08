
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getTenantId, createScopedPrisma } from '@/lib/tenant/context';
import { withAuth } from '@/lib/middleware/auth';
import { getServerSession } from 'next-auth'; // Assuming next-auth
import { authOptions } from '@/lib/auth'; // Adjust import if needed

// GET: List Schedules
export const GET = withAuth(async (req: Request) => {
    try {
        const tenantId = await getTenantId();
        if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const prismaScoped = createScopedPrisma(tenantId);

        const schedules = await prismaScoped.auditSchedule.findMany({
            orderBy: { createdAt: 'desc' }
        });

        return NextResponse.json(schedules);
    } catch (error) {
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
});

// POST: Create Schedule
export const POST = withAuth(async (req: Request) => {
    try {
        const tenantId = await getTenantId();
        if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json();
        const { businessName, businessCity, businessUrl, industry, frequency } = body;

        if (!businessName || !frequency) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Calculate First Run (Now? or Tomorrow? Let's say Now)
        const nextRunAt = new Date(); // Runs immediately by default or next hour

        const prismaScoped = createScopedPrisma(tenantId);

        const schedule = await prismaScoped.auditSchedule.create({
            data: {
                tenantId,
                businessName,
                businessCity,
                businessUrl,
                industry,
                frequency,
                nextRunAt
            }
        });

        return NextResponse.json(schedule);

    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
});

// DELETE: Remove Schedule (We'll use a dynamic route for specific operations usually, but for simplicity/MVP...)
// Actually better to have /api/schedule/[id]
