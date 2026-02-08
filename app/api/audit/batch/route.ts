
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { processBatch } from '@/lib/audit/batchProcessor';
import { logger } from '@/lib/logger';
import { v4 as uuidv4 } from 'uuid';
import { withAuth } from '@/lib/middleware/auth';
import type { NextRequest } from 'next/server';
// import { waitUntil } from '@vercel/functions'; // Assuming this might be available or we use workaround

// Helper to determine if we can use waitUntil (Next.js 15 has unstable_after, Vercel has waitUntil)
// For generic Next.js 14 on Cloud Run, we simply don't await the promise.
// Note: On Cloud Run, this requires "CPU always allocated" for reliability, or we accept risk.
// For MVP, user explicitly said: "Use a simple approach: respond immediately, then process via fetch() to self" OR "waitUntil"
// Since we are inside the same process, calling the function without await is the simplest "background" task.
// To make it slightly more robust, we can use a detached promise structure.

export const POST = withAuth(async (req: Request) => {
    try {
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

        // Create all Audit records immediately
        for (const business of businesses) {
            // Basic validation
            if (!business.name || !business.city) {
                if (!business.url) continue; // Skip invalid
            }

            const audit = await prisma.audit.create({
                data: {
                    businessName: business.name || 'Unknown',
                    businessCity: business.city,
                    businessUrl: business.url,
                    businessIndustry: business.industry, // If provided
                    status: 'QUEUED',
                    batchId: batchId
                }
            });
            auditIds.push(audit.id);
        }

        logger.info({
            event: 'batch.created',
            batchId,
            count: auditIds.length
        }, 'Batch audit created');

        // Trigger background processing
        // We do NOT await this.
        const processingPromise = processBatch(batchId, auditIds).catch(err => {
            logger.error({ batchId, error: err }, 'Batch processing crashed');
        });

        // If we are on Vercel or have access to waitUntil, we should use it.
        // req is standard Request, not NextRequest in some contexts but let's try casting or checking context.
        // Next.js 13/14 doesn't expose waitUntil on Request uniformly yet without @vercel/functions or edge.
        // We will just let the promise float. 

        return NextResponse.json({
            success: true,
            batchId,
            auditIds,
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
