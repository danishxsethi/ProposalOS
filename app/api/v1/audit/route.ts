import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withRateLimit } from '@/lib/middleware/rateLimit';
// P0-3: Use runner (Single source of truth)
import { runAudit } from '@/lib/audit/runner';
import { CostTracker } from '@/lib/costs/costTracker';

/**
 * API v1 - Create Audit (with rate limiting)
 * 
 * Rate limit headers returned:
 * - X-RateLimit-Limit: Max requests per day
 * - X-RateLimit-Remaining: Requests remaining
 * - X-RateLimit-Used: Requests used today
 * - X-RateLimit-Reset: When the limit resets (ISO timestamp)
 * 
 * Rate limit exceeded response (429):
 * - Retry-After: Seconds until reset
 */
async function handlePOST(req: Request) {
    try {
        const body = await req.json();
        const { businessName, businessUrl, city, industry } = body;

        if (!businessName || !businessUrl) {
            return NextResponse.json(
                { error: 'Missing required fields: businessName and businessUrl are required' },
                { status: 400 }
            );
        }

        // Note: tenantId is extracted from API key by withRateLimit middleware
        // We need to pass it through context or extract it again
        const authHeader = req.headers.get('authorization')!;
        const apiKey = authHeader.split(' ')[1];
        const { getTenantFromApiKey } = await import('@/lib/auth/apiKeys');
        const tenant = await getTenantFromApiKey(apiKey);

        if (!tenant) {
            return NextResponse.json({ error: 'Invalid tenant' }, { status: 401 });
        }

        // Create audit record
        const audit = await prisma.audit.create({
            data: {
                tenantId: tenant.id,
                businessName,
                businessUrl,
                businessCity: city,
                businessIndustry: industry || 'Generic',
                status: 'RUNNING',
                startedAt: new Date(),
                apiCostCents: 0
            }
        });

        // Trigger audit runner asynchronously (P0-3 redirect)
        runAudit(audit.id).catch(async (error) => {
            console.error('Audit runner failed:', error);
        });

        return NextResponse.json({
            id: audit.id,
            status: audit.status,
            createdAt: audit.createdAt,
            message: 'Audit created and processing started'
        }, { status: 201 });

    } catch (error) {
        console.error('API v1 audit error:', error);
        return NextResponse.json(
            { error: 'Internal Server Error', message: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

// Export with rate limit middleware
export const POST = withRateLimit(handlePOST);
