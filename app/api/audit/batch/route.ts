import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { processBatch } from '@/lib/audit/batchProcessor';
import { logger } from '@/lib/logger';
import { v4 as uuidv4 } from 'uuid';
import { withAuth } from '@/lib/middleware/auth';
import { getTenantId, runWithTenantAsync } from '@/lib/tenant/context';

export const POST = withAuth(async (req: Request) => {
    try {
        const tenantId = await getTenantId();
        if (!tenantId) {
            return NextResponse.json({ error: 'Unauthorized: No Tenant' }, { status: 401 });
        }

        const body = await req.json();
        const { businesses } = body;

        if (!Array.isArray(businesses) || businesses.length === 0) {
            return NextResponse.json(
                { error: 'Input must be an array of businesses' },
                { status: 400 }
            );
        }

        if (businesses.length > 10) {
            return NextResponse.json(
                { error: 'Batch size limited to 10 businesses' },
                { status: 400 }
            );
        }

        const batchId = uuidv4();
        const auditIds: string[] = [];
        // P1-3 Fix: collect per-item errors instead of aborting the whole loop
        const creationErrors: Array<{ item: unknown; error: string }> = [];

        // Create all Audit records immediately (tenant-scoped)
        for (const business of businesses) {
            // Basic validation
            if (!business.name || !business.city) {
                if (!business.url) continue; // Skip invalid
            }

            try {
                const audit = await prisma.audit.create({
                    data: {
                        tenantId,
                        businessName: business.name || 'Unknown',
                        businessCity: business.city,
                        businessUrl: business.url,
                        businessIndustry: business.industry ?? null,
                        status: 'QUEUED',
                        batchId: batchId,
                    }
                });
                auditIds.push(audit.id);
            } catch (err) {
                // Per-item isolation: one bad record doesn't abort the batch
                const msg = err instanceof Error ? err.message : String(err);
                logger.error({ batchId, business, error: msg }, 'Failed to create audit record in batch');
                creationErrors.push({ item: business, error: msg });
            }
        }

        if (auditIds.length === 0) {
            return NextResponse.json(
                { error: 'No valid audit records could be created', details: creationErrors },
                { status: 422 }
            );
        }

        logger.info({
            event: 'batch.created',
            batchId,
            count: auditIds.length,
            errorCount: creationErrors.length,
        }, 'Batch audit created');

        // P1-3 Fix: wrap processBatch in runWithTenantAsync so that any calls to
        // getTenantId() / createScopedPrisma() inside the batch processor receive
        // the correct tenant context instead of null.
        runWithTenantAsync(tenantId, () => processBatch(batchId, auditIds)).catch(err => {
            logger.error({ batchId, error: err }, 'Batch processing crashed');
        });

        return NextResponse.json({
            success: true,
            batchId,
            auditIds,
            ...(creationErrors.length > 0 && { partialErrors: creationErrors }),
            message: 'Batch started. Poll status at /api/audit/batch/[batchId]'
        });

    } catch (error) {
        logger.error({ error }, 'Error creating batch');
        return NextResponse.json(
            { error: 'Internal Server Error', details: String(error) },
            { status: 500 }
        );
    }
});
