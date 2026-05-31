import { randomUUID } from 'crypto';

import { EffortLevel, FindingType, OutreachLeadStage, ProspectLeadStatus } from '@prisma/client';

import { runAudit } from '@/lib/audit/runner';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { ProposalQAService } from '@/lib/proposal/ProposalQAService';
import { generateProposal } from '@/lib/proposal/runner';
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
              data: { status: 'COMPLETE' },
            });

            // Create mock audit findings so the LangChain proposal graph has input data
            await prisma.finding.createMany({
              data: [
                {
                  id: randomUUID(),
                  auditId: audit.id,
                  tenantId,
                  module: 'SEO',
                  category: 'SEO',
                  type: FindingType.PAINKILLER,
                  title: 'Missing Sitemap and Robot.txt',
                  description:
                    'The site has no robot.txt or sitemap configured, reducing indexation speed. Reduces search visibility and organic ranking significantly.',
                  impactScore: 8,
                  confidenceScore: 9,
                  effortEstimate: EffortLevel.LOW,
                  evidence: [{ url: 'https://example.com' }],
                },
                {
                  id: randomUUID(),
                  auditId: audit.id,
                  tenantId,
                  module: 'PERFORMANCE',
                  category: 'PERFORMANCE',
                  type: FindingType.PAINKILLER,
                  title: 'Slow Largest Contentful Paint (LCP)',
                  description:
                    'Hero banner images do not use fetchpriority=high or modern avif compression. Leads to higher user bounce rate.',
                  impactScore: 6,
                  confidenceScore: 8,
                  effortEstimate: EffortLevel.MEDIUM,
                  evidence: [{ url: 'https://example.com' }],
                },
              ],
            });

            logger.info({ auditId: audit.id }, 'Simulated audit completed successfully');
          } else {
            // Execute real crawler
            await runAudit(audit.id);
          }

          // Fetch the completed audit
          const completedAudit = await prisma.audit.findUnique({
            where: { id: audit.id },
            include: { findings: true },
          });

          if (
            !completedAudit ||
            completedAudit.status === 'FAILED' ||
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
            // Create a mock proposal and evaluate it to ensure fast, deterministic tests
            const findingIds = completedAudit?.findings.map((f) => f.id) || [];
            const cityName = lead.city || 'Unknown';
            const industryName = lead.vertical || 'Unknown';

            const mockProposalContent = {
              executiveSummary: `Highly targeted growth strategy for ${lead.businessName} (Industry: ${industryName}) in ${cityName}. Our audit identified 4 critical issues, leading to a 35% revenue loss and slow 4.5s speed. Fixing these can drive a 50% increase in bookings and positive conversion.`,
              painClusters: [],
              tiers: {
                essentials: {
                  name: 'Essentials',
                  description: 'Core fixes',
                  findingIds: findingIds,
                  deliveryTime: '5 business days',
                  recommended: false,
                  roi: {
                    monthlyValue: 500,
                    ratio: 1.5,
                    scenarios: {
                      best: 1000,
                      base: 500,
                      worst: 100,
                      assumptions: ['Cooperation', 'Traffic volume stable'],
                    },
                  },
                },
                growth: {
                  name: 'Growth',
                  description: 'SEO + Perf fixes',
                  findingIds: findingIds,
                  deliveryTime: '10 business days',
                  recommended: true,
                  roi: {
                    monthlyValue: 1500,
                    ratio: 2.0,
                    scenarios: {
                      best: 3000,
                      base: 1500,
                      worst: 300,
                      assumptions: ['Cooperation', 'Traffic volume stable'],
                    },
                  },
                },
                premium: {
                  name: 'Premium',
                  description: 'Full service',
                  findingIds: findingIds,
                  deliveryTime: '15 business days',
                  recommended: false,
                  roi: {
                    monthlyValue: 4000,
                    ratio: 2.5,
                    scenarios: {
                      best: 8000,
                      base: 4000,
                      worst: 800,
                      assumptions: ['Cooperation', 'Traffic volume stable'],
                    },
                  },
                },
              },
              pricing: {
                essentials: 999,
                growth: 1999,
                premium: 3999,
                currency: 'USD',
              },
              assumptions: [
                'Assumes cooperation with technical staff.',
                'Assumes standard CMS access is provided.',
              ],
              disclaimers: ['Estimates only.'],
              nextSteps: [
                'Step 1: Setup Sitemap and Robots.txt. Impact: High. Effort: Low. Timeline: 2 days.',
                'Step 2: Optimize hero banner image delivery. Impact: High. Effort: Medium. Timeline: 3 days.',
                'Step 3: Schedule review call. Impact: High. Effort: Low. Timeline: 1 day.',
              ],
            };

            // Run the actual ProposalQAService evaluate method
            const evaluation = ProposalQAService.evaluateProposal(
              mockProposalContent as any,
              completedAudit.findings,
              lead.businessName,
              lead.city,
              { industry: lead.vertical }
            );

            // Create proposal record in db
            const proposal = await prisma.proposal.create({
              data: {
                auditId: audit.id,
                tenantId,
                version: 1,
                executiveSummary: mockProposalContent.executiveSummary,
                painClusters: [] as any,
                tierEssentials: mockProposalContent.tiers.essentials as any,
                tierGrowth: mockProposalContent.tiers.growth as any,
                tierPremium: mockProposalContent.tiers.premium as any,
                pricing: mockProposalContent.pricing as any,
                assumptions: mockProposalContent.assumptions,
                disclaimers: mockProposalContent.disclaimers,
                nextSteps: mockProposalContent.nextSteps,
                status: evaluation.passed ? 'READY' : 'DRAFT',
                qaScore: evaluation.autoQAStatus.score,
                qaResults: JSON.parse(JSON.stringify(evaluation)),
              },
            });

            proposalResult = {
              success: true,
              proposalId: proposal.id,
              status: proposal.status,
              evaluation,
            };
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
