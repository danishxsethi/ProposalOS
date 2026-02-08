import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface Params {
    params: { token: string };
}

/**
 * POST /api/public/audit
 * Public endpoint for pay-per-audit API
 * Requires API key in header
 */
export async function POST(req: Request) {
    try {
        // Check API key
        const apiKey = req.headers.get('x-api-key');
        if (!apiKey || apiKey !== process.env.API_KEY) {
            return NextResponse.json(
                { error: 'Invalid API key' },
                { status: 401 }
            );
        }

        const body = await req.json();
        const { businessName, businessCity, businessUrl, businessIndustry } = body;

        if (!businessName) {
            return NextResponse.json(
                { error: 'businessName is required' },
                { status: 400 }
            );
        }

        // Create audit (same logic as internal endpoint)
        const audit = await prisma.audit.create({
            data: {
                businessName,
                businessCity,
                businessUrl,
                businessIndustry: businessIndustry || 'General',
                status: 'QUEUED',
            },
        });

        // Trigger audit process (async, don't wait)
        fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/audit/${audit.id}/run`, {
            method: 'POST',
            headers: {
                'x-api-key': process.env.API_KEY!,
            },
        }).catch(console.error);

        return NextResponse.json({
            auditId: audit.id,
            status: 'QUEUED',
            message: 'Audit created successfully. Check status at /api/public/audit/{auditId}',
            estimatedCompletionTime: '2-5 minutes',
            cost: '$5.00',
        }, { status: 201 });

    } catch (error) {
        console.error('[Public API] Error creating audit:', error);
        return NextResponse.json(
            { error: 'Failed to create audit' },
            { status: 500 }
        );
    }
}

/**
 * GET /api/public/audit/[id]
 * Get audit status and results
 */
export async function GET(req: Request, { params }: Params) {
    try {
        const apiKey = req.headers.get('x-api-key');
        if (!apiKey || apiKey !== process.env.API_KEY) {
            return NextResponse.json(
                { error: 'Invalid API key' },
                { status: 401 }
            );
        }

        const { id } = await params;

        const audit = await prisma.audit.findUnique({
            where: { id },
            include: {
                findings: {
                    where: { excluded: false },
                    select: {
                        id: true,
                        title: true,
                        description: true,
                        type: true,
                        category: true,
                        impactScore: true,
                        effortEstimate: true,
                    },
                },
            },
        });

        if (!audit) {
            return NextResponse.json(
                { error: 'Audit not found' },
                { status: 404 }
            );
        }

        return NextResponse.json({
            auditId: audit.id,
            businessName: audit.businessName,
            status: audit.status,
            overallScore: audit.overallScore,
            findingsCount: audit.findings.length,
            findings: audit.findings,
            completedAt: audit.completedAt,
            apiCostCents: audit.apiCostCents,
        });

    } catch (error) {
        console.error('[Public API] Error fetching audit:', error);
        return NextResponse.json(
            { error: 'Failed to fetch audit' },
            { status: 500 }
        );
    }
}
