import { NextResponse } from 'next/server';

import { invokeDiagnosisGraphWithTimeout } from '@/lib/graph/diagnosis-graph';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
// P0-3: Use LangGraph path — includes evidence verification, validation retry, adversarial QA
import { getTenantId } from '@/lib/tenant/context';

/**
 * POST /api/audit/[id]/diagnose
 * Run the diagnosis pipeline on findings for an audit
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
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
        tenantId,
      },
      include: {
        findings: true,
      },
    });

    if (!audit) {
      return NextResponse.json({ error: 'Audit not found' }, { status: 404 });
    }

    if (audit.findings.length === 0) {
      return NextResponse.json({ error: 'No findings to diagnose' }, { status: 400 });
    }

    logger.info(
      { event: 'diagnose.start', auditId, findingsCount: audit.findings.length },
      'Running diagnosis'
    );

    const evidenceSnapshots = await prisma.evidenceSnapshot.findMany({
      where: {
        auditId,
        tenantId,
      },
    });

    // Run diagnosis pipeline via LangGraph (P0-3)
    const diagnosisResult = await invokeDiagnosisGraphWithTimeout({
      findings: audit.findings,
      evidenceSnapshots,
      tenantId: audit.tenantId,
      auditId: audit.id,
      mode: 'MULTI_STEP',
    });

    logger.info(
      { event: 'diagnose.complete', auditId, clusterCount: diagnosisResult.clusters?.length ?? 0 },
      'Diagnosis complete'
    );

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
