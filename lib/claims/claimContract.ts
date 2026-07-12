import { z } from 'zod';

import { validateFinding } from '@/lib/audit/findingContract';

const CustomerClaimInputSchema = z
  .object({
    claimId: z.string().trim().min(1),
    text: z.string().trim().min(1),
    claimType: z.enum([
      'DETERMINISTIC_OBSERVATION',
      'DERIVED_FROM_FINDINGS',
      'LLM_SYNTHESIS_WITH_CITATIONS',
      'RECOMMENDATION',
      'ESTIMATE_WITH_ASSUMPTIONS',
    ]),
    sourceFindingIds: z.array(z.string().trim().min(1)),
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
    const recommendationOnly =
      claim.claimType === 'RECOMMENDATION' && claim.recommendation && !claim.estimate;
    if (!recommendationOnly && claim.sourceFindingIds.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sourceFindingIds'],
        message: 'factual customer claims require at least one Finding citation',
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

function findingState(finding: ClaimFinding): string | undefined {
  if (!finding.metrics || typeof finding.metrics !== 'object') return undefined;
  const metrics = finding.metrics as Record<string, unknown>;
  const state = metrics.executionState ?? metrics.observationState ?? metrics.state;
  return typeof state === 'string' ? state.toLowerCase() : undefined;
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

  for (const findingId of parsed.data.sourceFindingIds) {
    const finding = findingsById.get(findingId);
    if (!finding) {
      issues.push(`sourceFindingIds: unknown Finding '${findingId}'`);
      continue;
    }
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
