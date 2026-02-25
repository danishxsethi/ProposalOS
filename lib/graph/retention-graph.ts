/**
 * Retention Graph - LangGraph Orchestrator
 * 
 * Manages the post-sale lifecycle including:
 * - Scheduled re-audits
 * - NPS surveys (Day 30, Day 90)
 * - Competitor monitoring for upsells
 * - Client engagement tracking
 */

import { StateGraph, Annotation } from "@langchain/langgraph";
import { prisma } from '@/lib/prisma';
import { processPendingNPSSurveys } from '@/lib/retention/nps-survey';
import { processCompetitorSignals } from '@/lib/retention/competitor-monitor';
import { processScheduledAudits } from '@/lib/retention/scheduled-audit-runner';

export const RetentionState = Annotation.Root({
  // Processing results
  npsResults: Annotation<{
    day30Processed: number;
    day90Processed: number;
    sent: number;
    errors: string[];
  } | null>({ reducer: (x, y) => y, default: () => null }),
  
  competitorResults: Annotation<{
    signalsDetected: number;
    upsellsTriggered: number;
    errors: string[];
  } | null>({ reducer: (x, y) => y, default: () => null }),
  
  scheduledAuditResults: Annotation<{
    auditsRun: number;
    comparisonsGenerated: number;
    errors: string[];
  } | null>({ reducer: (x, y) => y, default: () => null }),
  
  // Summary
  totalActions: Annotation<number>({ reducer: (x, y) => y, default: () => 0 }),
  summary: Annotation<string>({ reducer: (x, y) => y, default: () => '' }),
});

/**
 * Process NPS surveys (Day 30 and Day 90)
 */
async function process_nps(state: typeof RetentionState.State) {
  const results = await processPendingNPSSurveys();
  
  return {
    npsResults: results,
    totalActions: results.sent
  };
}

/**
 * Monitor competitors and trigger upsells
 */
async function monitor_competitors(state: typeof RetentionState.State) {
  const results = await processCompetitorSignals();
  
  return {
    competitorResults: results,
    totalActions: state.totalActions + results.upsellsTriggered
  };
}

/**
 * Run scheduled re-audits
 */
async function run_scheduled_audits(state: typeof RetentionState.State) {
  const results = await processScheduledAudits();
  
  return {
    scheduledAuditResults: results,
    totalActions: state.totalActions + results.auditsRun
  };
}

/**
 * Generate summary of all retention activities
 */
async function generate_summary(state: typeof RetentionState.State) {
  const parts: string[] = [];
  
  if (state.npsResults) {
    parts.push(`NPS: ${state.npsResults.sent} sent (Day30: ${state.npsResults.day30Processed}, Day90: ${state.npsResults.day90Processed})`);
  }
  
  if (state.competitorResults) {
    parts.push(`Competitor: ${state.competitorResults.signalsDetected} signals, ${state.competitorResults.upsellsTriggered} upsells triggered`);
  }
  
  if (state.scheduledAuditResults) {
    parts.push(`Scheduled Audits: ${state.scheduledAuditResults.auditsRun} run, ${state.scheduledAuditResults.comparisonsGenerated} comparisons`);
  }
  
  const summary = parts.length > 0 
    ? parts.join(' | ')
    : 'No retention actions needed';
  
  return { summary };
}

/**
 * Create the retention graph
 */
export const retentionGraph = new StateGraph(RetentionState)
  .addNode("process_nps", process_nps)
  .addNode("monitor_competitors", monitor_competitors)
  .addNode("run_scheduled_audits", run_scheduled_audits)
  .addNode("generate_summary", generate_summary)
  
  // Run all processes in parallel
  .addEdge("__start__", "process_nps")
  .addEdge("__start__", "monitor_competitors")
  .addEdge("__start__", "run_scheduled_audits")
  
  // Then generate summary
  .addEdge("process_nps", "generate_summary")
  .addEdge("monitor_competitors", "generate_summary")
  .addEdge("run_scheduled_audits", "generate_summary")
  
  .addEdge("generate_summary", "__end__")
  .compile();

/**
 * Main entry point - run all retention processes
 */
export async function runRetentionWorkflow(): Promise<{
  nps: { sent: number; errors: string[] };
  competitor: { signals: number; upsells: number; errors: string[] };
  scheduledAudits: { run: number; comparisons: number; errors: string[] };
  totalActions: number;
  summary: string;
}> {
  // Run all three processes
  const [npsResult, competitorResult, auditResult] = await Promise.all([
    processPendingNPSSurveys(),
    processCompetitorSignals(),
    processScheduledAudits()
  ]);

  const totalActions = npsResult.sent + competitorResult.upsellsTriggered + auditResult.auditsRun;
  
  const summary = [
    npsResult.sent > 0 ? `${npsResult.sent} NPS surveys sent` : null,
    competitorResult.upsellsTriggered > 0 ? `${competitorResult.upsellsTriggered} upsells triggered` : null,
    auditResult.auditsRun > 0 ? `${auditResult.auditsRun} scheduled audits run` : null,
  ].filter(Boolean).join(', ') || 'No retention actions needed';

  return {
    nps: {
      sent: npsResult.sent,
      errors: npsResult.errors
    },
    competitor: {
      signals: competitorResult.signalsDetected,
      upsells: competitorResult.upsellsTriggered,
      errors: competitorResult.errors
    },
    scheduledAudits: {
      run: auditResult.auditsRun,
      comparisons: auditResult.comparisonsGenerated,
      errors: auditResult.errors
    },
    totalActions,
    summary
  };
}

/**
 * Get retention status for a specific client/proposal
 */
export async function getClientRetentionStatus(proposalId: string) {
  const proposal = await prisma.proposal.findUnique({
    where: { id: proposalId },
    include: {
      audit: {
        include: {
          findings: true
        }
      },
      emailSequence: true
    }
  });

  if (!proposal) {
    return null;
  }

  const acceptance = await prisma.proposalAcceptance.findUnique({
    where: { proposalId }
  });

  const daysSinceAcceptance = acceptance 
    ? Math.floor((Date.now() - new Date(acceptance.acceptedAt).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  // Check if NPS surveys are due (NPS model not in schema - return default)
  const npsStatus = {
    day30Due: daysSinceAcceptance !== null && daysSinceAcceptance >= 30 && daysSinceAcceptance <= 31,
    day90Due: daysSinceAcceptance !== null && daysSinceAcceptance >= 90 && daysSinceAcceptance <= 91,
    day30Completed: false,
    day90Completed: false
  };

  // Stub: scheduledAudits and competitorSignal models not in schema
  const scheduledAudits: any[] = [];
  const competitorSignals: any[] = [];

  return {
    proposalId: proposal.id,
    businessName: proposal.audit.businessName,
    acceptedAt: acceptance?.acceptedAt,
    daysSinceAcceptance,
    npsStatus,
    scheduledAudits,
    competitorSignals,
    emailSequence: proposal.emailSequence ? {
      emailsSent: (proposal.emailSequence.emails as any[]).filter((e: any) => e.status === 'sent').length,
      totalEmails: (proposal.emailSequence.emails as any[]).length
    } : null
  };
}
