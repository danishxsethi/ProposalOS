
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getTenantId, createScopedPrisma } from '@/lib/tenant/context';
import { withAuth } from '@/lib/middleware/auth';

// GET: List Templates
export const GET = withAuth(async (req: Request) => {
    try {
        const tenantId = await getTenantId();
        if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const prismaScoped = createScopedPrisma(tenantId);

        const templates = await prismaScoped.proposalTemplate.findMany({
            orderBy: { createdAt: 'desc' }
        });

        return NextResponse.json(templates);
    } catch (error) {
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
});

// POST: Create Template
export const POST = withAuth(async (req: Request) => {
    try {
        const tenantId = await getTenantId();
        if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json();

        const prismaScoped = createScopedPrisma(tenantId);

        const template = await prismaScoped.proposalTemplate.create({
            data: {
                tenantId,
                name: body.name || 'Untitled Template',
                description: body.description,
                introText: body.introText,
                outroText: body.outroText,
                headerHtml: body.headerHtml,
                ctaText: body.ctaText,
                ctaUrl: body.ctaUrl,
                showFindings: body.showFindings ?? true,
                showCompetitorMatrix: body.showCompetitorMatrix ?? true,
                showRoi: body.showRoi ?? true,
                customCss: body.customCss,
                isDefault: body.isDefault || false,
                // defaults for arrays
                assumptions: body.assumptions || [],
                disclaimers: body.disclaimers || [],
                nextSteps: body.nextSteps || []
            }
        });

        // If isDefault, uncheck others?
        // Logic for single default per tenant might be needed.
        if (body.isDefault) {
            await prismaScoped.proposalTemplate.updateMany({
                where: {
                    id: { not: template.id },
                    isDefault: true
                },
                data: { isDefault: false }
            });
        }

        return NextResponse.json(template);

    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
});
