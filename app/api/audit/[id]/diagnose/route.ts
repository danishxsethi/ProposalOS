import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { runDiagnosisPipeline } from '@/lib/diagnosis';
import { getTenantId } from '@/lib/tenant/context';

/**
 * POST /api/audit/[id]/diagnose
 * Run the diagnosis pipeline on findings for an audit
 */
export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: auditId } = await params;
        const tenantId = await getTenantId();

        if (!tenantId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Fetch audit with findings
        const audit = await prisma.audit.findFirst({
            where: {
                id: auditId,
                tenantId
            },
            include: {
                findings: true,
            },
        });

        if (!audit) {
            return NextResponse.json(
                { error: 'Audit not found' },
                { status: 404 }
            );
        }

        if (audit.findings.length === 0) {
            return NextResponse.json(
                { error: 'No findings to diagnose' },
                { status: 400 }
            );
        }

        console.log(`[Diagnose] Running diagnosis for audit ${auditId} with ${audit.findings.length} findings...`);

        // Run diagnosis pipeline
        const diagnosisResult = await runDiagnosisPipeline(audit.findings);

        console.log(`[Diagnose] Generated ${diagnosisResult.clusters.length} clusters`);

        return NextResponse.json({
            success: true,
            auditId,
            diagnosis: diagnosisResult,
        });

    } catch (error) {
        console.error('[Diagnose] Error:', error);
        return NextResponse.json(
            { error: 'Internal Server Error', details: String(error) },
            { status: 500 }
        );
    }
}
