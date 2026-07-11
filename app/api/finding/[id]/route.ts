import { NextResponse } from 'next/server';

import { excludeFinding, updateFindingFields } from '@/lib/audit/findingPersistence';
import { logger } from '@/lib/logger';
import { withAuth } from '@/lib/middleware/auth';
import { prisma } from '@/lib/prisma';
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
        audit: { tenantId },
      },
      include: { audit: true },
    });

    if (!finding) {
      return NextResponse.json({ error: 'Finding not found' }, { status: 404 });
    }

    return NextResponse.json(finding);
  } catch (error) {
    logger.error('[API] Error fetching finding:', error);
    return NextResponse.json({ error: 'Failed to fetch finding' }, { status: 500 });
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
      where: { id, audit: { tenantId } },
    });

    if (!existingFinding) return NextResponse.json({ error: 'Finding not found' }, { status: 404 });

    const body = await request.json();

    const updateData: import('@/lib/audit/findingPersistence').FindingEditableFields = {};
    if (typeof body.title === 'string') updateData.title = body.title;
    if (typeof body.description === 'string') updateData.description = body.description;
    if (typeof body.impactScore === 'number') updateData.impactScore = body.impactScore;
    if (typeof body.confidenceScore === 'number') updateData.confidenceScore = body.confidenceScore;
    if (typeof body.excluded === 'boolean') updateData.excluded = body.excluded;
    if (['LOW', 'MEDIUM', 'HIGH'].includes(body.effortEstimate)) {
      updateData.effortEstimate = body.effortEstimate;
    }

    // Validate scores (Wave 3: bounds match the canonical Finding contract, 0-10)
    if (updateData.impactScore !== undefined) {
      if (updateData.impactScore < 0 || updateData.impactScore > 10) {
        return NextResponse.json(
          { error: 'impactScore must be between 0 and 10' },
          { status: 400 }
        );
      }
    }

    if (updateData.confidenceScore !== undefined) {
      if (updateData.confidenceScore < 0 || updateData.confidenceScore > 10) {
        return NextResponse.json(
          { error: 'confidenceScore must be between 0 and 10' },
          { status: 400 }
        );
      }
    }

    // Wave 3 (Step 6): routed through the one bounded-update helper in
    // lib/audit/findingPersistence.ts — never touches evidence/module/auditId/tenantId.
    const finding = await updateFindingFields(id, updateData);

    return NextResponse.json(finding);
  } catch (error) {
    logger.error('[API] Error updating finding:', error);
    return NextResponse.json({ error: 'Failed to update finding' }, { status: 500 });
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
      where: { id, audit: { tenantId } },
    });

    if (!existingFinding) return NextResponse.json({ error: 'Finding not found' }, { status: 404 });

    const finding = await excludeFinding(id);

    return NextResponse.json({
      id: finding.id,
      excluded: finding.excluded,
      message: 'Finding excluded from proposals',
    });
  } catch (error) {
    logger.error('[API] Error deleting finding:', error);
    return NextResponse.json({ error: 'Failed to delete finding' }, { status: 500 });
  }
});
