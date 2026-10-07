import { logError, logger } from '@/lib/logger';
import { sendProposalReady } from '@/lib/notifications/email';
import { sendWebhook } from '@/lib/notifications/webhook';
import { recordAuditTrailEvent } from '@/lib/observability/auditTrail';
import { withChildObservabilityContext } from '@/lib/observability/context';
import { MetricsRecorder } from '@/lib/observability/MetricsRecorder';
import { prisma } from '@/lib/prisma';
import { compileAndPersistProposal, getCurrentProposalVersion } from '@/lib/proposal/compiler';
import { createParentTrace } from '@/lib/tracing';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

export async function generateProposal(auditId: string) {
  const audit = await prisma.audit.findFirst({ where: { id: auditId }, include: { findings: true } });
  if (!audit) throw new Error(`Audit ${auditId} not found`);

  return withChildObservabilityContext(
    { auditId, tenantId: audit.tenantId, workflow: 'proposal-runner' },
    async () => {
      logger.info({ event: 'proposal.start', auditId, tenantId: audit.tenantId }, 'Starting proposal generation');
      try {
        try {
          await createParentTrace(auditId, 'proposal-generation', {
            tenantId: audit.tenantId,
            industry: audit.businessIndustry,
          });
        } catch (error) {
          logger.error({ error }, 'Failed to create parent trace');
        }

        const nextVersion = await getCurrentProposalVersion(auditId, audit.tenantId);
        const result = await compileAndPersistProposal({ auditId, tenantId: audit.tenantId, version: nextVersion });
        const saved = result.proposalRecord;
        const status = saved.status;
        MetricsRecorder.proposalGenerated(audit.tenantId, status, undefined);
        await recordAuditTrailEvent({
          eventType: 'proposal.generated',
          tenantId: audit.tenantId,
          auditId,
          proposalId: saved.id,
          findingsCount: result.diagnosis.findings.length,
          proposalGenerated: true,
          payload: {
            status,
            qaScore: result.evaluation.autoQAStatus.score,
            costCents: result.costTracker.getTotalCents(),
            overallScore: result.evaluation.overallScore,
            dimensions: result.evaluation.dimensions,
            feedbackLogs: result.evaluation.feedbackLogs,
            passed: result.evaluation.passed,
          },
        });
        logger.info({ event: 'proposal.complete', auditId, proposalId: saved.id }, 'Proposal complete');

        const proposalUrl = `${APP_URL}/proposal/${saved.webLinkToken}`;
        sendProposalReady(auditId, audit.businessName, proposalUrl).catch((error) =>
          logError('Failed to send proposal-ready notification', error, { auditId, proposalId: saved.id })
        );
        sendWebhook('proposal.ready', { auditId, proposalId: saved.id, url: proposalUrl });

        return {
          success: true,
          auditId,
          proposalId: saved.id,
          webLinkToken: saved.webLinkToken,
          status,
          qaScore: result.evaluation.autoQAStatus.score,
          costCents: result.costTracker.getTotalCents(),
          evaluation: {
            dimensions: result.evaluation.dimensions,
            overallScore: result.evaluation.overallScore,
            passed: result.evaluation.passed,
            feedbackLogs: result.evaluation.feedbackLogs,
          },
        };
      } catch (error) {
        logError('Error generating proposal', error, { auditId });
        throw error;
      }
    }
  );
}
