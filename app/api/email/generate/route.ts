import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/middleware/auth';
import { getTenantId } from '@/lib/tenant/context';
import { detectVertical } from '@/lib/playbooks';
import {
    generateColdEmails,
    extractAuditContext,
} from '@/lib/email/generate';
import { logger } from '@/lib/logger';

/**
 * POST /api/email/generate
 * Generate personalized cold emails from audit data.
 * Body: { auditId, recipientEmail?, recipientName? }
 * Returns: { emails: [{ subject, body, score, variant }], bestVariant }
 */
export const POST = withAuth(async (req: Request) => {
    try {
        const tenantId = await getTenantId();
        if (!tenantId) {
            return NextResponse.json({ error: 'Unauthorized: No Tenant' }, { status: 401 });
        }

        const body = await req.json();
        const auditId = body.auditId as string | undefined;
        const recipientEmail = body.recipientEmail as string | undefined;
        const recipientName = body.recipientName as string | undefined;

        if (!auditId) {
            return NextResponse.json({ error: 'auditId is required' }, { status: 400 });
        }

        const audit = await prisma.audit.findFirst({
            where: { id: auditId, tenantId },
            include: {
                findings: { where: { excluded: false }, orderBy: { impactScore: 'desc' } },
                proposals: { take: 1, orderBy: { createdAt: 'desc' } },
            },
        });

        if (!audit) {
            return NextResponse.json({ error: 'Audit not found' }, { status: 404 });
        }

        const proposal = audit.proposals[0];
        if (!proposal) {
            return NextResponse.json(
                { error: 'No proposal found for this audit. Run propose first.' },
                { status: 400 }
            );
        }

        const vertical =
            audit.verticalPlaybookId ||
            detectVertical({
                businessName: audit.businessName,
                businessIndustry: audit.businessIndustry,
                businessCity: audit.businessCity,
            });

        const baseUrl = process.env.BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const proposalUrl = `${baseUrl}/proposal/${proposal.webLinkToken}`;

        const comparisonReport = proposal.comparisonReport as {
            competitors?: Array<{ name?: string }>;
        } | null;

        const context = extractAuditContext({
            ...audit,
            comparisonReport,
        });

        const existingOutreach = await prisma.proposalOutreach.findFirst({
            where: { proposalId: proposal.id },
            orderBy: { sentAt: 'desc' },
        });

        if (existingOutreach) {
            return NextResponse.json({
                emails: [
                    {
                        subject: existingOutreach.emailSubject,
                        body: existingOutreach.emailBody,
                        score: null,
                        breakdown: null,
                        variant: 0,
                    },
                ],
                bestVariant: 0,
                source: 'existing',
            });
        }

        const result = await generateColdEmails({
            auditId,
            vertical,
            businessName: audit.businessName,
            recipientName: recipientName || undefined,
            proposalUrl,
            topFinding: context.topFinding,
            topMetric: context.topMetric,
            competitorName: context.competitorName,
        });

        logger.info(
            {
                event: 'cold_email_generated',
                auditId,
                variantCount: result.emails.length,
                bestVariant: result.bestVariant,
            },
            'Cold emails generated'
        );

        return NextResponse.json({
            emails: result.emails.map((e) => ({
                subject: e.subject,
                body: e.body,
                score: e.score,
                breakdown: e.breakdown,
                variant: e.variant,
            })),
            bestVariant: result.bestVariant,
        });
    } catch (err) {
        logger.error(
            {
                event: 'cold_email_generate_error',
                error: err instanceof Error ? err.message : String(err),
            },
            'Cold email generation failed'
        );
        return NextResponse.json(
            { error: 'Failed to generate emails', message: String(err) },
            { status: 500 }
        );
    }
});
