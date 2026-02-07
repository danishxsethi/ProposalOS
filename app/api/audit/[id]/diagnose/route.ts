import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { runDiagnosisPipeline } from '@/lib/diagnosis';

/**
 * POST /api/audit/[id]/diagnose
 * Run the diagnosis pipeline on findings for an audit
 */
export async function POST(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const auditId = params.id;

        // Fetch audit with findings
        const audit = await prisma.audit.findUnique({
            where: { id: auditId },
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
