import { randomUUID } from 'node:crypto';

import { generateComparison } from '@/lib/analysis/competitorComparison';
import { validateFinding } from '@/lib/audit/findingContract';
import type { AggregatedContext } from '@/lib/context/aggregator';
import { CostTracker } from '@/lib/costs/costTracker';
import { invokeDiagnosisGraphWithTimeout } from '@/lib/graph/diagnosis-graph';
import { invokeProposalGraphWithTimeout } from '@/lib/graph/proposal-graph';
import { prisma } from '@/lib/prisma';
import { buildProposalGrounding } from '@/lib/proposal/grounding';
import { isProposalQAPublishable, ProposalQAService } from '@/lib/proposal/ProposalQAService';
import {
  buildPersistedQaResults,
  proposalPublicationFingerprint,
  publicationBlockReasons,
} from '@/lib/proposal/publication';
import { validateProposalStructure } from '@/lib/proposal/schemas';

import type { Prisma } from '@prisma/client';

interface CompileProposalOptions {
  auditId: string;
  tenantId: string;
  version?: number;
  templateId?: string;
  prospectEmail?: string | null;
  pricingMultiplier?: number;
  costTracker?: CostTracker;
  allowZeroClusters?: boolean;
  diagnosisMode?: 'SINGLE_PASS' | 'MULTI_STEP';
  aggregatedContext?: AggregatedContext;
  shouldAutoPromote?: boolean;
}

interface CompiledProposalResult {
  audit: NonNullable<Awaited<ReturnType<typeof prisma.audit.findFirst>>>;
  diagnosis: Awaited<ReturnType<typeof invokeDiagnosisGraphWithTimeout>>;
  proposal: NonNullable<Awaited<ReturnType<typeof invokeProposalGraphWithTimeout>>['completeProposal']>;
  evaluation: ReturnType<typeof ProposalQAService.evaluateProposal>;
  proposalRecord: Awaited<ReturnType<typeof prisma.proposal.create>>;
  costTracker: CostTracker;
  diagnosisState: 'trusted';
}

interface EmptyDiagnosisResult {
  audit: NonNullable<Awaited<ReturnType<typeof prisma.audit.findFirst>>>;
  diagnosis: Awaited<ReturnType<typeof invokeDiagnosisGraphWithTimeout>>;
  costTracker: CostTracker;
  emptyDiagnosis: true;
}

export function compileAndPersistProposal(
  options: CompileProposalOptions & { allowZeroClusters: true }
): Promise<CompiledProposalResult | EmptyDiagnosisResult>;
export function compileAndPersistProposal(
  options: CompileProposalOptions & { allowZeroClusters?: false }
): Promise<CompiledProposalResult>;
export async function compileAndPersistProposal({
  auditId,
  tenantId,
  version: requestedVersion,
  templateId,
  prospectEmail,
  pricingMultiplier = 1,
  costTracker = new CostTracker(),
  allowZeroClusters = false,
  diagnosisMode = 'MULTI_STEP',
  aggregatedContext,
  shouldAutoPromote = true,
}: CompileProposalOptions): Promise<CompiledProposalResult | EmptyDiagnosisResult> {
  const audit = await prisma.audit.findFirst({
    where: { id: auditId, tenantId },
    include: {
      findings: { where: { excluded: false }, orderBy: { impactScore: 'desc' } },
      evidence: {
        where: { module: 'competitor' },
        orderBy: { collectedAt: 'desc' },
        take: 1,
      },
    },
  });

  if (!audit) throw new Error(`AUDIT_NOT_FOUND: ${auditId}`);
  assertTrustedAudit(audit);
  if (audit.findings.length === 0) throw new Error('NO_FINDINGS: No findings for proposal generation');

  const invalidFindings = audit.findings.filter((finding) => !validateFinding(finding).success);
  if (invalidFindings.length > 0) {
    throw new Error(`PROPOSAL_FINDINGS_INVALID: ${invalidFindings.map((finding) => finding.id).join(',')}`);
  }

  const version = requestedVersion ?? 1;

  const evidenceSnapshots = await prisma.evidenceSnapshot.findMany({
    where: { auditId: audit.id, tenantId: audit.tenantId },
  });
  const completeEvidenceSnapshots = evidenceSnapshots.filter(
    (snapshot) => snapshot.observationStatus === 'COMPLETE'
  );
  const evidenceBackedFindings = audit.findings.filter(
    (finding) =>
      Array.isArray(finding.evidence) &&
      finding.evidence.length > 0 &&
      completeEvidenceSnapshots.some((snapshot) => snapshot.module === finding.module)
  );
  if (evidenceBackedFindings.length === 0) {
    throw new Error('PROPOSAL_EVIDENCE_INCOMPLETE: no Finding is backed by a COMPLETE persisted evidence snapshot');
  }
  const findings = evidenceBackedFindings;
  const { buildPublicProposalInputEnvelope } = await import('./inputEnvelope');
  const envelope = buildPublicProposalInputEnvelope({ ...audit, findings }, evidenceSnapshots);
  const tracker = costTracker;
  const diagnosis = await invokeDiagnosisGraphWithTimeout({
    findings: envelope.findings,
    evidenceSnapshots,
    tenantId: audit.tenantId,
    auditId: audit.id,
    mode: diagnosisMode,
    aggregatedContext,
    costTracker: tracker,
  });
  if (diagnosis.resultState !== 'trusted') {
    throw new Error(`DIAGNOSIS_NOT_TRUSTED: Diagnosis result state is ${diagnosis.resultState}`);
  }
  if (
    diagnosis.validation?.valid !== true ||
    diagnosis.errors.length > 0 ||
    diagnosis.degraded ||
    diagnosis.staleFindingsCount > 0
  ) {
    throw new Error('DIAGNOSIS_NOT_TRUSTED: Diagnosis validation or node execution was incomplete');
  }
  if (diagnosis.clusters.length === 0 && allowZeroClusters) {
    return { audit, diagnosis, costTracker: tracker, emptyDiagnosis: true };
  }
  if (diagnosis.clusters.length === 0) throw new Error('DIAGNOSIS_EMPTY: Diagnosis produced no clusters');

  const proposalState = await invokeProposalGraphWithTimeout({
    businessName: audit.businessName,
    businessIndustry: audit.businessIndustry || undefined,
    clusters: diagnosis.clusters,
    findings: envelope.findings,
    evidenceSnapshots,
    tenantId: audit.tenantId,
    auditId: audit.id,
  });
  if (!proposalState.completeProposal) {
    throw new Error('Proposal graph did not produce a grounded complete proposal');
  }
  if (
    proposalState.validation?.valid !== true ||
    proposalState.errors.length > 0 ||
    proposalState.lastQaScore > 0.3
  ) {
    throw new Error('PROPOSAL_GRAPH_NOT_TRUSTED: proposal graph QA or validation did not pass');
  }

  const competitorEvidence = audit.evidence?.[0]?.rawResponse as
    | { comparisonMatrix?: { business?: unknown; competitors?: unknown[] } }
    | undefined;
  const matrix = competitorEvidence?.comparisonMatrix;
  const comparisonReport = matrix?.business && matrix.competitors?.length
    ? generateComparison(
        matrix.business as Parameters<typeof generateComparison>[0],
        matrix.competitors as Parameters<typeof generateComparison>[1],
        audit.businessIndustry || undefined
      )
    : undefined;

  const baseProposal = proposalState.completeProposal;
  const multiplier = pricingMultiplier;
  const pricing = {
    ...baseProposal.pricing,
    essentials: Math.round(baseProposal.pricing.essentials * multiplier),
    growth: Math.round(baseProposal.pricing.growth * multiplier),
    premium: Math.round(baseProposal.pricing.premium * multiplier),
  };
  const proposal = {
    ...baseProposal,
    pricing,
    tiers: {
      essentials: { ...baseProposal.tiers.essentials, price: pricing.essentials },
      growth: { ...baseProposal.tiers.growth, price: pricing.growth },
      premium: { ...baseProposal.tiers.premium, price: pricing.premium },
    },
    comparisonReport: comparisonReport ?? baseProposal.comparisonReport,
  };
  const structuralValidation = validateProposalStructure(proposal);
  if (!structuralValidation.valid) {
    throw new Error(`PROPOSAL_STRUCTURE_INVALID: ${structuralValidation.errors.join('; ')}`);
  }
  proposal.grounding = buildProposalGrounding(
    proposal,
    { auditId: audit.id, tenantId: audit.tenantId, findings: envelope.findings },
    envelope.findingIds
  );
  const evaluation = ProposalQAService.evaluateProposal(
    proposal,
    envelope.findings,
    audit.businessName,
    audit.businessCity,
    { industry: audit.businessIndustry, comparisonReport }
  );
  const qaResults = buildPersistedQaResults(evaluation, proposal, version);
  qaResults.provenance = {
    proposalInputVersion: envelope.version,
    findingIds: envelope.findingIds,
    evidenceIds: envelope.evidenceIds,
    findingEvidenceIds: Object.fromEntries(
      envelope.findings.map((finding) => [
        finding.id,
        completeEvidenceSnapshots
          .filter((snapshot) => snapshot.module === finding.module)
          .map((snapshot) => snapshot.id),
      ])
    ),
    auditCompletedAt: envelope.auditCompletedAt?.toISOString() ?? null,
    packageCatalogVersion: envelope.packageCatalogVersion,
    claimPolicyVersion: envelope.claimPolicyVersion,
    diagnosisGraphVersion: envelope.diagnosisGraphVersion,
    proposalGraphVersion: envelope.proposalGraphVersion,
    qaVersion: envelope.qaVersion,
    promptVersion: envelope.promptVersion,
    modelProvider: envelope.modelProvider,
    model: envelope.model,
  };
  const publicationState = {
    auditId: audit.id,
    tenantId: audit.tenantId,
    businessName: audit.businessName,
    businessCity: audit.businessCity,
    businessIndustry: audit.businessIndustry,
    auditOverallScore: audit.overallScore,
    auditStartedAt: audit.startedAt,
    auditCompletedAt: audit.completedAt,
    version,
    executiveSummary: proposal.executiveSummary,
    painClusters: diagnosis.clusters,
    tiers: proposal.tiers,
    pricing: proposal.pricing,
    assumptions: proposal.assumptions,
    disclaimers: proposal.disclaimers,
    nextSteps: proposal.nextSteps,
    grounding: qaResults.grounding,
    provenance: qaResults.provenance,
    findings: envelope.findings.map((finding) => ({
      id: finding.id,
      auditId: finding.auditId,
      tenantId: finding.tenantId,
      module: finding.module,
      category: finding.category,
      type: finding.type,
      title: finding.title,
      description: finding.description,
      impactScore: finding.impactScore,
      confidenceScore: finding.confidenceScore,
      effortEstimate: finding.effortEstimate,
      recommendedFix: finding.recommendedFix,
      metrics: finding.metrics,
      evidence: finding.evidence,
      manuallyEdited: finding.manuallyEdited,
      excluded: finding.excluded,
    })).sort((left, right) => left.id.localeCompare(right.id)),
    evidenceSnapshots: [...completeEvidenceSnapshots].sort((left, right) => left.id.localeCompare(right.id)),
  };
  const approvalFingerprint = proposalPublicationFingerprint(publicationState);
  qaResults.publicationFingerprint = approvalFingerprint;
  const publicationEligible =
    shouldAutoPromote &&
    isProposalQAPublishable(evaluation) &&
    audit.trustState === 'TRUSTED' &&
    completeEvidenceSnapshots.length > 0 &&
    envelope.findings.every((finding) =>
      completeEvidenceSnapshots.some((snapshot) => snapshot.module === finding.module)
    ) &&
    publicationBlockReasons({
      auditId: audit.id,
      tenantId: audit.tenantId,
      qaResults: {
        ...qaResults,
        publicationApproval: {
          version: 1,
          decision: 'APPROVED',
          proposalVersion: version,
          qaVersion: 1,
          fingerprint: approvalFingerprint,
        },
      },
      version,
      status: 'READY',
    }).length === 0;

  const saved = await prisma.$transaction(async (tx) => {
    const latestVersion = await tx.proposal.findFirst({
      where: { auditId, tenantId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    if (version !== (latestVersion?.version ?? 0) + 1) {
      throw new Error('PROPOSAL_VERSION_STALE: Proposal changed during compilation; regenerate with current version');
    }

    const draft = await tx.proposal.create({
      data: {
        auditId: audit.id,
        tenantId: audit.tenantId,
        version,
        webLinkToken: randomUUID(),
        publicationFingerprint: approvalFingerprint,
        templateId,
        prospectEmail,
        executiveSummary: proposal.executiveSummary,
        painClusters: JSON.parse(JSON.stringify(diagnosis.clusters)),
        tierEssentials: JSON.parse(JSON.stringify(proposal.tiers.essentials)),
        tierGrowth: JSON.parse(JSON.stringify(proposal.tiers.growth)),
        tierPremium: JSON.parse(JSON.stringify(proposal.tiers.premium)),
        pricing: JSON.parse(JSON.stringify(proposal.pricing)),
        assumptions: proposal.assumptions,
        disclaimers: proposal.disclaimers,
        nextSteps: proposal.nextSteps,
        comparisonReport: proposal.comparisonReport
          ? JSON.parse(JSON.stringify(proposal.comparisonReport))
          : undefined,
        status: 'DRAFT',
        qaScore: evaluation.autoQAStatus.score,
        clientScore: evaluation.autoQAStatus.clientPerfect.score,
        qaResults: JSON.parse(JSON.stringify(qaResults)),
        clientScoreResults: JSON.parse(JSON.stringify(evaluation.autoQAStatus.clientPerfect)),
      },
    });
    if (!publicationEligible) return draft;

    const approvedQaResults = JSON.parse(
      JSON.stringify({
        ...qaResults,
        publicationApproval: {
          version: 1,
          decision: 'APPROVED',
          proposalVersion: version,
          qaVersion: 1,
          fingerprint: approvalFingerprint,
        },
      })
    ) as Prisma.InputJsonValue;
    const promoted = await tx.proposal.updateMany({
      where: { id: draft.id, tenantId, version, status: 'DRAFT' },
      data: { status: 'READY', qaResults: approvedQaResults },
    });
    if (promoted.count !== 1) {
      throw new Error('PROPOSAL_PROMOTION_CONFLICT: Draft changed before publication approval was recorded');
    }
    const ready = await tx.proposal.findUnique({ where: { id: draft.id } });
    if (!ready) throw new Error('PROPOSAL_PROMOTION_CONFLICT: Promoted proposal could not be reloaded');
    return ready;
  }, { isolationLevel: 'Serializable' });

  await prisma.audit.update({
    where: { id: audit.id },
    data: { apiCostCents: { increment: tracker.getTotalCents() } },
  });

  return { audit, diagnosis, proposal, evaluation, proposalRecord: saved, costTracker: tracker, diagnosisState: 'trusted' };
}

export async function getCurrentProposalVersion(auditId: string, tenantId: string): Promise<number> {
  const latest = await prisma.proposal.findFirst({
    where: { auditId, tenantId },
    orderBy: { version: 'desc' },
    select: { version: true },
  });
  return (latest?.version ?? 0) + 1;
}

export function assertTrustedAudit(audit: { status: string; trustState: string }): void {
  if (audit.status !== 'COMPLETE' || audit.trustState !== 'TRUSTED') {
    throw new Error(`AUDIT_NOT_TRUSTED: status=${audit.status}, trustState=${audit.trustState}`);
  }
}
