import { z } from 'zod';

import { validateFinding } from '@/lib/audit/findingContract';

export const CustomerClaimInputSchema = z
  .object({
    claimId: z.string().trim().min(1),
    text: z.string().trim().min(1),
    claimType: z.enum([
      'DETERMINISTIC_OBSERVATION',
      'DERIVED_FROM_FINDINGS',
      'LLM_SYNTHESIS_WITH_CITATIONS',
      'RECOMMENDATION',
      'ESTIMATE_WITH_ASSUMPTIONS',
      'COMMERCIAL_CONFIGURATION',
    ]),
    sourceFindingIds: z.array(z.string().trim().min(1)),
    configurationRefs: z.array(z.string().trim().min(1)).default([]),
    classification: z.enum(['deterministic', 'derived', 'llm']),
    confidence: z.number().finite().min(0).max(1),
    assumptions: z.array(z.string().trim().min(1)),
    metricInputs: z.array(
      z
        .object({
          name: z.string().trim().min(1),
          value: z.union([z.string(), z.number().finite()]),
          unit: z.string().trim().min(1),
          sourceFindingId: z.string().trim().min(1).optional(),
        })
        .strict()
    ),
    estimate: z.boolean(),
    recommendation: z.boolean(),
    provenance: z
      .object({
        producer: z.string().trim().min(1),
        model: z.string().trim().min(1).optional(),
        generatedAt: z.string().datetime().optional(),
      })
      .strict(),
  })
  .strict()
  .superRefine((claim, ctx) => {
    const commercial = claim.claimType === 'COMMERCIAL_CONFIGURATION';
    const recommendationOnly =
      claim.claimType === 'RECOMMENDATION' && claim.recommendation && !claim.estimate;
    if (!recommendationOnly && !commercial && claim.sourceFindingIds.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sourceFindingIds'],
        message: 'factual customer claims require at least one Finding citation',
      });
    }
    if (commercial && claim.configurationRefs.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['configurationRefs'],
        message: 'commercial claims require a deterministic configuration reference',
      });
    }
    if (claim.claimType === 'ESTIMATE_WITH_ASSUMPTIONS') {
      if (!claim.estimate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['estimate'],
          message: 'estimate claims must set estimate=true',
        });
      }
      if (claim.assumptions.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['assumptions'],
          message: 'estimates require explicit assumptions',
        });
      }
      if (claim.metricInputs.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['metricInputs'],
          message: 'estimates require explicit metric inputs and units',
        });
      }
    }
  });

export type CustomerClaimInput = z.infer<typeof CustomerClaimInputSchema>;
export type ValidatedCustomerClaim = CustomerClaimInput & { auditId: string; tenantId: string };

interface ClaimFinding {
  id: string;
  auditId: string;
  tenantId: string;
  excluded?: boolean;
  metrics?: unknown;
  [key: string]: unknown;
}

export interface CustomerClaimContext {
  auditId: string;
  tenantId: string;
  findings: ClaimFinding[];
}

export type CustomerClaimValidation =
  | { success: true; data: ValidatedCustomerClaim }
  | { success: false; issues: string[] };

const INELIGIBLE_STATES = new Set(['failed', 'unavailable', 'skipped', 'disabled']);
const SUPPORT_STOP_WORDS = new Set([
  'about',
  'after',
  'also',
  'and',
  'are',
  'based',
  'because',
  'been',
  'before',
  'business',
  'can',
  'could',
  'customer',
  'customers',
  'for',
  'from',
  'has',
  'have',
  'into',
  'may',
  'more',
  'not',
  'our',
  'page',
  'recommend',
  'should',
  'site',
  'than',
  'that',
  'the',
  'their',
  'this',
  'through',
  'was',
  'website',
  'were',
  'will',
  'with',
  'your',
]);

function findingState(finding: ClaimFinding): string | undefined {
  if (!finding.metrics || typeof finding.metrics !== 'object') return undefined;
  const metrics = finding.metrics as Record<string, unknown>;
  const state = metrics.executionState ?? metrics.observationState ?? metrics.state;
  return typeof state === 'string' ? state.toLowerCase() : undefined;
}

function comparableText(value: unknown): string {
  return JSON.stringify(value)
    .toLowerCase()
    .replace(/[^a-z0-9.%$]+/g, ' ');
}

function numericTokens(value: string): string[] {
  return value.match(/[$]?\d+(?:\.\d+)?%?/g) ?? [];
}

function normalizeNumericToken(value: string): string {
  return value.replace(/^\$/, '').replace(/%$/, '').replace(/,/g, '').toLowerCase();
}

function wordNumberTokens(value: string): string[] {
  const words: Record<string, string> = {
    zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6',
    seven: '7', eight: '8', nine: '9', ten: '10', eleven: '11', twelve: '12',
    thirteen: '13', fourteen: '14', fifteen: '15', sixteen: '16', seventeen: '17',
    eighteen: '18', nineteen: '19', twenty: '20', thirty: '30', forty: '40',
    fifty: '50', sixty: '60', seventy: '70', eighty: '80', ninety: '90',
    hundred: '100', thousand: '1000',
  };
  return value
    .toLowerCase()
    .match(/\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)\b/g)
    ?.flatMap((word) => (words[word] ? [words[word]] : [])) ?? [];
}

function supportTokens(value: string): string[] {
  return [
    ...new Set(
      value
        .toLowerCase()
        .match(/[a-z][a-z0-9-]{3,}/g)
        ?.filter((token) => !SUPPORT_STOP_WORDS.has(token)) ?? []
    ),
  ];
}

export function validateClaimSupport(
  claim: CustomerClaimInput,
  citedFindings: ClaimFinding[]
): string[] {
  if (
    claim.claimType === 'COMMERCIAL_CONFIGURATION' ||
    (claim.claimType === 'RECOMMENDATION' && citedFindings.length === 0)
  ) {
    return [];
  }

  const source = comparableText(citedFindings);
  const declaredMetrics = comparableText(claim.metricInputs.map((input) => input.value));
  const issues: string[] = [];

  const sourceNumbers = [
    ...numericTokens(source),
    ...wordNumberTokens(source),
  ].map(normalizeNumericToken);
  const declaredNumbers = [
    ...numericTokens(declaredMetrics),
    ...wordNumberTokens(declaredMetrics),
  ].map(normalizeNumericToken);
  for (const token of numericTokens(claim.text)) {
    const normalized = normalizeNumericToken(token);
    if (!sourceNumbers.includes(normalized) && !declaredNumbers.includes(normalized)) {
      issues.push(
        `text: numeric claim '${token}' is not present in cited Findings or metric inputs`
      );
    }
  }

  const terms = supportTokens(claim.text);
  if (terms.length > 0 && !terms.some((term) => source.includes(term))) {
    issues.push('text: claim has no substantive term overlap with cited Findings');
  }

  return issues;
}

export function validateCustomerClaim(
  candidate: unknown,
  context: CustomerClaimContext
): CustomerClaimValidation {
  const parsed = CustomerClaimInputSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      success: false,
      issues: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    };
  }

  const issues: string[] = [];
  const findingsById = new Map(context.findings.map((finding) => [finding.id, finding]));
  const citedFindings: ClaimFinding[] = [];

  for (const findingId of parsed.data.sourceFindingIds) {
    const finding = findingsById.get(findingId);
    if (!finding) {
      issues.push(`sourceFindingIds: unknown Finding '${findingId}'`);
      continue;
    }
    citedFindings.push(finding);
    if (finding.auditId !== context.auditId) {
      issues.push(`sourceFindingIds: Finding '${findingId}' belongs to another audit`);
    }
    if (finding.tenantId !== context.tenantId) {
      issues.push(`sourceFindingIds: Finding '${findingId}' belongs to another tenant`);
    }
    if (finding.excluded) {
      issues.push(`sourceFindingIds: Finding '${findingId}' is excluded`);
    }
    if (!validateFinding(finding).success) {
      issues.push(`sourceFindingIds: Finding '${findingId}' failed the Wave 3 contract`);
    }
    const state = findingState(finding);
    if (state && INELIGIBLE_STATES.has(state)) {
      issues.push(`sourceFindingIds: Finding '${findingId}' has ineligible state '${state}'`);
    }
  }

  issues.push(...validateClaimSupport(parsed.data, citedFindings));

  for (const input of parsed.data.metricInputs) {
    if (input.sourceFindingId && !parsed.data.sourceFindingIds.includes(input.sourceFindingId)) {
      issues.push(
        `metricInputs: source Finding '${input.sourceFindingId}' is not cited by the claim`
      );
    }
  }

  return issues.length > 0
    ? { success: false, issues }
    : {
        success: true,
        data: { ...parsed.data, auditId: context.auditId, tenantId: context.tenantId },
      };
}
