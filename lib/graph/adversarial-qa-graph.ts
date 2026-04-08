import { StateGraph, Annotation } from "@langchain/langgraph";
import { Finding } from '@prisma/client';
import { scoreConfidence, softenLanguage } from '@/lib/delivery/confidenceScorer';
import { prisma } from '@/lib/prisma';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getThinkingBudgetForNode } from '@/lib/config/thinking-budgets';
import { logger } from '@/lib/logger';
import { CostTracker } from '@/lib/costs/costTracker';

// P1-1 fix: Model resolved from env var — no more hardcoded experimental model name.
// Set ADVERSARIAL_QA_MODEL in .env (default: gemini-2.0-flash — stable + cost-tracked).
const ADVERSARIAL_QA_MODEL = process.env.ADVERSARIAL_QA_MODEL ?? 'gemini-2.0-flash';

export interface HallucinationFlag {
  claim: string;
  location: string;
  reason: string;
}

export interface ConsistencyFlag {
  type: string;
  conflictingElements: string[];
  suggestion: string;
}

export interface CompetitorFairnessFlag {
  claim: string;
  issue: string;
  suggestion: string;
}

export const AdversarialQAState = Annotation.Root({
  content: Annotation<string>({
    reducer: (x, y) => y,
    default: () => ""
  }),
  findings: Annotation<Finding[]>({
    reducer: (x, y) => y,
    default: () => []
  }),
  rawEvidence: Annotation<any[]>({
    reducer: (x, y) => y,
    default: () => []
  }),
  comparisonReport: Annotation<any>({
    reducer: (x, y) => y,
    default: () => undefined
  }),
  hallucinationFlags: Annotation<HallucinationFlag[]>({
    reducer: (x, y) => y,
    default: () => []
  }),
  consistencyFlags: Annotation<ConsistencyFlag[]>({
    reducer: (x, y) => y,
    default: () => []
  }),
  competitorFlags: Annotation<CompetitorFairnessFlag[]>({
    reducer: (x, y) => y,
    default: () => []
  }),
  confidenceScores: Annotation<Record<string, string>>({
    reducer: (x, y) => y,
    default: () => ({})
  }),
  hardenedContent: Annotation<string>({
    reducer: (x, y) => y,
    default: () => ""
  }),
  tenantId: Annotation<string>({ reducer: (x, y) => y }),
  auditId: Annotation<string>({ reducer: (x, y) => y }),
  proposalId: Annotation<string>({ reducer: (x, y) => y }),
  runType: Annotation<'diagnosis' | 'proposal'>({ reducer: (x, y) => y }),
});

type QAState = typeof AdversarialQAState.State;

// ─── Helper ───────────────────────────────────────────────────────────────────
function getModel() {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) return null;
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({ model: ADVERSARIAL_QA_MODEL });
}

// ─── Nodes (P0-2: all 4 nodes wrapped in try/catch) ────────────────────────────

// Helper for cost calculation since estimateCostCents isn't directly imported here
function trackCost(costTracker: CostTracker | undefined, result: any) {
  if (costTracker && result.response.usageMetadata) {
    const usage = result.response.usageMetadata;
    // rough default estimate, real ones use getEstimate
    costTracker.addLlmCall(
      ADVERSARIAL_QA_MODEL as any,
      usage.promptTokenCount || 0,
      usage.candidatesTokenCount || 0,
      0
    );
  }
}

export function createAdversarialQAGraph(costTracker?: CostTracker) {
  async function hallucination_sweep(state: QAState): Promise<Partial<QAState>> {
    try {
      const model = getModel();
      if (!model) {
        logger.warn('[AdversarialQA] GOOGLE_AI_API_KEY not set — skipping hallucination sweep');
        return { hallucinationFlags: [] };
      }

      const evidenceText = JSON.stringify(state.rawEvidence, null, 2);
      const findingsText = state.findings.map(f => `${f.title}: ${f.description}`).join('\n');

      const prompt = `You are a fact-checking expert. Analyze the following content and identify any factual claims that cannot be traced to the provided evidence.\n\nCONTENT TO CHECK:\n${state.content}\n\nAVAILABLE EVIDENCE:\n${evidenceText}\n\nFINDINGS REFERENCE:\n${findingsText}\n\nFor each unsupported claim, provide:\n1. The exact claim text\n2. Where it appears in the content\n3. Why it's unsupported\n\nFormat as JSON array: [{"claim": "...", "location": "...", "reason": "..."}]`;

      const result = await model.generateContent(prompt);
      trackCost(costTracker, result);

      const responseText = result.response.text();
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      const flags: HallucinationFlag[] = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

      return { hallucinationFlags: flags };
    } catch (error) {
      logger.error({ node: 'hallucination_sweep', error }, '[AdversarialQA] hallucination_sweep failed — returning empty flags');
      return { hallucinationFlags: [] };
    }
  }

  async function consistency_check(state: QAState): Promise<Partial<QAState>> {
    try {
      const model = getModel();
      if (!model) {
        logger.warn('[AdversarialQA] GOOGLE_AI_API_KEY not set — skipping consistency check');
        return { consistencyFlags: [] };
      }

      const findingsText = state.findings.map(f => `${f.title}: ${f.description} (Impact: ${f.impactScore})`).join('\n');

      const prompt = `You are a consistency checker. Analyze the content for internal contradictions and mismatches with the findings.\n\nCONTENT:\n${state.content}\n\nFINDINGS:\n${findingsText}\n\nCheck for:\n1. Recommendations that don't correspond to findings\n2. ROI claims that overstate measured impact\n3. Conflicting statements\n\nFormat as JSON array: [{"type": "...", "conflictingElements": [...], "suggestion": "..."}]`;

      const result = await model.generateContent(prompt);
      trackCost(costTracker, result);

      const responseText = result.response.text();
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      const flags: ConsistencyFlag[] = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

      return { consistencyFlags: flags };
    } catch (error) {
      logger.error({ node: 'consistency_check', error }, '[AdversarialQA] consistency_check failed — returning empty flags');
      return { consistencyFlags: [] };
    }
  }

  async function competitor_fairness(state: QAState): Promise<Partial<QAState>> {
    try {
      const model = getModel();
      if (!model) {
        logger.warn('[AdversarialQA] GOOGLE_AI_API_KEY not set — skipping competitor fairness check');
        return { competitorFlags: [] };
      }

      const comparisonText = state.comparisonReport ? JSON.stringify(state.comparisonReport, null, 2) : 'No comparison data';

      const prompt = `You are a fairness auditor. Check competitor claims for accuracy and fairness.\n\nCONTENT:\n${state.content}\n\nCOMPARISON DATA:\n${comparisonText}\n\nCheck for:\n1. Stale competitor data (not from current audit)\n2. Overstated competitor weaknesses\n3. Unsubstantiated competitor comparisons\n\nFormat as JSON array: [{"claim": "...", "issue": "...", "suggestion": "..."}]`;

      const result = await model.generateContent(prompt);
      trackCost(costTracker, result);

      const responseText = result.response.text();
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      const flags: CompetitorFairnessFlag[] = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

      return { competitorFlags: flags };
    } catch (error) {
      logger.error({ node: 'competitor_fairness', error }, '[AdversarialQA] competitor_fairness failed — returning empty flags');
      return { competitorFlags: [] };
    }
  }

  async function apply_confidence_and_soften(state: QAState): Promise<Partial<QAState>> {
    try {
      const confidenceScores: Record<string, string> = {};
      let hardenedContent = state.content;

      for (const finding of state.findings) {
        const level = scoreConfidence(finding);
        confidenceScores[finding.id] = level;

        if (level === 'LOW') {
          hardenedContent = softenLanguage(hardenedContent, level);
        }
      }

      return { confidenceScores, hardenedContent };
    } catch (error) {
      logger.error({ node: 'apply_confidence_and_soften', error }, '[AdversarialQA] apply_confidence_and_soften failed — returning content unchanged');
      return {
        confidenceScores: {},
        hardenedContent: state.content,
      };
    }
  }

  return new StateGraph(AdversarialQAState)
    .addNode("hallucination_sweep", hallucination_sweep)
    .addNode("consistency_check", consistency_check)
    .addNode("competitor_fairness", competitor_fairness)
    .addNode("apply_confidence_and_soften", apply_confidence_and_soften)
    .addEdge("__start__", "hallucination_sweep")
    .addEdge("hallucination_sweep", "consistency_check")
    .addEdge("consistency_check", "competitor_fairness")
    .addEdge("competitor_fairness", "apply_confidence_and_soften")
    .addEdge("apply_confidence_and_soften", "__end__")
    .compile();
}

// Export default graph for backwards compatibility
export const adversarialQAGraph = createAdversarialQAGraph();
