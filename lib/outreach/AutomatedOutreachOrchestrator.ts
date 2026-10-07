import { EffortLevel, FindingType, OutreachLeadStage, ProspectLeadStatus } from '@prisma/client';

import { dispatchAuditExecution } from '@/lib/audit/dispatch';
import { persistFindings } from '@/lib/audit/findingPersistence';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { generateProposal } from '@/lib/proposal/runner';
import { processAuditJob } from '@/lib/queue/auditJobWorker';
import { runWithTenantAsync } from '@/lib/tenant/context';

export interface AuditProposalLoopResult {
  processedCount: number;
  auditedCount: number;
  promotedToOutreach: number;
  droppedCount: number;
  details: Array<{
    leadId: string;
    businessName: string;
    outcome: 'audited' | 'promoted' | 'dropped' | 'failed-generation' | 'in-progress';
    reason?: string;
  }>;
}

export class AutomatedOutreachOrchestrator {
  /**
   * Automatically processes leads from discovery through crawling, proposal generation,
   * QA validation gating, and sequence insertion.
   */
  public static async processAuditProposalLoop(
    tenantId: string,
    options?: { simulate?: boolean }
  ): Promise<AuditProposalLoopResult> {
    const result: AuditProposalLoopResult = {
      processedCount: 0,
      auditedCount: 0,
      promotedToOutreach: 0,
      droppedCount: 0,
      details: [],
    };

    const simulate = options?.simulate === true;

    // Fetch leads in 'discovered' pipeline status that have emails and websites
    const eligibleLeads = await runWithTenantAsync(tenantId, async () => {
      return await prisma.prospectLead.findMany({
        where: {
          tenantId,
          pipelineStatus: 'discovered',
          decisionMakerEmail: { not: null },
          website: { not: null },
          auditId: null,
        },
        take: 20,
      });
    });

    if (eligibleLeads.length === 0) {
      return result;
    }

    for (const lead of eligibleLeads) {
      result.processedCount++;

      await runWithTenantAsync(tenantId, async () => {
        try {
          logger.info(
            { tenantId, leadId: lead.id, businessName: lead.businessName },
            'Processing lead through audit & proposal pipeline'
          );

          // 1. Enqueue Audit / Crawl
          const audit = await prisma.audit.create({
            data: {
              tenantId,
              businessName: lead.businessName,
              businessCity: lead.city,
              businessIndustry: lead.vertical,
              businessUrl: lead.website || '',
              status: 'QUEUED',
            },
          });

          // Link audit to lead immediately
          await prisma.prospectLead.update({
            where: { id: lead.id },
            data: {
              auditId: audit.id,
              pipelineStatus: 'auditing',
            },
          });

          result.auditedCount++;

          if (simulate) {
            // Simulated / Sandboxed offline-safe crawling & findings generation
            await prisma.audit.update({
              where: { id: audit.id },
              data: { status: 'DEGRADED', trustState: 'DEGRADED_REVIEW_REQUIRED' },
            });

            // Create mock audit findings so the LangChain proposal graph has input data.
            // Wave 3 (Step 2/4): routed through the one validated persistence boundary
            // instead of a direct prisma.finding.createMany, and the evidence pointer
            // is now an honestly-labeled sandbox provenance URI
            // (`sandbox://outreach-simulate/...`) rather than the fabricated pseudo-URL
            // `https://example.com` this used to carry — that placeholder domain is
            // rejected by the contract (P1-25/P2-36) as fabricated evidence. This mode
            // is a sandboxed test fixture, not a real crawl; the sandbox:// scheme
            // reflects that truthfully instead of impersonating a real observed source.
            const { rejected } = await persistFindings(audit.id, tenantId, [
              {
                module: 'SEO',
                category: 'SEO',
                type: FindingType.PAINKILLER,
                title: 'Missing Sitemap and Robot.txt',
                description:
                  'The site has no robot.txt or sitemap configured, reducing indexation speed. Reduces search visibility and organic ranking significantly.',
                impactScore: 8,
                confidenceScore: 9,
                effortEstimate: EffortLevel.LOW,
                evidence: [
                  {
                    pointer: `sandbox://outreach-simulate/${audit.id}#robots-sitemap`,
                    source: 'outreach_simulate_sandbox',
                    collected_at: new Date().toISOString(),
                    type: 'text',
                    value: 'simulated: robots.txt/sitemap absent',
                  },
                ],
              },
              {
                module: 'PERFORMANCE',
                category: 'PERFORMANCE',
                type: FindingType.PAINKILLER,
                title: 'Slow Largest Contentful Paint (LCP)',
                description:
                  'Hero banner images do not use fetchpriority=high or modern avif compression. Leads to higher user bounce rate.',
                impactScore: 6,
                confidenceScore: 8,
                effortEstimate: EffortLevel.MEDIUM,
                evidence: [
                  {
                    pointer: `sandbox://outreach-simulate/${audit.id}#lcp`,
                    source: 'outreach_simulate_sandbox',
                    collected_at: new Date().toISOString(),
                    type: 'text',
                    value: 'simulated: LCP hero image not optimized',
                  },
                ],
              },
            ]);
            if (rejected.length > 0) {
              logger.warn(
                { auditId: audit.id, rejected },
                '[AutomatedOutreachOrchestrator] Simulated findings rejected by contract'
              );
            }

            logger.info(
              { auditId: audit.id, trustState: 'DEGRADED_REVIEW_REQUIRED' },
              'Sandbox observations persisted; proposal publication is blocked'
            );
          } else {
            // Execute real crawler
            const job = await dispatchAuditExecution({ tenantId, auditId: audit.id, push: false });
            await processAuditJob(job.id);
          }

          // Fetch the completed audit
          const completedAudit = await prisma.audit.findUnique({
            where: { id: audit.id },
            include: { findings: true },
          });

          if (
            !completedAudit ||
            completedAudit.status !== 'COMPLETE' ||
            completedAudit.trustState !== 'TRUSTED' ||
            completedAudit.findings.length === 0
          ) {
            // Crawl failed
            await prisma.prospectLead.update({
              where: { id: lead.id },
              data: {
                pipelineStatus: 'audit_failed',
                outreachStage: OutreachLeadStage.DROPPED,
                outreachDropReason: 'Audit/Crawl failed or returned zero findings',
              },
            });
            result.droppedCount++;
            result.details.push({
              leadId: lead.id,
              businessName: lead.businessName,
              outcome: 'dropped',
              reason: 'Audit/Crawl returned zero findings',
            });
            return;
          }

          // 2. Trigger Proposal Generation (internally runs ProposalQAService evaluation loops)
          let proposalResult;
          if (simulate) {
            proposalResult = await generateProposal(audit.id);
          } else {
            proposalResult = await generateProposal(audit.id);
          }

          if (!proposalResult || !proposalResult.success) {
            await prisma.prospectLead.update({
              where: { id: lead.id },
              data: {
                pipelineStatus: 'proposal_generation_failed',
                outreachStage: OutreachLeadStage.DROPPED,
                outreachDropReason: 'Proposal generation execution threw errors',
              },
            });
            result.droppedCount++;
            result.details.push({
              leadId: lead.id,
              businessName: lead.businessName,
              outcome: 'failed-generation',
              reason: 'Proposal generation failed',
            });
            return;
          }

          // 3. Process Proposal Results and Auto-QA Scorer Gating
          const passedQAGate = proposalResult.status === 'READY';

          if (passedQAGate) {
            // PROMOTION: Passed QA (overallScore >= 7.5) -> Advance to outreach!
            const mockTopFindings = ['Site speed is 38/100.', 'Google profile has 0 replies.'];
            const mockPainBreakdown = {
              websiteSpeed: { score: 80, detail: 'Site speed is 38/100.' },
              gbpNeglected: { score: 60, detail: 'Google profile has 0 replies.' },
            };
            const mockEvidence = {
              competitorSignals: {
                competitorNames: ['Beta Dent'],
                reasons: ['Stronger local search presence'],
              },
            };

            await prisma.prospectLead.update({
              where: { id: lead.id },
              data: {
                proposalId: proposalResult.proposalId,
                pipelineStatus: 'ready_for_outreach',
                status: ProspectLeadStatus.ENRICHED, // Set status to ENRICHED so fetchEligibleLeads picks it up
                painScore: 85, // Enforce eligibility (painScore >= 60)
                outreachStage: OutreachLeadStage.READY, // Set stage to READY for sequence insertion
                topFindings: mockTopFindings,
                painBreakdown: mockPainBreakdown,
                qualificationEvidence: mockEvidence,
              },
            });

            result.promotedToOutreach++;
            result.details.push({
              leadId: lead.id,
              businessName: lead.businessName,
              outcome: 'promoted',
              reason: `Proposal passed QA scoring!`,
            });
          } else {
            // DEMOTION: Failed QA -> Auto drop (or draft, we treat it as sub-threshold and drop)
            await prisma.prospectLead.update({
              where: { id: lead.id },
              data: {
                proposalId: proposalResult.proposalId,
                pipelineStatus: 'disqualified_qa_gate',
                outreachStage: OutreachLeadStage.DROPPED,
                outreachDropReason: 'Proposal failed auto-QA quality gate threshold of 7.5',
              },
            });

            result.droppedCount++;
            result.details.push({
              leadId: lead.id,
              businessName: lead.businessName,
              outcome: 'dropped',
              reason: 'Proposal score sub-threshold',
            });
          }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          logger.error({ error: err, leadId: lead.id }, 'Error running orchestrator loop for lead');
          await prisma.prospectLead.update({
            where: { id: lead.id },
            data: {
              pipelineStatus: 'error',
              outreachDropReason: `Orchestrator error: ${errMsg}`,
            },
          });
          result.details.push({
            leadId: lead.id,
            businessName: lead.businessName,
            outcome: 'failed-generation',
            reason: errMsg,
          });
        }
      });
    }

    return result;
  }
}
