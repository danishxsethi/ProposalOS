import { Annotation, StateGraph } from '@langchain/langgraph';

import { Finding } from '@/lib/diagnosis/types';
import { adversarialQAGraph } from '@/lib/graph/adversarial-qa-graph';
import { runPredictiveAgent } from '@/lib/graph/predictive-graph';
import { logger } from '@/lib/logger';
import { inferOrganizationSegment, OrganizationSegment } from '@/lib/proposal';
import { proposalCache } from '@/lib/proposal/caching';
import { generateExecutiveSummary } from '@/lib/proposal/executiveSummary';
import { ProposalLLMOrchestrator } from '@/lib/proposal/llm-orchestrator';
import { getPricing } from '@/lib/proposal/pricing';
import { calculateTierROI } from '@/lib/proposal/roiCalculator';
import { FindingRuntime, validateCompleteProposal } from '@/lib/proposal/schemas';
import { mapToTiers } from '@/lib/proposal/tierMapping';
import { ProposalResult, TierConfig } from '@/lib/proposal/types';
import {
  generateAssumptions,
  generateDisclaimers,
  generateNextSteps,
  validateCitations,
} from '@/lib/proposal/validation';
import { computeHallucinationScore, logQATelemetry } from '@/lib/qa/telemetry';

const MAX_QA_RETRIES = 2;
export const PROPOSAL_GRAPH_TIMEOUT_MS = 90_000;

export const ProposalState = Annotation.Root({
  businessName: Annotation<string>({ reducer: (x, y) => y }),
  businessIndustry: Annotation<string | undefined>({ reducer: (x, y) => y }),
  businessUrl: Annotation<string | undefined>({ reducer: (x, y) => y }),
  segment: Annotation<OrganizationSegment | undefined>({ reducer: (x, y) => y }),
  clusters: Annotation<any[]>({ reducer: (x, y) => y, default: () => [] }),
  findings: Annotation<Finding[]>({ reducer: (x, y) => y, default: () => [] }),
  tierMapping: Annotation<any>({ reducer: (x, y) => y }),
  pricing: Annotation<any>({ reducer: (x, y) => y }),
  tiers: Annotation<any>({ reducer: (x, y) => y }),
  executiveSummary: Annotation<string>({ reducer: (x, y) => y }),
  proposalDef: Annotation<any>({ reducer: (x, y) => y }),
  validation: Annotation<any>({ reducer: (x, y) => y }),
  tenantId: Annotation<string | undefined>({ reducer: (x, y) => y }),
  auditId: Annotation<string | undefined>({ reducer: (x, y) => y }),
  proposalId: Annotation<string | undefined>({ reducer: (x, y) => y }),
  // QA retry tracking
  qaRetryCount: Annotation<number>({ reducer: (x, y) => y, default: () => 0 }),
  // Last QA score (threaded through state for deterministic routing)
  lastQaScore: Annotation<number>({ reducer: (x, y) => y, default: () => 0 }),
  // Evidence snapshots for QA grounding (P0-1: passed from diagnosis)
  evidenceSnapshots: Annotation<any[]>({ reducer: (x, y) => y, default: () => [] }),
  // Predictive Outlook (optional — populated when auditId is present)
  predictiveOutlookMarkdown: Annotation<string>({ reducer: (x, y) => y, default: () => '' }),
  // P0-2: Accumulated node errors — never causes 500, surfaced in final state
  errors: Annotation<NodeError[]>({
    reducer: (x, y) => [...(x ?? []), ...(y ?? [])],
    default: () => [],
  }),
  // Enhanced state for improved proposal generation
  completeProposal: Annotation<ProposalResult>({ reducer: (x, y) => y }),
  sectionGenerationStatus: Annotation<Record<string, boolean>>({
    reducer: (x, y) => y,
    default: () => ({}),
  }),
});

type State = typeof ProposalState.State;

// ─── Node error record ────────────────────────────────────────────────────────
interface NodeError {
  node: string;
  error: string;
  timestamp: string;
}

function nodeError(node: string, error: unknown): NodeError {
  return { node, error: String(error), timestamp: new Date().toISOString() };
}

async function map_to_tiers(state: typeof ProposalState.State) {
  try {
    const mapping = mapToTiers(state.clusters, state.findings);
    const segment = inferOrganizationSegment(
      (state as any).businessUrl,
      state.businessName,
      state.businessIndustry
    );
    return { tierMapping: mapping, segment };
  } catch (error) {
    logger.error({ error }, '[ProposalGraph] map_to_tiers failed');
    return {
      tierMapping: { essentials: [], growth: [], premium: [] },
      errors: [nodeError('map_to_tiers', error)],
    };
  }
}

async function calculate_pricing(state: typeof ProposalState.State) {
  try {
    const industryPricing = getPricing({
      industry: state.businessIndustry || null,
      segment: (state as any).segment,
    } as any);
    return {
      pricing: {
        essentials: industryPricing.essentials,
        growth: industryPricing.growth,
        premium: industryPricing.premium,
        currency: 'USD',
      },
    };
  } catch (error) {
    logger.error({ error }, '[ProposalGraph] calculate_pricing failed');
    return {
      pricing: {
        essentials: 0,
        growth: 0,
        premium: 0,
        currency: 'USD',
      },
      errors: [nodeError('calculate_pricing', error)],
    };
  }
}

async function generate_complete_proposal(state: typeof ProposalState.State) {
  try {
    const orchestrator = new ProposalLLMOrchestrator();

    const completeProposal = await proposalCache.cacheSectionGeneration(
      state.businessName,
      state.businessIndustry,
      state.clusters,
      state.findings,
      'complete_proposal',
      () =>
        orchestrator.generateCompleteProposal(
          state.businessName,
          state.businessIndustry,
          state.clusters,
          state.findings,
          { segment: (state as any).segment }
        )
    );

    // Validate the complete proposal
    const validation = validateCompleteProposal(
      completeProposal,
      state.findings as unknown as FindingRuntime[]
    );

    return {
      completeProposal,
      sectionGenerationStatus: {
        executiveSummary: !!completeProposal.executiveSummary,
        pricing: !!completeProposal.pricing,
        assumptions: !!completeProposal.assumptions,
        disclaimers: !!completeProposal.disclaimers,
        nextSteps: !!completeProposal.nextSteps,
        tiers: !!completeProposal.tiers,
      },
      validation: validation.proposalValidation,
    };
  } catch (error) {
    logger.error({ error }, '[ProposalGraph] generate_complete_proposal failed');
    return {
      completeProposal: {
        executiveSummary: `Failed to generate complete proposal: ${String(error)}`,
        painClusters: state.clusters,
        tiers: {
          essentials: {
            name: 'Starter',
            findingIds: [],
            deliveryTime: '5 business days',
            price: 0,
            badge: 'FAILED',
          },
          growth: {
            name: 'Growth',
            findingIds: [],
            deliveryTime: '10 business days',
            price: 0,
            recommended: true,
          },
          premium: {
            name: 'Premium',
            findingIds: [],
            deliveryTime: '15 business days',
            price: 0,
            badge: 'FAILED',
          },
        },
        pricing: { essentials: 0, growth: 0, premium: 0, currency: 'USD' },
        assumptions: [`Error occurred during proposal generation: ${String(error)}`],
        disclaimers: ['Proposal generation failed - please review manually'],
        nextSteps: ['Contact support to regenerate proposal'],
      },
      errors: [nodeError('generate_complete_proposal', error)],
    };
  }
}

async function draft_proposal(state: typeof ProposalState.State) {
  try {
    // Use cached complete proposal if available, otherwise fall back to old method
    if (state.completeProposal?.executiveSummary) {
      return { executiveSummary: state.completeProposal.executiveSummary };
    }

    const executiveSummary = await generateExecutiveSummary(
      state.businessName,
      state.clusters,
      state.findings,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined
    );
    return { executiveSummary };
  } catch (error) {
    logger.error({ error }, '[ProposalGraph] draft_proposal failed');
    return {
      executiveSummary: `Failed to generate executive summary: ${String(error)}`,
      errors: [nodeError('draft_proposal', error)],
    };
  }
}

async function generate_roi_model(state: typeof ProposalState.State) {
  try {
    const findingsMap = new Map(state.findings.map((f: any) => [f.id, f]));
    const getTierFindings = (ids: string[]) =>
      ids.map((id) => findingsMap.get(id)).filter((f): f is Finding => !!f);

    const essentialsRoi = calculateTierROI(
      getTierFindings(state.tierMapping.essentials),
      state.pricing.essentials,
      state.businessIndustry,
      state.findings
    );
    const growthRoi = calculateTierROI(
      getTierFindings(state.tierMapping.growth),
      state.pricing.growth,
      state.businessIndustry,
      state.findings
    );
    const premiumRoi = calculateTierROI(
      getTierFindings(state.tierMapping.premium),
      state.pricing.premium,
      state.businessIndustry,
      state.findings
    );

    const tiers = {
      essentials: {
        name: 'Starter',
        price: state.pricing.essentials,
        roi: { monthlyValue: essentialsRoi.totalMonthlyValue, ratio: essentialsRoi.ratio },
      },
      growth: {
        name: 'Growth',
        price: state.pricing.growth,
        roi: { monthlyValue: growthRoi.totalMonthlyValue, ratio: growthRoi.ratio },
      },
      premium: {
        name: 'Premium',
        price: state.pricing.premium,
        roi: { monthlyValue: premiumRoi.totalMonthlyValue, ratio: premiumRoi.ratio },
      },
    };
    return { tiers };
  } catch (error) {
    logger.error({ error }, '[ProposalGraph] generate_roi_model failed');
    return {
      tiers: {
        essentials: { name: 'Starter', price: 0, roi: { monthlyValue: 0, ratio: 0 } },
        growth: { name: 'Growth', price: 0, roi: { monthlyValue: 0, ratio: 0 } },
        premium: { name: 'Premium', price: 0, roi: { monthlyValue: 0, ratio: 0 } },
      },
      errors: [nodeError('generate_roi_model', error)],
    };
  }
}

async function validate_claims(state: typeof ProposalState.State) {
  try {
    const proposalToValidate = state.completeProposal || {
      executiveSummary: state.executiveSummary,
      painClusters: state.clusters,
      tiers: state.tiers,
      pricing: state.pricing,
    };

    const validation = validateCitations(proposalToValidate, state.findings);
    return { validation };
  } catch (error) {
    logger.error({ error }, '[ProposalGraph] validate_claims failed');
    return {
      validation: { valid: false, errors: [`Validation failed: ${String(error)}`] },
      errors: [nodeError('validate_claims', error)],
    };
  }
}

async function apply_tone(state: typeof ProposalState.State) {
  try {
    return {};
  } catch (error) {
    logger.error({ error }, '[ProposalGraph] apply_tone failed');
    return {
      errors: [nodeError('apply_tone', error)],
    };
  }
}

async function adversarial_qa(state: State) {
  // Validate all proposal claims are backed by findings + ROI math is consistent
  const content = [
    state.completeProposal?.executiveSummary || state.executiveSummary,
    JSON.stringify(state.completeProposal?.tiers || state.tiers),
    JSON.stringify(state.completeProposal?.pricing || state.pricing),
  ].join('\n---\n');

  const result = await adversarialQAGraph.invoke({
    content,
    findings: state.findings,
    rawEvidence: state.evidenceSnapshots ?? [],
    tenantId: state.tenantId || 'unknown',
    auditId: state.auditId || 'unknown',
    proposalId: state.proposalId || 'unknown',
    runType: 'proposal',
  });

  const qaScore = computeHallucinationScore(
    result.hallucinationFlags ?? [],
    result.consistencyFlags ?? []
  );

  const retryTriggered = qaScore > 0.3 && state.qaRetryCount < MAX_QA_RETRIES;

  // Log structured telemetry (fire-and-forget)
  await logQATelemetry({
    graphName: 'proposal',
    content,
    qaResult: result,
    retryTriggered,
    retryCount: state.qaRetryCount,
    tenantId: state.tenantId,
    auditId: state.auditId,
    proposalId: state.proposalId,
  });

  if (retryTriggered) {
    logger.warn(
      { qaScore, qaRetryCount: state.qaRetryCount + 1 },
      '[ProposalGraph] QA hallucination score > 0.3 — triggering QA retry'
    );
  } else if ((result.hallucinationFlags?.length ?? 0) > 0) {
    logger.warn(
      { qaScore, flags: result.hallucinationFlags?.length ?? 0 },
      '[ProposalGraph] Hallucination flag(s) within threshold, proceeding'
    );
  }

  return {
    executiveSummary: result.hardenedContent || state.executiveSummary,
    qaRetryCount: retryTriggered ? state.qaRetryCount + 1 : state.qaRetryCount,
    lastQaScore: qaScore,
  };
}

/** Routes after QA: retry proposal generation if score > 0.3 and within retry budget. */
function route_qa(state: State): string {
  const HALLUCINATION_THRESHOLD = 0.3;
  const qaScore = state.lastQaScore ?? 0;

  if (qaScore > HALLUCINATION_THRESHOLD) {
    // Deterministic terminal routing when cap is hit
    if ((state.qaRetryCount ?? 0) >= MAX_QA_RETRIES) {
      logger.warn(
        { maxRetries: MAX_QA_RETRIES },
        '[ProposalGraph] QA retry cap reached; routing to format_output'
      );
      return 'format_output';
    }

    return 'generate_complete_proposal';
  }

  return 'format_output';
}

async function format_output(state: typeof ProposalState.State) {
  try {
    const proposalDef = state.completeProposal || {
      executiveSummary: state.executiveSummary,
      painClusters: state.clusters,
      tiers: state.tiers,
      pricing: state.pricing,
      assumptions: generateAssumptions(state.businessName),
      disclaimers: generateDisclaimers(),
      nextSteps: generateNextSteps([]),
    };
    return { proposalDef };
  } catch (error) {
    logger.error({ error }, '[ProposalGraph] format_output failed');
    return {
      proposalDef: {
        executiveSummary: state.executiveSummary || '',
        painClusters: state.clusters || [],
        tiers: state.tiers || {},
        pricing: state.pricing || {},
        assumptions: [],
        disclaimers: [],
        nextSteps: [],
      },
      errors: [nodeError('format_output', error)],
    };
  }
}

async function visual_annotation(state: typeof ProposalState.State) {
  try {
    // Look for vision module evidence within findings to extract screenshots
    const visualEvidenceList: {
      screenshotUrl: string;
      annotationText: string;
      findingRef: string;
      severity: number;
    }[] = [];

    for (const finding of state.findings) {
      if (!finding.evidence || !Array.isArray(finding.evidence)) continue;

      for (const ev of finding.evidence as any[]) {
        // Our target is vision module output which commonly embeds URLs
        // Fallback to checking raw contents if explicit type is missing
        const url =
          ev.url || ev.raw?.url || ev.raw?.screenshotUrl || (ev.type === 'image' ? ev.value : null);
        if (url && typeof url === 'string' && url.startsWith('http')) {
          visualEvidenceList.push({
            screenshotUrl: url,
            annotationText: finding.description || `Visual evidence for ${finding.title}`,
            findingRef: finding.id,
            severity: finding.impactScore || 5,
          });
        }
        // Stop early if we have enough screenshots for this finding
        if (visualEvidenceList.filter((v) => v.findingRef === finding.id).length >= 1) break;
      }
    }

    // Sort globally by impact severity (descending)
    visualEvidenceList.sort((a, b) => b.severity - a.severity);

    // Limit to the top 3 overall visual evidence items to avoid cluttering the proposal
    const topVisuals = visualEvidenceList.slice(0, 3);

    // Inject the visual evidence into the tiers object directly as it is mapped
    const updatedTiers = { ...state.tiers };

    if (topVisuals.length > 0) {
      // Embed the same visuals into each tier for consistency, or map them if findingIds match
      const embedIntoTier = (tierName: 'essentials' | 'growth' | 'premium') => {
        if (updatedTiers[tierName]) {
          const tier = updatedTiers[tierName];
          tier.visualEvidence = topVisuals.filter(
            (v) => tier.findingIds?.includes(v.findingRef) || tier.findings?.includes(v.findingRef)
          );
          // If filtering by mapped findingIds returns empty but we have visuals, fallback to globally showing top ones
          if (tier.visualEvidence.length === 0) {
            tier.visualEvidence = topVisuals;
          }
        }
      };

      embedIntoTier('essentials');
      embedIntoTier('growth');
      embedIntoTier('premium');
    }

    return { tiers: updatedTiers };
  } catch (error) {
    logger.error({ error }, '[ProposalGraph] visual_annotation failed');
    return {
      tiers: state.tiers || {},
      errors: [nodeError('visual_annotation', error)],
    };
  }
}

/**
 * Optional node: runs the Predictive Intelligence graph (Pipeline 12) to generate
 * a "Predictive Outlook" markdown section to include in the proposal.
 * Skipped gracefully if no auditId is available.
 */
async function predict_outlook(state: typeof ProposalState.State) {
  if (!state.auditId) {
    return { predictiveOutlookMarkdown: '' };
  }
  try {
    const outlook = await runPredictiveAgent({
      auditId: state.auditId,
      tenantId: state.tenantId || 'unknown',
      businessName: state.businessName,
      businessUrl: (state as any).businessUrl || '',
      businessIndustry: state.businessIndustry,
    });
    return { predictiveOutlookMarkdown: outlook };
  } catch (error) {
    logger.error({ error }, '[ProposalGraph] predict_outlook failed (non-blocking)');
    return { predictiveOutlookMarkdown: '' };
  }
}

export const proposalGraph = new StateGraph(ProposalState)
  .addNode('map_to_tiers', map_to_tiers)
  .addNode('calculate_pricing', calculate_pricing)
  .addNode('generate_complete_proposal', generate_complete_proposal)
  .addNode('visual_annotation', visual_annotation)
  .addNode('draft_proposal', draft_proposal)
  .addNode('generate_roi_model', generate_roi_model)
  .addNode('validate_claims', validate_claims)
  .addNode('apply_tone', apply_tone)
  .addNode('adversarial_qa', adversarial_qa)
  .addNode('format_output', format_output)
  .addNode('predict_outlook', predict_outlook)
  .addEdge('__start__', 'map_to_tiers')
  .addEdge('map_to_tiers', 'calculate_pricing')
  .addEdge('calculate_pricing', 'generate_complete_proposal')
  .addEdge('generate_complete_proposal', 'draft_proposal')
  .addEdge('draft_proposal', 'generate_roi_model')
  .addEdge('generate_roi_model', 'visual_annotation')
  .addEdge('visual_annotation', 'validate_claims')
  .addEdge('validate_claims', 'apply_tone')
  .addEdge('apply_tone', 'adversarial_qa')
  .addConditionalEdges('adversarial_qa', route_qa, {
    generate_complete_proposal: 'generate_complete_proposal',
    format_output: 'format_output',
  })
  .addEdge('format_output', 'predict_outlook')
  .addEdge('predict_outlook', '__end__')
  .compile();

/**
 * Canonical proposal graph invocation with intrinsic timeout safety.
 * This guard applies regardless of call site.
 */
export async function invokeProposalGraphWithTimeout(
  initialState: Partial<State>,
  timeoutMs: number = PROPOSAL_GRAPH_TIMEOUT_MS
): Promise<State> {
  const controller = new AbortController();

  let timeoutId: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Error(`PROPOSAL_GRAPH_TIMEOUT: exceeded ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      proposalGraph.invoke(initialState as State, { signal: controller.signal } as any),
      timeoutPromise,
    ]);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('PROPOSAL_GRAPH_TIMEOUT')) {
      logger.error(
        { timeoutMs, error },
        '[ProposalGraph] Timed out — returning fallback proposal state'
      );

      const fallbackPricing = initialState.pricing ?? {
        essentials: 0,
        growth: 0,
        premium: 0,
        currency: 'USD',
      };

      const fallbackTiers = initialState.tiers ?? {
        essentials: {
          name: 'Starter',
          price: fallbackPricing.essentials,
          roi: { monthlyValue: 0, ratio: 0 },
        },
        growth: {
          name: 'Growth',
          price: fallbackPricing.growth,
          roi: { monthlyValue: 0, ratio: 0 },
        },
        premium: {
          name: 'Premium',
          price: fallbackPricing.premium,
          roi: { monthlyValue: 0, ratio: 0 },
        },
      };

      return {
        businessName: initialState.businessName ?? 'Unknown Business',
        businessIndustry: initialState.businessIndustry,
        clusters: initialState.clusters ?? [],
        findings: initialState.findings ?? [],
        tierMapping: initialState.tierMapping ?? { essentials: [], growth: [], premium: [] },
        pricing: fallbackPricing,
        tiers: fallbackTiers,
        executiveSummary:
          initialState.executiveSummary ??
          'Proposal generation timed out before completion. Please review manually.',
        proposalDef: initialState.proposalDef ?? {
          executiveSummary:
            initialState.executiveSummary ??
            'Proposal generation timed out before completion. Please review manually.',
          painClusters: initialState.clusters ?? [],
          tiers: fallbackTiers,
          pricing: fallbackPricing,
          assumptions: generateAssumptions(initialState.businessName ?? 'Unknown Business'),
          disclaimers: generateDisclaimers(),
          nextSteps: generateNextSteps([]),
          timeout: true,
        },
        validation: initialState.validation,
        tenantId: initialState.tenantId,
        auditId: initialState.auditId,
        proposalId: initialState.proposalId,
        qaRetryCount: initialState.qaRetryCount ?? 0,
        lastQaScore: initialState.lastQaScore ?? 0,
        predictiveOutlookMarkdown: initialState.predictiveOutlookMarkdown ?? '',
        completeProposal: initialState.completeProposal,
        sectionGenerationStatus: initialState.sectionGenerationStatus ?? {},
      } as State;
    }

    throw error;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
