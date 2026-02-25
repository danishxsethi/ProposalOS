import { StateGraph, Annotation } from "@langchain/langgraph";
import { Finding } from '@prisma/client';
import { scoreConfidence, softenLanguage } from '@/lib/delivery/confidenceScorer';
import { prisma } from '@/lib/prisma';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getThinkingBudgetForNode } from '@/lib/config/thinking-budgets';

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

// Nodes

async function hallucination_sweep(state: typeof AdversarialQAState.State) {
  const flags: HallucinationFlag[] = [];

  try {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      return { hallucinationFlags: flags };
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-pro-exp-01-21',
      generationConfig: {
      },
    });

    const evidenceText = JSON.stringify(state.rawEvidence, null, 2);
    const findingsText = state.findings.map(f => `${f.title}: ${f.description}`).join('\n');

    const prompt = `You are a fact-checking expert. Analyze the following content and identify any factual claims that cannot be traced to the provided evidence.

CONTENT TO CHECK:
${state.content}

AVAILABLE EVIDENCE:
${evidenceText}

FINDINGS REFERENCE:
${findingsText}

For each unsupported claim, provide:
1. The exact claim text
2. Where it appears in the content
3. Why it's unsupported

Format as JSON array: [{"claim": "...", "location": "...", "reason": "..."}]`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    // Extract JSON from response
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsedFlags = JSON.parse(jsonMatch[0]);
      flags.push(...parsedFlags);
    }
  } catch (error) {
    console.error('Hallucination sweep failed:', error);
  }

  return { hallucinationFlags: flags };
}

async function consistency_check(state: typeof AdversarialQAState.State) {
  const flags: ConsistencyFlag[] = [];

  try {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      return { consistencyFlags: flags };
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-pro-exp-01-21',
      generationConfig: {
      },
    });

    const findingsText = state.findings.map(f => `${f.title}: ${f.description} (Impact: ${f.impactScore})`).join('\n');

    const prompt = `You are a consistency checker. Analyze the content for internal contradictions and mismatches with the findings.

CONTENT:
${state.content}

FINDINGS:
${findingsText}

Check for:
1. Recommendations that don't correspond to findings
2. ROI claims that overstate measured impact
3. Conflicting statements

Format as JSON array: [{"type": "...", "conflictingElements": [...], "suggestion": "..."}]`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsedFlags = JSON.parse(jsonMatch[0]);
      flags.push(...parsedFlags);
    }
  } catch (error) {
    console.error('Consistency check failed:', error);
  }

  return { consistencyFlags: flags };
}

async function competitor_fairness(state: typeof AdversarialQAState.State) {
  const flags: CompetitorFairnessFlag[] = [];

  try {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      return { competitorFlags: flags };
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-pro-exp-01-21',
      generationConfig: {
      },
    });

    const comparisonText = state.comparisonReport ? JSON.stringify(state.comparisonReport, null, 2) : 'No comparison data';

    const prompt = `You are a fairness auditor. Check competitor claims for accuracy and fairness.

CONTENT:
${state.content}

COMPARISON DATA:
${comparisonText}

Check for:
1. Stale competitor data (not from current audit)
2. Overstated competitor weaknesses
3. Unsubstantiated competitor comparisons

Format as JSON array: [{"claim": "...", "issue": "...", "suggestion": "..."}]`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsedFlags = JSON.parse(jsonMatch[0]);
      flags.push(...parsedFlags);
    }
  } catch (error) {
    console.error('Competitor fairness check failed:', error);
  }

  return { competitorFlags: flags };
}

async function apply_confidence_and_soften(state: typeof AdversarialQAState.State) {
  const confidenceScores: Record<string, string> = {};
  let hardenedContent = state.content;

  // Score confidence for each finding
  for (const finding of state.findings) {
    const level = scoreConfidence(finding);
    confidenceScores[finding.id] = level;

    // Soften language for LOW confidence claims
    if (level === 'LOW') {
      hardenedContent = softenLanguage(hardenedContent, level);
    }
  }

  return {
    confidenceScores,
    hardenedContent,
  };
}

export const adversarialQAGraph = new StateGraph(AdversarialQAState)
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
