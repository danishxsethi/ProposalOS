/**
 * lib/audit/findingContract.ts
 *
 * Wave 3 (root-cause group D — P1-09, P1-25, P1-26, P1-31, P2-13, P2-36, P2-40): the one
 * canonical *runtime* Finding/Evidence contract. TypeScript interfaces
 * (lib/modules/types.ts::Finding/Evidence) describe the shape at compile time; this module
 * enforces it at runtime, at every boundary a module result crosses before it can become a
 * customer-facing Finding (adapter normalization, persistence, proposal/diagnosis input, QA).
 *
 * Design decisions (recorded here rather than only in REMEDIATION_STATE.md so the "why" travels
 * with the code):
 *
 * - Base contract is the existing `Evidence`/`Finding` interfaces in lib/modules/types.ts, not a
 *   new parallel shape (per campaign instruction). This module re-validates the same fields at
 *   runtime with Zod, using the same placeholder/secret screens `createEvidence()` uses.
 * - `Finding.evidence` must be non-empty for every finding this contract accepts — every
 *   persisted/returned Finding is treated as a customer-facing observed claim (positive,
 *   vitamin, or painkiller). There is no "evidence optional for positive findings" carve-out.
 * - Module identity (`module`) is always injected by the trusted canonical dispatcher
 *   (`normalizeAndValidateModuleFindings`'s `moduleName` parameter), never trusted from the
 *   module's own returned finding object — a module cannot claim to be a different module.
 * - A separate module-level `VERIFIED_ABSENT` / `UNAVAILABLE` status enum was deliberately NOT
 *   introduced this wave (see REMEDIATION_STATE.md's Wave 3 section for the full reasoning):
 *   `lib/audit/runner.ts::extractFindingsFromRegistryResult` already refuses to extract ANY
 *   finding from a module whose `ModuleResult.status !== 'COMPLETE'`, so the real, previously
 *   unguarded gap was modules that *report* COMPLETE while their underlying legacy result was
 *   actually a failure (fixed directly in the two offending adapters, gbp/competitor) — not a
 *   missing state value. The Evidence contract below is the actual proof mechanism for "this
 *   was really observed": no valid, non-placeholder, real-pointer evidence ⇒ rejected,
 *   regardless of which status label produced it.
 */
import { z } from 'zod';

import {
  containsSecretLike,
  type Evidence,
  type Finding,
  isPlaceholderPointer,
} from '@/lib/modules/types';

// ─── Evidence ────────────────────────────────────────────────────────────────

export const EvidenceRuntimeSchema = z
  .object({
    pointer: z
      .string({ required_error: 'pointer is required' })
      .trim()
      .min(1, 'pointer must not be empty'),
    source: z.string({ required_error: 'source is required' }).trim().min(1, 'source is required'),
    collected_at: z
      .string({ required_error: 'collected_at is required' })
      .refine((s) => !Number.isNaN(Date.parse(s)), {
        message: 'collected_at must be a valid ISO 8601 timestamp',
      }),
    type: z.string().optional(),
    value: z.union([z.string(), z.number()]).optional(),
    label: z.string().optional(),
    raw: z.unknown().optional(),
  })
  .superRefine((evidence, ctx) => {
    if (isPlaceholderPointer(evidence.pointer, evidence.source)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['pointer'],
        message: `pointer '${evidence.pointer}' is a placeholder/fabricated value, not a real source`,
      });
    }
    if (containsSecretLike(evidence.pointer)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['pointer'],
        message: 'pointer appears to contain secret/credential material',
      });
    }
    if (typeof evidence.value === 'string' && containsSecretLike(evidence.value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value'],
        message: 'value appears to contain secret/credential material',
      });
    }
  });

export type RuntimeEvidence = z.infer<typeof EvidenceRuntimeSchema>;

export function validateEvidenceItem(evidence: unknown) {
  return EvidenceRuntimeSchema.safeParse(evidence);
}

/** True if `evidence` is a non-empty array with at least one contract-valid item. */
export function hasContractValidEvidence(evidence: unknown): boolean {
  return (
    Array.isArray(evidence) && evidence.some((e) => EvidenceRuntimeSchema.safeParse(e).success)
  );
}

// ─── Finding ─────────────────────────────────────────────────────────────────

const FindingTypeSchema = z.enum(['PAINKILLER', 'VITAMIN', 'POSITIVE']);
const EffortLevelSchema = z.enum(['LOW', 'MEDIUM', 'HIGH']);

/**
 * Runtime Finding contract for a module-produced finding, prior to trusted persistence
 * identity (id/auditId/tenantId) being attached. Every field mirrors
 * lib/modules/types.ts::Finding; nothing here is a parallel/competing shape.
 */
export const FindingRuntimeSchema = z.object({
  module: z.string().trim().min(1, 'module is required'),
  category: z.string().trim().min(1, 'category is required'),
  type: FindingTypeSchema,
  title: z.string().trim().min(3, 'title must be substantive'),
  description: z.string().trim().min(1).optional(),
  impactScore: z.number().finite('impactScore must be finite').min(0).max(10),
  confidenceScore: z.number().finite('confidenceScore must be finite').min(0).max(10),
  evidence: z.array(EvidenceRuntimeSchema).min(1, 'evidence must be non-empty'),
  metrics: z.record(z.any()).default({}),
  effortEstimate: EffortLevelSchema.optional(),
  recommendedFix: z.array(z.string()).default([]),
});

export type RuntimeFinding = z.infer<typeof FindingRuntimeSchema>;

export function validateFinding(finding: unknown) {
  return FindingRuntimeSchema.safeParse(finding);
}

/**
 * Trusted persistence identity attached by the canonical dispatcher/persistence layer,
 * never sourced from module output (Step 3 requirement 4 / Step 6 requirement 8-9).
 */
export const TrustedFindingIdentitySchema = z.object({
  auditId: z.string().trim().min(1),
  tenantId: z.string().trim().min(1),
});

export interface RejectedFinding {
  module: string;
  title?: string;
  reason: string;
  issues: string[];
}

/**
 * Module observation states a Finding may legitimately be produced from. Only these are
 * eligible to reach the customer-facing aggregation set (Step 5).
 */
export const FINDING_ELIGIBLE_STATES: ReadonlySet<string> = new Set(['COMPLETE', 'PARTIAL']);

/**
 * The one canonical adapter/aggregation boundary (Step 5). Every module's raw finding
 * output — old legacy shape or new canonical shape alike — must pass through this before
 * entering the customer-facing aggregation set. Trusted `module` identity is injected here
 * and always wins over anything the module output claims (Step 3 requirement 4).
 *
 * Does NOT repair invalid output by injecting fabricated Evidence (Step 5: "Do not repair
 * invalid module output by injecting fake Evidence at this boundary") — invalid findings are
 * rejected outright and returned for diagnostics.
 */
export function normalizeAndValidateModuleFindings(
  moduleName: string,
  moduleStatus: string,
  rawFindings: unknown[]
): { accepted: Finding[]; rejected: RejectedFinding[] } {
  const accepted: Finding[] = [];
  const rejected: RejectedFinding[] = [];

  if (!Array.isArray(rawFindings) || rawFindings.length === 0) {
    return { accepted, rejected };
  }

  if (!FINDING_ELIGIBLE_STATES.has(moduleStatus)) {
    for (const raw of rawFindings) {
      rejected.push({
        module: moduleName,
        title:
          typeof (raw as Record<string, unknown>)?.title === 'string'
            ? ((raw as Record<string, unknown>).title as string)
            : undefined,
        reason: `module observation state '${moduleStatus}' is not eligible to emit customer-facing findings`,
        issues: [],
      });
    }
    return { accepted, rejected };
  }

  for (const raw of rawFindings) {
    const rawTitle = (raw as Record<string, unknown> | null | undefined)?.title;
    const candidate: Record<string, unknown> = {
      ...(raw as Record<string, unknown>),
      module: moduleName,
    };
    const result = FindingRuntimeSchema.safeParse(candidate);
    if (result.success) {
      accepted.push(result.data as unknown as Finding);
    } else {
      rejected.push({
        module: moduleName,
        title: typeof rawTitle === 'string' ? rawTitle : undefined,
        reason: 'schema validation failed',
        issues: result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
      });
    }
  }

  return { accepted, rejected };
}

/**
 * Final revalidation immediately before persistence (Step 6 requirement 2). Trusted
 * identity is injected as parameters, never read off the candidate object.
 */
export function validateFindingForPersistence(
  finding: unknown,
  identity: { auditId: string; tenantId: string; moduleName: string }
): { ok: true; finding: RuntimeFinding } | { ok: false; issues: string[] } {
  TrustedFindingIdentitySchema.parse({ auditId: identity.auditId, tenantId: identity.tenantId });
  const candidate = { ...(finding as Record<string, unknown>), module: identity.moduleName };
  const result = FindingRuntimeSchema.safeParse(candidate);
  if (!result.success) {
    return {
      ok: false,
      issues: result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    };
  }
  return { ok: true, finding: result.data };
}

export type { Evidence, Finding };
