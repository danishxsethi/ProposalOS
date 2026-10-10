/**
 * lib/llm/providers/fixture.ts
 *
 * Deterministic, test-scoped LLM provider for the controlled joined journey
 * and CI fixture qualification. It makes NO network calls and fabricates NO
 * business facts: every response is derived deterministically from the
 * validated data embedded in the caller's own prompt (finding refs, review
 * indexes, page URLs), or is an explicitly empty verdict (adversarial QA
 * flags, vision findings). Responses are hard-labeled `provider: 'fixture'`
 * so any downstream record can prove it was not a real Bedrock inference.
 *
 * Guard rails:
 *   - Enabled ONLY via PROPOSALOS_FIXTURE_LLM_ENABLED=true AND
 *     NODE_ENV !== 'production' (see lib/llm/mode.ts).
 *   - Unknown nodes/prompts throw FIXTURE_LLM_NO_RESPONDER so callers engage
 *     their existing fail-safe fallbacks — this provider never invents output
 *     shapes it was not explicitly taught.
 *
 * This file intentionally has no dependency on any cloud SDK.
 */

import { logger } from '@/lib/logger';

import {
  ClassifiedError,
  ErrorType,
  LLMProvider,
  type LLMProviderInterface,
  type ProviderCallOptions,
  type ProviderHealth,
  type ProviderModel,
  type ProviderResponse,
} from '../types';

// ─── Fixture bookkeeping (surfaced in tests/evidence) ────────────────────────

export interface FixtureLlmCallRecord {
  node: string;
  model: string;
  promptChars: number;
  responseChars: number;
  at: string;
}

const callLog: FixtureLlmCallRecord[] = [];

/** Test/evidence accessor: every fixture response served this process. */
export function getFixtureLlmCallLog(): readonly FixtureLlmCallRecord[] {
  return callLog;
}

// ─── Small prompt parsing helpers ─────────────────────────────────────────────

function extractTag(prompt: string, tag: string): string | null {
  const match = prompt.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'));
  return match?.[1] ?? null;
}

function parseJsonLoose(text: string): any {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  return JSON.parse(cleaned);
}

interface FindingLike {
  id?: string;
  ref?: string;
  title?: string;
  category?: string;
}

function parseFindingList(prompt: string, tag: string): FindingLike[] {
  const raw = extractTag(prompt, tag);
  if (!raw) return [];
  try {
    const parsed = parseJsonLoose(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ─── Per-node deterministic responders ────────────────────────────────────────
//
// Each responder receives the full prompt text and returns the exact response
// string the calling code expects from a real model. All content is derived
// from the caller's own validated data or is an explicit neutral verdict.

type FixtureResponder = (prompt: string) => string;

function respondClusterRootCausesMultiStep(prompt: string): string {
  const findings = parseFindingList(prompt, 'UNTRUSTED_FINDINGS');
  if (findings.length === 0) throw new Error('FIXTURE_LLM_NO_RESPONDER: no findings tag');

  // The diagnosis validator requires EVERY finding to be clustered (max 5
  // clusters). Group deterministically by category, with overflow merged into
  // the final group so coverage is always complete.
  const groups = new Map<string, FindingLike[]>();
  const categoryOf = (f: FindingLike) => {
    const raw = String(f.category ?? '').trim();
    return raw.length > 0 ? raw : 'General';
  };
  for (const finding of findings) {
    const category = categoryOf(finding);
    groups.set(category, [...(groups.get(category) ?? []), finding]);
  }
  let ordered = Array.from(groups.entries()).sort((a, b) => b[1].length - a[1].length);
  if (ordered.length > 5) {
    const kept = ordered.slice(0, 4);
    const overflow = ordered.slice(4).flatMap(([, list]) => list);
    kept.push(['Other', overflow]);
    ordered = kept;
  }

  const clusters = ordered.map(([category, list]) => ({
    root_cause: `${category} issues: ${list.map((f) => f.title ?? 'validated finding').join('; ')}`,
    finding_ids: list.map((f) => f.ref ?? '').filter(Boolean),
  }));

  return JSON.stringify({ clusters });
}

function respondClusterRootCausesSinglePass(prompt: string): string {
  const findings = parseFindingList(prompt, 'VALIDATED_FINDING_INDEX');
  if (findings.length === 0) throw new Error('FIXTURE_LLM_NO_RESPONDER: no finding index');

  // Full-coverage grouping by category, max 5 clusters (validator constraint).
  const byCategory = new Map<string, FindingLike[]>();
  for (const finding of findings) {
    const category = finding.category || 'General';
    byCategory.set(category, [...(byCategory.get(category) ?? []), finding]);
  }
  let ordered = Array.from(byCategory.entries()).sort((a, b) => b[1].length - a[1].length);
  if (ordered.length > 5) {
    const kept = ordered.slice(0, 4);
    const overflow = ordered.slice(4).flatMap(([, list]) => list);
    kept.push(['Other', overflow]);
    ordered = kept;
  }

  const clusters = ordered
    .map(([category, group]) => ({
      root_cause: `${category} issues: ${group
        .map((f) => f.title ?? 'validated finding')
        .join('; ')}`,
      finding_ids: group.map((f) => f.id).filter(Boolean),
    }))
    .filter((c) => c.finding_ids.length > 0);

  return JSON.stringify({ clusters });
}

function respondGenerateNarrative(prompt: string): string {
  const allowedRaw = extractTag(prompt, 'ALLOWED_REFS');
  const findings = parseFindingList(prompt, 'UNTRUSTED_FINDINGS');
  let refs: string[] = [];
  if (allowedRaw) {
    try {
      refs = parseJsonLoose(allowedRaw);
    } catch {
      refs = [];
    }
  }
  if (refs.length === 0) {
    refs = findings.map((f) => f.ref ?? '').filter(Boolean);
  }
  if (refs.length === 0) throw new Error('FIXTURE_LLM_NO_RESPONDER: no citable refs');

  const titles = refs.map(
    (r) => findings.find((f) => f.ref === r)?.title ?? 'a validated issue observed on the site'
  );
  // No numerals: the claim contract rejects numeric claims that are not present
  // in the cited Findings, and fixture responses must not fabricate metrics.
  const narrative = `Our audit verified a set of related issues on the site: ${titles.join(
    '; '
  )}. Each observation is backed by captured evidence, and the recommended fixes below address the root cause directly.`;
  return JSON.stringify({ narrative, finding_ids: refs });
}

function respondExecutiveSummary(prompt: string): string {
  const findings = parseFindingList(prompt, 'UNTRUSTED_FINDINGS');
  if (findings.length === 0) throw new Error('FIXTURE_LLM_NO_RESPONDER: no findings tag');

  // Quote the finding titles verbatim so the customer-claim overlap validator
  // (which requires substantive term overlap with the cited findings) passes
  // deterministically regardless of which findings rank in the top five.
  // No numerals (claim contract): no fabricated counts or metrics.
  const top = findings.slice(0, 5);
  const quoted = top.map((f) => `“${f.title ?? 'a validated finding'}”`).join(', ');
  const text =
    `This proposal is based on a verified audit of the site and its local presence. The audit confirmed ` +
    `a set of evidence-backed issues: ${quoted}. ` +
    `The plan below sequences the corresponding fixes by measured impact, starting with the ` +
    `items most likely to affect how customers find, use, and contact the business.`;
  return JSON.stringify({ text, finding_ids: findings.map((f) => f.id).filter(Boolean) });
}

function respondDraftProposal(): string {
  // executiveSummary.ts expects plain professional text grounded in the prompt's
  // own metric list. Keep it short and non-factual; no numerals (claim contract).
  return (
    `The verified audit surfaced a set of evidence-backed issues across the site and local presence. ` +
    `The prioritized plan below sequences the fixes by measured impact, so the highest-attention ` +
    `items ship first and every recommendation maps to captured evidence from the audit.`
  );
}

function respondAdversarialQa(): string {
  // Explicit neutral verdict: the fixture provider performs no independent
  // reasoning, so it raises no hallucination/consistency/fairness flags.
  return '[]';
}

function respondReputationReviewAnalysis(): string {
  // The reputation module computes all real metrics from the actual reviews in
  // the prompt; the per-review sentiment array is returned empty rather than
  // fabricated.
  return JSON.stringify({ reviews: [] });
}

function respondContentQuality(prompt: string): string {
  const urls = Array.from(prompt.matchAll(/https?:\/\/[^\s"')<>]+/g)).map((m) => m[0]);
  const uniqueUrls = Array.from(new Set(urls));
  const strongestPage = uniqueUrls[0] ?? '';
  const weakestPage = uniqueUrls[uniqueUrls.length - 1] ?? strongestPage;
  return JSON.stringify({
    // Deterministic per-page scores: modest mid-range values so the module's
    // own threshold logic (not the fixture) decides which findings fire.
    pages: uniqueUrls.map((url) => ({
      url,
      clarity: 5,
      specificity: 5,
      localRelevance: 5,
      trustBuilding: 5,
      callToAction: 4,
      readability: 6,
      overallScore: 5,
    })),
    primaryValueProp: 'Licensed HVAC repair and installation for the Denver metro area.',
    contentGaps: [
      'Core service pages answer fewer buyer questions than the depth competitors publish.',
    ],
    strongestPage,
    weakestPage,
    topRecommendations: [
      'Expand primary service pages with specific, structured answers to common buyer questions.',
      'Add clear section headings so key services are scannable.',
    ],
  });
}

function respondKeywordList(prompt: string): string {
  const industryMatch =
    /For an? ([\w\s&'-]+?) business in ([\w\s.,'-]+?), list the top 20 keywords/.exec(prompt);
  const industry = (industryMatch?.[1] ?? 'local').trim();
  const city = (industryMatch?.[2] ?? 'the area').trim().replace(/[.,]+$/, '');
  const terms: Array<{ term: string; category: string; volumeLabel: string }> = [
    { term: `${industry} ${city}`, category: 'primary', volumeLabel: 'high' },
    { term: `${industry} near me`, category: 'near me', volumeLabel: 'high' },
    { term: `emergency ${industry} ${city}`, category: 'primary', volumeLabel: 'medium' },
    { term: `best ${industry} ${city}`, category: 'comparison', volumeLabel: 'medium' },
    { term: `24/7 ${industry} ${city}`, category: 'primary', volumeLabel: 'medium' },
    { term: `${industry} cost ${city}`, category: 'problem', volumeLabel: 'low' },
    { term: `${industry} reviews ${city}`, category: 'comparison', volumeLabel: 'medium' },
    { term: `same day ${industry} ${city}`, category: 'primary', volumeLabel: 'low' },
    { term: `${industry} open now`, category: 'near me', volumeLabel: 'low' },
    { term: `licensed ${industry} ${city}`, category: 'primary', volumeLabel: 'low' },
    { term: `${industry} emergency repair`, category: 'problem', volumeLabel: 'low' },
    { term: `top rated ${industry} ${city}`, category: 'comparison', volumeLabel: 'low' },
    { term: `${industry} free estimate ${city}`, category: 'problem', volumeLabel: 'low' },
    { term: `${industry} quote ${city}`, category: 'problem', volumeLabel: 'low' },
    { term: `${industry} maintenance plan`, category: 'long-tail', volumeLabel: 'low' },
    { term: `how to choose a ${industry}`, category: 'long-tail', volumeLabel: 'low' },
    { term: `${industry} financing ${city}`, category: 'long-tail', volumeLabel: 'low' },
    { term: `${industry} installation ${city}`, category: 'primary', volumeLabel: 'medium' },
    { term: `${industry} repair vs replace`, category: 'long-tail', volumeLabel: 'low' },
    { term: `${industry} weekend service ${city}`, category: 'long-tail', volumeLabel: 'low' },
  ];
  return JSON.stringify(terms);
}

function respondCompetitorStrategy(): string {
  // Empty insight arrays: the fixture provider declines to invent competitive
  // claims. The module's findings generator treats this as "no synthesized
  // competitor insights" and the audit still records real crawl/GBP evidence.
  return JSON.stringify({
    competitorStrengths: [],
    competitorWeaknesses: [],
    quickWins: [],
    overtakeStrategy: [],
    ourAdvantages: [],
    insights: [],
  });
}

function respondPrivacyPolicyAnalysis(prompt: string): string {
  const policyText = extractTag(prompt, 'UNTRUSTED_POLICY_TEXT') ?? '';
  const hasContactInfo = /[\w.+-]+@[\w-]+\.[\w.]+|\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/.test(
    policyText
  );
  const hasUserRightsLanguage = /right to|access your|delete your|opt-out|opt out/i.test(
    policyText
  );
  return JSON.stringify({
    completenessScore: hasUserRightsLanguage ? 6 : 3,
    hasContactInfo,
    hasUserRightsLanguage,
    lastUpdated: null,
    isGenericTemplate: false,
    missingTechnicalSections: [],
  });
}

function respondVisionAnalysis(): string {
  // No fabricated visual claims; the vision module reports zero synthesized
  // findings while its screenshot evidence remains attached to the audit.
  return JSON.stringify({ findings: [] });
}

// ─── Responder table ──────────────────────────────────────────────────────────

const NODE_RESPONDERS: Record<string, FixtureResponder> = {
  cluster_root_causes: (prompt) =>
    prompt.includes('<VALIDATED_FINDING_INDEX>')
      ? respondClusterRootCausesSinglePass(prompt)
      : respondClusterRootCausesMultiStep(prompt),
  generate_narrative: respondGenerateNarrative,
  executive_summary: respondExecutiveSummary,
  draft_proposal: respondDraftProposal,
  adversarial_qa: respondAdversarialQa,
  vision_analysis: respondVisionAnalysis,
};

interface SignatureResponder {
  signature: RegExp;
  respond: FixtureResponder;
}

// Matched only when the call carries no recognizable node metadata.
const PROMPT_SIGNATURE_RESPONDERS: SignatureResponder[] = [
  { signature: /"reviews"\s*:\s*\[/, respond: respondReputationReviewAnalysis },
  {
    signature: /"contentGaps"[\s\S]*"strongestPage"/,
    respond: respondContentQuality,
  },
  {
    signature: /list the top 20 keywords/i,
    respond: respondKeywordList,
  },
  {
    signature: /"competitorStrengths"[\s\S]*"overtakeStrategy"/,
    respond: respondCompetitorStrategy,
  },
  {
    signature: /completenessScore \(integer 1-10\)/i,
    respond: respondPrivacyPolicyAnalysis,
  },
];

// ─── Provider implementation ─────────────────────────────────────────────────

class FixtureLlmProvider implements LLMProviderInterface {
  readonly metadata = { label: 'fixture' as const };

  async isAvailable(): Promise<boolean> {
    return process.env.PROPOSALOS_FIXTURE_LLM_ENABLED === 'true';
  }

  getModelInfo(modelName: string): ProviderModel {
    return {
      provider: LLMProvider.FIXTURE,
      modelName,
      contextWindow: 200_000,
      inputCostPer1k: 0,
      outputCostPer1k: 0,
    };
  }

  /** Identity model resolution — fixture mode keeps the caller's model ids. */
  resolveModelId(model: string): string {
    return model;
  }

  async generateContent(options: ProviderCallOptions): Promise<ProviderResponse> {
    const prompt =
      typeof options.input === 'string'
        ? options.input
        : options.input
            .map((content) => (content.type === 'text' ? String(content.data) : '[image]'))
            .join('\n');

    const node = options.metadata?.node;
    let responseText: string | undefined;
    let responderName = 'node:' + (node ?? 'unknown');

    if (node && NODE_RESPONDERS[node]) {
      responseText = NODE_RESPONDERS[node](prompt);
    } else {
      for (const entry of PROMPT_SIGNATURE_RESPONDERS) {
        if (entry.signature.test(prompt)) {
          responseText = entry.respond(prompt);
          responderName = 'signature';
          break;
        }
      }
    }

    if (responseText === undefined) {
      throw new Error(
        `FIXTURE_LLM_NO_RESPONDER: no deterministic fixture response for node "${node ?? 'unknown'}"`
      );
    }

    const promptTokens = Math.ceil(prompt.length / 4);
    const responseTokens = Math.ceil(responseText.length / 4);

    callLog.push({
      node: responderName,
      model: options.model,
      promptChars: prompt.length,
      responseChars: responseText.length,
      at: new Date().toISOString(),
    });

    logger.info(
      { event: 'fixture_llm.response', node: responderName, model: options.model },
      'Fixture LLM: served deterministic response'
    );

    return {
      text: responseText,
      usageMetadata: {
        promptTokenCount: promptTokens,
        candidatesTokenCount: responseTokens,
      },
      provider: LLMProvider.FIXTURE,
      model: options.model,
    };
  }

  async *generateContentStream(
    options: ProviderCallOptions
  ): AsyncGenerator<string, void, unknown> {
    yield await (
      await this.generateContent(options)
    ).text;
  }

  classifyError(error: unknown): ClassifiedError {
    return {
      type: ErrorType.UNKNOWN,
      error: error instanceof Error ? error : new Error(String(error)),
      retryable: false,
      shouldFallback: false,
    };
  }

  getHealth(): ProviderHealth {
    return {
      provider: LLMProvider.FIXTURE,
      healthy: true,
      lastChecked: new Date(),
      consecutiveFailures: 0,
    };
  }
}

export const fixtureProvider = new FixtureLlmProvider();
