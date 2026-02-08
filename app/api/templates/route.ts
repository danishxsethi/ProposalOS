import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/middleware/auth';

/**
 * GET /api/templates
 * List all proposal templates
 */
export const GET = withAuth(async (req: Request) => {
    try {
        const { searchParams } = new URL(req.url);
        const industry = searchParams.get('industry');

        const where = industry ? { industry } : {};

        const templates = await prisma.proposalTemplate.findMany({
            where,
            orderBy: { createdAt: 'desc' },
        });

        return NextResponse.json({ templates });
    } catch (error) {
        console.error('[API] Error fetching templates:', error);
        return NextResponse.json(
            { error: 'Failed to fetch templates' },
            { status: 500 }
        );
    }
});

/**
 * POST /api/templates
 * Create a new template
 */
export const POST = withAuth(async (req: Request) => {
    try {
        const body = await req.json();
        const {
            name,
            description,
            industry,
            assumptions,
            disclaimers,
            nextSteps,
            pricing,
            tierSettings,
        } = body;

        if (!name) {
            return NextResponse.json(
                { error: 'Template name is required' },
                { status: 400 }
            );
        }

        const template = await prisma.proposalTemplate.create({
            data: {
                name,
                description,
                industry,
                assumptions: assumptions || [],
                disclaimers: disclaimers || [],
                nextSteps: nextSteps || [],
                pricing: pricing || {},
                tierSettings: tierSettings || {},
            },
        });

        return NextResponse.json({ template }, { status: 201 });
    } catch (error) {
        console.error('[API] Error creating template:', error);
        return NextResponse.json(
            { error: 'Failed to create template' },
            { status: 500 }
        );
    }
});
