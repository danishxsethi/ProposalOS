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
      include: { findings: true },
    });

    if (!audit) {
      return NextResponse.json({ error: 'Audit not found' }, { status: 404 });
    }

    if (audit.trustState !== 'TRUSTED') {
      return NextResponse.json(
        { error: 'Audit requires review before diagnosis', trustState: audit.trustState },
        { status: 409 }
      );
    }

    const evidenceSnapshots = await prisma.evidenceSnapshot.findMany({ where: { auditId, tenantId } });
    const moduleResults = audit.moduleResults as Record<string, { status?: string }>;
    const evidenceModules = new Set(evidenceSnapshots.map((snapshot) => snapshot.module));
    const relevantFindings = audit.findings.filter((finding) => {
      const state = moduleResults[finding.module]?.status;
      return evidenceModules.has(finding.module) && (!state || state === 'COMPLETE');
    });
    if (relevantFindings.length === 0) {
      return NextResponse.json({ error: 'No evidence-backed findings are eligible for diagnosis' }, { status: 409 });
    }
    const diagnosis = await invokeDiagnosisGraphWithTimeout({
      findings: relevantFindings,
      evidenceSnapshots,
      tenantId: audit.tenantId,
      auditId: audit.id,
      mode: 'MULTI_STEP',
    });
    if (diagnosis.resultState !== 'trusted' || diagnosis.validation?.valid !== true || diagnosis.errors.length > 0) {
      return NextResponse.json(
        { error: 'Diagnosis requires review', diagnosisState: diagnosis.resultState, validation: diagnosis.validation },
        { status: 409 }
      );
    }

    if (audit.findings.length === 0) {
      return NextResponse.json({ error: 'No findings to diagnose' }, { status: 400 });
    }

    logger.info(
      { event: 'diagnose.start', auditId, findingsCount: audit.findings.length },
      'Running diagnosis'
    );

    logger.info(
      { event: 'diagnose.complete', auditId, clusterCount: diagnosis.clusters.length },
      'Diagnosis complete'
    );

    return NextResponse.json({
      success: true,
      auditId,
      diagnosis,
    });
  } catch (error) {
    logger.error('[Diagnose] Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: String(error) },
      { status: 500 }
    );
  }
}
