/**
 * Diagnosis & Proposal Pipeline Stage
 *
 * Processes prospects in "audited" status by running the Diagnosis Engine
 * to cluster findings, then generating proposals with the Proposal Generator.
 * Assigns unique web link tokens, applies tenant pricing multiplier, and
 * transitions to "QUALIFIED" or "low_value" (if zero clusters).
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6
 */

import { prisma } from '@/lib/prisma';
import { transition } from '../stateMachine';
import { logStageFailure } from '../metrics';
import { diagnosisGraph } from '@/lib/graph/diagnosis-graph';
import { proposalGraph } from '@/lib/graph/proposal-graph';
import { CostTracker } from '@/lib/costs/costTracker';
import { detectVertical, getPlaybook } from '@/lib/playbooks/registry';
import { PipelineStage, type StageResult } from '../types';
import crypto from 'crypto';
import { FEATURE_FLAGS } from '@/lib/config/feature-flags';
import { aggregateContext } from '@/lib/context/aggregator';

/**
 * Process a batch of prospects in "audited" status through the diagnosis & proposal stage.
 *
 * For each prospect:
 * 1. Fetches the linked audit with findings
 * 2. Runs runDiagnosisPipeline() with the audit findings
 * 3. If zero clusters: transitions to "low_value"
 * 4. Runs runProposalPipeline() with clusters and findings
 * 5. Creates a Proposal record with unique web link token
 * 6. Applies tenant pricing multiplier from PipelineConfig
 * 7. Links proposalId to ProspectLead
 * 8. Transitions to "QUALIFIED"
 *
 * Individual failures do not stop the batch.
 */
export async function processDiagnosisProposalStage(
  tenantId: string,
  batchSize: number
): Promise<StageResult[]> {
  const prospects = await prisma.prospectLead.findMany({
    where: {
      tenantId,
      pipelineStatus: 'audited',
    },
    orderBy: { createdAt: 'asc' },
    take: batchSize,
  });

  const results: StageResult[] = [];

  for (const prospect of prospects) {
    try {
      const result = await processOneDiagnosisProposal(prospect.id);
      results.push(result);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      await logStageFailure(PipelineStage.DIAGNOSIS, prospect.id, err, tenantId);
      results.push({
        success: false,
        prospectId: prospect.id,
        fromStatus: 'audited',
        toStatus: 'audited',
        costCents: 0,
        error: err.message,
      });
    }
  }

  return results;
}

/**
 * Process a single prospect through the diagnosis & proposal stage.
 */
export async function processOneDiagnosisProposal(prospectId: string): Promise<StageResult> {
  const prospect = await prisma.prospectLead.findUnique({
    where: { id: prospectId },
  });

  if (!prospect) {
    throw new Error(`Prospect not found: ${prospectId}`);
  }

  if (prospect.pipelineStatus !== 'audited') {
    throw new Error(
      `Prospect ${prospectId} is in status "${prospect.pipelineStatus}", expected "audited"`
    );
  }

  if (!prospect.auditId) {
    throw new Error(`Prospect ${prospectId} has no linked audit`);
  }

  const tenantId = prospect.tenantId;

  // 1. Fetch the linked audit with findings
  const audit = await prisma.audit.findUnique({
    where: { id: prospect.auditId },
    include: { findings: true, evidence: true },
  });

  if (!audit) {
    throw new Error(`Audit not found: ${prospect.auditId}`);
  }

  const costTracker = new CostTracker();

  // Detect vertical and get playbook
  const vertical = detectVertical({
    businessIndustry: audit.businessIndustry,
    businessName: audit.businessName,
    businessCity: audit.businessCity,
  });
  const playbook = getPlaybook(vertical);

  // 2. Run diagnosis pipeline via LangGraph
  // Build context if Single-Pass is enabled
  let aggregatedContext;
  if (FEATURE_FLAGS.SINGLE_PASS_DIAGNOSIS) {
    aggregatedContext = await aggregateContext(audit as any);
  }

  const diagnosisResult = await diagnosisGraph.invoke({
    findings: audit.findings,
    tenantId,
    mode: FEATURE_FLAGS.SINGLE_PASS_DIAGNOSIS ? 'SINGLE_PASS' : 'MULTI_STEP',
    aggregatedContext
  });

  const costCents = costTracker.getTotalCents();

  // 3. If zero clusters: transition to "low_value"
  if (diagnosisResult.clusters.length === 0) {
    await transition(prospectId, 'low_value', PipelineStage.DIAGNOSIS);
    await recordTenantCost(tenantId, costCents, audit.id);

    return {
      success: true,
      prospectId,
      fromStatus: 'audited',
      toStatus: 'low_value',
      costCents,
      metadata: {
        auditId: audit.id,
        clusterCount: 0,
        reason: 'Zero pain clusters from diagnosis',
      },
    };
  }

  // 4. Run proposal pipeline via LangGraph
  const proposalResult = await proposalGraph.invoke({
    businessName: audit.businessName,
    businessIndustry: audit.businessIndustry ?? undefined,
    clusters: diagnosisResult.clusters,
    findings: audit.findings,
  });

  // 5. Get tenant pricing multiplier
  const pipelineConfig = await prisma.pipelineConfig.findUnique({
    where: { tenantId },
  });
  const pricingMultiplier = pipelineConfig?.pricingMultiplier ?? 1.0;

  // Apply pricing multiplier to tier prices
  const adjustedPricing = {
    essentials: Math.round((proposalResult.pricing.essentials ?? 0) * pricingMultiplier),
    growth: Math.round((proposalResult.pricing.growth ?? 0) * pricingMultiplier),
    premium: Math.round((proposalResult.pricing.premium ?? 0) * pricingMultiplier),
    currency: proposalResult.pricing.currency ?? 'USD',
  };

  // 6. Create Proposal record with unique web link token
  const webLinkToken = crypto.randomUUID();

  const proposal = await prisma.proposal.create({
    data: {
      auditId: audit.id,
      tenantId,
      status: 'DRAFT',
      executiveSummary: proposalResult.executiveSummary,
      painClusters: JSON.parse(JSON.stringify(proposalResult.clusters)),
      tierEssentials: JSON.parse(JSON.stringify(proposalResult.tiers.essentials)),
      tierGrowth: JSON.parse(JSON.stringify(proposalResult.tiers.growth)),
      tierPremium: JSON.parse(JSON.stringify(proposalResult.tiers.premium)),
      pricing: JSON.parse(JSON.stringify(adjustedPricing)),
      assumptions: proposalResult.proposalDef.assumptions,
      disclaimers: proposalResult.proposalDef.disclaimers,
      nextSteps: proposalResult.proposalDef.nextSteps,
      comparisonReport: proposalResult.proposalDef.comparisonReport
        ? JSON.parse(JSON.stringify(proposalResult.proposalDef.comparisonReport))
        : undefined,
      webLinkToken,
    },
  });

  // 7. Link proposalId to ProspectLead
  await prisma.prospectLead.update({
    where: { id: prospectId },
    data: { proposalId: proposal.id },
  });

  // 8. Transition to "QUALIFIED"
  await transition(prospectId, 'QUALIFIED', PipelineStage.PROPOSAL);

  // Record cost against tenant
  const totalCostCents = costTracker.getTotalCents();
  await recordTenantCost(tenantId, totalCostCents, audit.id);

  return {
    success: true,
    prospectId,
    fromStatus: 'audited',
    toStatus: 'QUALIFIED',
    costCents: totalCostCents,
    metadata: {
      auditId: audit.id,
      proposalId: proposal.id,
      webLinkToken,
      clusterCount: diagnosisResult.clusters.length,
      pricingMultiplier,
      adjustedPricing,
    },
  };
}

/**
 * Record diagnosis/proposal cost against the tenant.
 */
async function recordTenantCost(
  tenantId: string,
  costCents: number,
  auditId: string
): Promise<void> {
  if (costCents <= 0) return;

  await prisma.pipelineErrorLog.create({
    data: {
      tenantId,
      stage: PipelineStage.DIAGNOSIS,
      errorType: 'COST_RECORD',
      errorMessage: `Diagnosis/Proposal cost: ${costCents} cents`,
      metadata: {
        auditId,
        costCents,
        recordedAt: new Date().toISOString(),
      },
    },
  });
}
