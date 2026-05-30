import { RunTree } from 'langsmith';

import { generateComparison } from '@/lib/analysis/competitorComparison';
// P0-3: Use LangGraph path
import { CostTracker } from '@/lib/costs/costTracker';
import { invokeDiagnosisGraphWithTimeout } from '@/lib/graph/diagnosis-graph';
import { invokeProposalGraphWithTimeout } from '@/lib/graph/proposal-graph';
import { logError, logger } from '@/lib/logger';
import { Metrics } from '@/lib/metrics';
import { sendProposalReady } from '@/lib/notifications/email';
import { sendWebhook } from '@/lib/notifications/webhook';
import { recordAuditTrailEvent } from '@/lib/observability/auditTrail';
import { withChildObservabilityContext } from '@/lib/observability/context';
import { MetricsRecorder } from '@/lib/observability/MetricsRecorder';
import { prisma } from '@/lib/prisma';
import { runProposalPipeline } from '@/lib/proposal';
import { determineProposalStatus } from '@/lib/proposal/status';
import { runAutoQA } from '@/lib/qa/autoQA';
import { createParentTrace } from '@/lib/tracing';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

export async function generateProposal(auditId: string) {
  // Fetch audit with findings
  const audit = await prisma.audit.findUnique({
    where: { id: auditId },
    include: {
      findings: true,
      evidence: {
        where: { module: 'competitor' },
        orderBy: { collectedAt: 'desc' },
        take: 1,
      },
    },
  });

  if (!audit) {
    throw new Error(`Audit ${auditId} not found`);
  }

  return withChildObservabilityContext(
    {
      auditId,
      tenantId: audit.tenantId,
      workflow: 'proposal-runner',
    },
    async () => {
      const startTime = Date.now();

      logger.info(
        {
          event: 'proposal.start',
          auditId,
          tenantId: audit.tenantId,
          findingsCount: audit.findings.length,
        },
        'Starting proposal generation'
      );

      if (audit.findings.length === 0) {
        logger.warn({ auditId, tenantId: audit.tenantId }, 'No findings to generate proposal from');
        return null;
      }

      const tracker = new CostTracker();

      // Create parent trace for this proposal generation flow
      let parentTrace: RunTree | undefined;
      try {
        parentTrace = await createParentTrace(auditId, 'proposal-generation', {
          tenantId: audit.tenantId,
          industry: audit.businessIndustry,
          findingsCount: audit.findings.length,
        });
      } catch (e) {
        logger.error({ error: e }, 'Failed to create parent trace');
      }

      try {
        // Step 1: Run diagnosis to get clusters via LangGraph (P0-3)
        const diagnosisResult = await invokeDiagnosisGraphWithTimeout({
          findings: audit.findings,
          tenantId: audit.tenantId,
          auditId: audit.id,
          mode: 'MULTI_STEP',
          // Notice: tracker & parentTrace are not passed here yet since diagnosisGraph
          // doesn't natively support tracing/tracking in the same way, but it resolves
          // the P0-3 requirement to use the LangGraph pipeline with QA.
        });

        logger.info(
          {
            event: 'diagnosis.complete',
            auditId,
            clusterCount: diagnosisResult.clusters?.length || 0,
            duration_ms: Date.now() - startTime,
          },
          'Diagnosis complete'
        );

        // Build comparison report from competitor evidence
        let comparisonReport = null;
        const competitorEvidence = audit.evidence?.[0]?.rawResponse as
          | { comparisonMatrix?: { business?: unknown; competitors?: unknown[] } }
          | undefined;
        if (
          competitorEvidence?.comparisonMatrix?.business &&
          competitorEvidence.comparisonMatrix.competitors?.length
        ) {
          const { business, competitors } = competitorEvidence.comparisonMatrix;
          comparisonReport = generateComparison(
            business as Parameters<typeof generateComparison>[0],
            competitors as Parameters<typeof generateComparison>[1],
            audit.businessIndustry || undefined
          );
        }

        // Step 2: Generate proposal via canonical timeout wrapper
        const proposalGraphState = await invokeProposalGraphWithTimeout({
          businessName: audit.businessName,
          businessIndustry: audit.businessIndustry || undefined,
          clusters: diagnosisResult.clusters,
          findings: audit.findings,
          tenantId: audit.tenantId,
          auditId: audit.id,
          // P0-1: Pass evidence snapshots for QA grounding
          evidenceSnapshots: await prisma.evidenceSnapshot.findMany({
            where: { auditId: audit.id },
          }),
        });

        const pipelineResult = {
          ...proposalGraphState.proposalDef,
          normalizedFindings: audit.findings,
        };
        const { normalizedFindings: _nf, ...proposalResult } = pipelineResult;

        // Use complete proposal if available, otherwise fall back to old format
        const finalProposal = proposalGraphState.completeProposal || proposalResult;

        // Step 3: Run automated QA to determine proposal status.
        // This mirrors the logic in app/api/audit/[id]/propose/route.ts so both
        // the interactive route and the background runner use identical criteria.
        const qaStatus = runAutoQA(
          finalProposal,
          audit.findings,
          audit.businessName,
          audit.businessCity,
          {
            industry: audit.businessIndustry,
            comparisonReport: comparisonReport ?? undefined,
          }
        );

        const proposalStatus = determineProposalStatus(qaStatus);

        logger.info(
          {
            event: 'proposal.status.decided',
            auditId,
            qaScore: qaStatus.score,
            passedChecks: qaStatus.passedChecks,
            totalChecks: qaStatus.totalChecks,
            hardFails: qaStatus.clientPerfect.hardFails.length,
            needsReview: qaStatus.needsReview,
            status: proposalStatus,
          },
          'Proposal status decided'
        );

        // Step 4: Save proposal to database (serialize to JSON)
        const proposal = await prisma.proposal.create({
          data: {
            auditId,
            tenantId: audit.tenantId,
            executiveSummary: finalProposal.executiveSummary,
            painClusters: finalProposal.painClusters as any,
            tierEssentials: finalProposal.tiers.essentials as any,
            tierGrowth: finalProposal.tiers.growth as any,
            tierPremium: finalProposal.tiers.premium as any,
            pricing: finalProposal.pricing as any,
            assumptions: finalProposal.assumptions,
            disclaimers: finalProposal.disclaimers,
            nextSteps: finalProposal.nextSteps,
            comparisonReport: comparisonReport ? (comparisonReport as any) : undefined,
            status: proposalStatus,
            qaScore: qaStatus.score,
            clientScore: qaStatus.clientPerfect.score,
            qaResults: JSON.parse(JSON.stringify(qaStatus)),
            clientScoreResults: JSON.parse(JSON.stringify(qaStatus.clientPerfect)),
          },
        });

        // Update audit cost
        await prisma.audit.update({
          where: { id: auditId },
          data: {
            apiCostCents: { increment: tracker.getTotalCents() },
          },
        });

        const duration_ms = Date.now() - startTime;
        MetricsRecorder.proposalGenerated(audit.tenantId, proposalStatus, undefined);
        await recordAuditTrailEvent({
          eventType: 'proposal.generated',
          tenantId: audit.tenantId,
          auditId,
          proposalId: proposal.id,
          findingsCount: audit.findings.length,
          proposalGenerated: true,
          payload: {
            status: proposalStatus,
            qaScore: qaStatus.score,
            durationMs: duration_ms,
            costCents: tracker.getTotalCents(),
          },
        });

        logger.info(
          {
            event: 'proposal.complete',
            auditId,
            proposalId: proposal.id,
            duration_ms,
            cost_cents: tracker.getTotalCents(),
          },
          'Proposal complete'
        );

        const proposalUrl = `${APP_URL}/proposal/${proposal.webLinkToken}`;

        // Send notifications (fire and forget)
        sendProposalReady(auditId, audit.businessName, proposalUrl).catch((e) =>
          logError('Failed to send proposal-ready notification', e, {
            auditId,
            proposalId: proposal.id,
          })
        );
        sendWebhook('proposal.ready', {
          auditId,
          proposalId: proposal.id,
          url: proposalUrl,
        });

        return {
          success: true,
          auditId,
          proposalId: proposal.id,
          webLinkToken: proposal.webLinkToken,
          status: proposalStatus,
          qaScore: qaStatus.score,
          costCents: tracker.getTotalCents(),
        };
      } catch (error) {
        logError('Error generating proposal', error, { auditId });
        throw error;
      }
    }
  );
}
