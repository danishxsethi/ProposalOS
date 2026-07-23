import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/middleware/auth';

interface Params {
    params: { id: string };
}

/**
 * GET /api/templates/[id]
 * Get a single template
 */
export const GET = withAuth(async (req: Request, { params }: Params) => {
    try {
        const { id } = await params;

        const template = await prisma.proposalTemplate.findUnique({
            where: { id },
        });

        if (!template) {
            return NextResponse.json(
                { error: 'Template not found' },
                { status: 404 }
            );
        }

        return NextResponse.json({ template });
    } catch (error) {
        console.error('[API] Error fetching template:', error);
        return NextResponse.json(
            { error: 'Failed to fetch template' },
            { status: 500 }
        );
    }
});

/**
 * DELETE /api/templates/[id]
 * Delete a template
 */
export const DELETE = withAuth(async (req: Request, { params }: Params) => {
    try {
        const { id } = await params;

        await prisma.proposalTemplate.delete({
            where: { id },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[API] Error deleting template:', error);
        return NextResponse.json(
            { error: 'Failed to delete template' },
            { status: 500 }
        );
    }
});
