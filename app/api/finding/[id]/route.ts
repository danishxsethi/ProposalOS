import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/middleware/auth';
import { getTenantId } from '@/lib/tenant/context';

interface Params {
    params: Promise<{ id: string }>;
}

/**
 * GET /api/finding/[id]
 * Get a single finding by ID
 */
export const GET = withAuth(async (request: Request, { params }: Params) => {
    try {
        const { id } = await params;
        const tenantId = await getTenantId();
        if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const finding = await prisma.finding.findFirst({
            where: {
                id,
                audit: { tenantId }
            },
            include: { audit: true },
        });

        if (!finding) {
            return NextResponse.json({ error: 'Finding not found' }, { status: 404 });
        }

        return NextResponse.json(finding);
    } catch (error) {
        console.error('[API] Error fetching finding:', error);
        return NextResponse.json(
            { error: 'Failed to fetch finding' },
            { status: 500 }
        );
    }
});


/**
 * PATCH /api/finding/[id]
 * Edit a finding (score, description, exclude)
 */
export const PATCH = withAuth(async (request: Request, { params }: Params) => {
    try {
        const { id } = await params;
        const tenantId = await getTenantId();
        if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        // Verify ownership
        const existingFinding = await prisma.finding.findFirst({
            where: { id, audit: { tenantId } }
        });

        if (!existingFinding) return NextResponse.json({ error: 'Finding not found' }, { status: 404 });

        const body = await request.json();

        const allowedFields = [
            'title',
            'description',
            'impactScore',
            'confidenceScore',
            'excluded',
            'effortEstimate',
        ];

        const updateData: Record<string, unknown> = {};
        for (const field of allowedFields) {
            if (body[field] !== undefined) {
                updateData[field] = body[field];
            }
        }

        // Validate scores
        if (updateData.impactScore !== undefined) {
            const score = updateData.impactScore as number;
            if (score < 1 || score > 10) {
                return NextResponse.json(
                    { error: 'impactScore must be between 1 and 10' },
                    { status: 400 }
                );
            }
        }

        if (updateData.confidenceScore !== undefined) {
            const score = updateData.confidenceScore as number;
            if (score < 1 || score > 10) {
                return NextResponse.json(
                    { error: 'confidenceScore must be between 1 and 10' },
                    { status: 400 }
                );
            }
        }

        // Mark as manually edited
        updateData.manuallyEdited = true;

        const finding = await prisma.finding.update({
            where: { id },
            data: updateData,
        });

        return NextResponse.json(finding);
    } catch (error) {
        console.error('[API] Error updating finding:', error);
        return NextResponse.json(
            { error: 'Failed to update finding' },
            { status: 500 }
        );
    }
});

/**
 * DELETE /api/finding/[id]
 * Soft delete a finding (mark as excluded)
 */
export const DELETE = withAuth(async (request: Request, { params }: Params) => {
    try {
        const { id } = await params;
        const tenantId = await getTenantId();
        if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        // Verify ownership
        const existingFinding = await prisma.finding.findFirst({
            where: { id, audit: { tenantId } }
        });

        if (!existingFinding) return NextResponse.json({ error: 'Finding not found' }, { status: 404 });

        const finding = await prisma.finding.update({
            where: { id },
            data: { excluded: true, manuallyEdited: true },
        });

        return NextResponse.json({
            id: finding.id,
            excluded: finding.excluded,
            message: 'Finding excluded from proposals',
        });
    } catch (error) {
        console.error('[API] Error deleting finding:', error);
        return NextResponse.json(
            { error: 'Failed to delete finding' },
            { status: 500 }
        );
    }
});
