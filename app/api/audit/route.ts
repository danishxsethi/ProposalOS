import { NextResponse } from 'next/server';
import { runAudit } from '@/lib/audit/runner';
import { extractBusinessFromUrl } from '@/lib/utils/urlExtractor';
import { logger, logError } from '@/lib/logger';
import { Metrics } from '@/lib/metrics';

import { withAuth } from '@/lib/middleware/auth';
import { getTenantId, createScopedPrisma } from '@/lib/tenant/context';
import { checkAuditLimit } from '@/lib/billing/limits';

import { z } from 'zod';

const auditSchema = z.object({
    url: z.string().url(),
    industry: z.string().optional(),
}).passthrough();

/**
 * POST /api/audit
 * Create and run a single audit. Uses lib/audit/runner.ts as the canonical execution path.
 * Modules: website, gbp, competitor, reputation, social (5 total per spec).
 */
export const POST = withAuth(async (req: Request) => {
    try {
        const tenantId = await getTenantId();
        if (!tenantId) {
            return NextResponse.json({ error: 'Unauthorized: No Tenant' }, { status: 401 });
        }

        const prisma = createScopedPrisma(tenantId);

        // Parse Body
        const body = await req.json();
        let validatedData;
        try {
            validatedData = auditSchema.parse(body);
        } catch (e) {
            if (e instanceof z.ZodError) {
                return NextResponse.json({ error: 'Invalid input', details: e.errors }, { status: 400 });
            }
            throw e;
        }

        let { url, industry, name, city } = validatedData as { url?: string; industry?: string; name?: string; city?: string };

        // Check Usage Limits
        const limits = await checkAuditLimit();
        if (!limits.allowed) {
            return NextResponse.json(
                { error: 'Plan Limit Exceeded', details: limits.reason, upgrade: true },
                { status: 429 }
            );
        }

        // If URL provided without name, extract business info from URL
        if (url && !name) {
            const extracted = await extractBusinessFromUrl(url);
            name = extracted.name;
            url = extracted.url;
        }

        // Create Audit record (runner will execute modules)
        const audit = await prisma.audit.create({
            data: {
                tenantId,
                businessName: name || 'Pending...',
                businessCity: city ?? null,
                businessUrl: url ?? null,
                businessIndustry: industry || 'Generic',
                status: 'QUEUED',
                apiCostCents: 0,
            },
        });

        Metrics.increment('audits_total');

        logger.info({
            event: 'audit.start',
            auditId: audit.id,
            businessName: name,
            city,
            url,
            tenantId
        }, 'Starting audit');

        // Run audit via canonical runner (single source of truth)
        const result = await runAudit(audit.id);

        return NextResponse.json({
            success: true,
            auditId: result.auditId,
            status: result.status,
            modulesCompleted: result.modulesCompleted,
            modulesFailed: result.modulesFailed?.length ? result.modulesFailed : undefined,
            findingsCount: result.findingsCount,
            apiCostCents: result.costCents,
            duration_ms: result.duration_ms,
            costUSD: (result.costCents / 100).toFixed(2),
        });

    } catch (error) {
        logError('Error running audit', error);
        Metrics.increment('audits_failed');
        return NextResponse.json(
            { error: 'Internal Server Error', details: String(error) },
            { status: 500 }
        );
    }
});
