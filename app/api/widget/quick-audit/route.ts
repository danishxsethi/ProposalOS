import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { crawlWebsite } from '@/lib/modules/websiteCrawler';
import { runGBPModule } from '@/lib/modules/gbp';

// Lightweight audit for widget
export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { businessName, websiteUrl, tenantId } = body;

        if (!businessName || !websiteUrl || !tenantId) {
            return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
        }

        // Verify Tenant Exists
        const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
        if (!tenant) {
            return NextResponse.json({ error: 'Invalid Tenant' }, { status: 400 });
        }

        // Create Audit Record (Leads)
        const audit = await prisma.audit.create({
            data: {
                tenantId: tenant.id,
                businessName,
                businessUrl: websiteUrl,
                status: 'QUEUED',
            }
        });

        // Run Fast Modules in Parallel
        const [crawlRes, gbpRes] = await Promise.all([
            crawlWebsite({ url: websiteUrl, businessName }),
            runGBPModule({ businessName, city: 'Unknown' })
        ]);

        // Calculate rudimentary score (crawlRes = CrawlResult, gbpRes = legacy { status, data })
        let score = 50; // Base
        // Crawl succeeded if we got a result (throws on error)
        score += 10;
        const gbpVal = gbpRes as { status?: string; data?: { reviews?: unknown[] } };
        if (gbpVal.status === 'failed') score -= 10;
        else score += 20;

        // Cap at 100
        score = Math.min(score, 90); // Don't give 100 on quick audit

        // Extract a "Top Issue" for the teaser (GBP returns data, not findings)
        const topIssue = 'Website optimization needed';

        return NextResponse.json({
            auditId: audit.id,
            score,
            grade: score > 80 ? 'B' : score > 60 ? 'C' : 'D',
            topIssue,
            redirectUrl: `/proposal/preview/${audit.id}` // Or similar
        });

    } catch (error) {
        console.error('Quick Audit Error', error);
        return NextResponse.json({ error: 'Failed' }, { status: 500 });
    }
}

// Enable CORS for this route since it's called from external sites
export async function OPTIONS(request: Request) {
    return new NextResponse(null, {
        status: 200,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
    });
}
