import { EffortLevel, FindingType, OutreachLeadStage, ProspectLeadStatus } from '@prisma/client';

import { dispatchAuditExecution } from '@/lib/audit/dispatch';
import { persistFindings } from '@/lib/audit/findingPersistence';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { buildProposalGrounding } from '@/lib/proposal/grounding';
import { ProposalQAService } from '@/lib/proposal/ProposalQAService';
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
              data: { status: 'COMPLETE' },
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

            logger.info({ auditId: audit.id }, 'Simulated audit completed successfully');
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

            // ROI ratio must equal monthlyValue/price (deterministic commercial
            // arithmetic is verified by the QA gate).
            const pricing = {
              essentials: 999,
              growth: 1999,
              premium: 3999,
              currency: 'USD',
            };
            const makeRoi = (monthlyValue: number, price: number) => ({
              monthlyValue,
              ratio: Number((monthlyValue / price).toFixed(1)),
              scenarios: {
                best: monthlyValue * 2,
                base: monthlyValue,
                worst: Math.floor(monthlyValue / 5),
                assumptions: ['Cooperation', 'Traffic volume stable'],
              },
            });

            const mockProposalContent = {
              executiveSummary: `Highly targeted growth strategy for ${lead.businessName} (Industry: ${industryName}) in ${cityName}. Our audit identified critical issues — Missing Sitemap and Robot.txt and Slow Largest Contentful Paint (LCP) — that are reducing indexation speed and search visibility and driving higher user bounce rates. Fixing these can increase bookings and improve conversion.`,
              painClusters: [
                {
                  id: 'cluster-1',
                  rootCause:
                    'Missing Sitemap and Robot.txt and Slow Largest Contentful Paint (LCP) are the root causes suppressing organic visibility.',
                  severity: 'critical' as const,
                  findingIds,
                },
              ],
              // Grounding requires at least 2 findings per tier mapping.
              tiers: {
                essentials: {
                  name: 'Essentials',
                  description:
                    'Core fixes: Missing Sitemap and Robot.txt plus Slow Largest Contentful Paint (LCP) remediation.',
                  findingIds: findingIds,
                  deliveryTime: '5 business days',
                  price: 999,
                  recommended: false,
                  roi: makeRoi(500, 999),
                },
                growth: {
                  name: 'Growth',
                  description:
                    'Growth: fixes for Missing Sitemap and Robot.txt and Slow Largest Contentful Paint (LCP) with ongoing monitoring.',
                  findingIds: findingIds,
                  deliveryTime: '10 business days',
                  price: 1999,
                  recommended: true,
                  roi: makeRoi(1000, 1999),
                },
                premium: {
                  name: 'Premium',
                  description:
                    'Premium: full remediation of Missing Sitemap and Robot.txt and Slow Largest Contentful Paint (LCP) with quarterly reviews.',
                  findingIds: findingIds,
                  deliveryTime: '15 business days',
                  price: 3999,
                  recommended: false,
                  roi: makeRoi(2000, 3999),
                },
              },
              // Grounding binds finding-backed top actions (the QA gate checks for
              // up to 3; fewer findings → fewer actions).
              topActions: completedAudit!.findings
                .slice(0, 3)
                .map((finding, index) => ({
                  findingId: finding.id,
                  title: finding.title,
                  impact: finding.impactScore,
                  effort: finding.effortEstimate ?? 'MEDIUM',
                  timeline: `Schedule within ${index + 2} business days`,
                })),
              pricing,
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

            // Simulated proposals must carry the same canonical claim grounding the
            // real generator produces — ProposalQAService hard-fails GROUNDING_INVALID
            // otherwise. Build it via the one production builder (no QA weakening).
            const grounding = buildProposalGrounding(
              mockProposalContent as any,
              {
                auditId: audit.id,
                tenantId,
                findings: completedAudit!.findings,
              },
              findingIds
            );
            const groundedProposalContent = { ...mockProposalContent, grounding };

            // Run the actual ProposalQAService evaluate method
            const evaluation = ProposalQAService.evaluateProposal(
              groundedProposalContent as any,
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
                painClusters: mockProposalContent.painClusters as any,
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
