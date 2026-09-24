/**
 * lib/audit/findingPersistence.ts
 *
 * Wave 3 (Step 6 — persistence enforcement boundary): the ONE module allowed to call
 * `prisma.finding.create` / `createMany` / `update` for customer-facing Findings. Every
 * production write to the `Finding` table routes through here, which independently
 * revalidates against the runtime contract (lib/audit/findingContract.ts) immediately
 * before writing — even if a caller already validated upstream (defense in depth).
 *
 * `tests/architecture/finding-persistence-boundary.test.ts` enforces that no other
 * production file touches `prisma.finding.{create,createMany,update,upsert}` directly.
 *
 * `Finding.evidence`/`metrics`/`recommendedFix` are Prisma `Json` columns (P1-09/P2-13 —
 * the schema cannot express these invariants), so this runtime boundary is the actual
 * enforcement point, not the database.
 */
import { logger } from '@/lib/logger';
import { containsSecretLike } from '@/lib/modules/types';
import { prisma } from '@/lib/prisma';

import { RejectedFinding, RuntimeFinding, validateFindingForPersistence } from './findingContract';

import type { Prisma } from '@prisma/client';

export interface PersistFindingsResult {
  persisted: number;
  rejected: RejectedFinding[];
}

export interface AuditEvidenceInput {
  module: string;
  source: string;
  rawResponse: Prisma.InputJsonValue;
  collectedAt?: Date;
  targetUrl?: string | null;
  providerRequestId?: string | null;
  methodVersion?: string | null;
  observationStatus?: string;
}

export interface PersistAuditResultInput {
  auditId: string;
  tenantId: string;
  findings: unknown[];
  evidence: AuditEvidenceInput[];
  auditUpdate: Prisma.AuditUpdateInput;
}

function validateSnapshotPayload(value: unknown, path = 'rawResponse'): void {
  if (typeof value === 'string') {
    if (containsSecretLike(value)) throw new Error(`AUDIT_EVIDENCE_SECRET_REJECTED: ${path}`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => validateSnapshotPayload(item, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (/^(authorization|cookie|set-cookie|api[_-]?key|secret|password|access[_-]?token|refresh[_-]?token)$/i.test(key)) {
        throw new Error(`AUDIT_EVIDENCE_SECRET_REJECTED: ${path}.${key}`);
      }
      validateSnapshotPayload(item, `${path}.${key}`);
    }
  }
}

export interface PersistAuditResult {
  persistedFindings: number;
  persistedEvidence: number;
  rejectedFindings: RejectedFinding[];
}

/** Persist the audit's findings, their source snapshots and trust/status atomically. */
export async function persistAuditResult(input: PersistAuditResultInput): Promise<PersistAuditResult> {
  const rejectedFindings: RejectedFinding[] = [];
  const valid: RuntimeFinding[] = [];

  for (const raw of input.findings) {
    const candidate = raw as Record<string, unknown> | null;
    const moduleName = typeof candidate?.module === 'string' ? candidate.module : 'unknown';
    const result = validateFindingForPersistence(raw, {
      auditId: input.auditId,
      tenantId: input.tenantId,
      moduleName,
    });
    if (result.ok) {
      valid.push(result.finding);
    } else {
      rejectedFindings.push({
        module: moduleName,
        title: typeof candidate?.title === 'string' ? candidate.title : undefined,
        reason: 'rejected at atomic audit persistence',
        issues: result.issues,
      });
    }
  }
  for (const evidence of input.evidence) validateSnapshotPayload(evidence.rawResponse);

  await prisma.$transaction(async (tx) => {
    if (input.evidence.length > 0) {
      await tx.evidenceSnapshot.createMany({
        data: input.evidence.map((snapshot) => ({
          auditId: input.auditId,
          tenantId: input.tenantId,
          module: snapshot.module,
          source: snapshot.source,
          rawResponse: snapshot.rawResponse,
          collectedAt: snapshot.collectedAt ?? new Date(),
          targetUrl: snapshot.targetUrl ?? null,
          providerRequestId: snapshot.providerRequestId ?? null,
          methodVersion: snapshot.methodVersion ?? null,
          observationStatus: snapshot.observationStatus ?? 'COMPLETE',
        })),
      });
    }

    if (valid.length > 0) {
      await tx.finding.createMany({
        data: valid.map((finding) => ({
          module: finding.module,
          category: finding.category,
          type: finding.type,
          title: finding.title,
          description: finding.description,
          evidence: finding.evidence as unknown as Prisma.InputJsonValue,
          metrics: finding.metrics as unknown as Prisma.InputJsonValue,
          impactScore: Math.round(finding.impactScore),
          confidenceScore: Math.round(finding.confidenceScore),
          effortEstimate: finding.effortEstimate,
          recommendedFix: finding.recommendedFix as unknown as Prisma.InputJsonValue,
          auditId: input.auditId,
          tenantId: input.tenantId,
          manuallyEdited: false,
          excluded: false,
        })),
      });
    }

    await tx.audit.update({
      where: { id: input.auditId, tenantId: input.tenantId },
      data: input.auditUpdate,
    });
  });

  if (rejectedFindings.length > 0) {
    logger.warn(
      {
        event: 'audit.findings_rejected_at_atomic_persistence',
        auditId: input.auditId,
        tenantId: input.tenantId,
        rejectedCount: rejectedFindings.length,
        rejectedFindings,
      },
      `[findingPersistence] Persisted valid findings and rejected ${rejectedFindings.length} malformed finding(s)`
    );
  }

  return {
    persistedFindings: valid.length,
    persistedEvidence: input.evidence.length,
    rejectedFindings,
  };
}

/**
 * Persists a batch of already-canonicalized findings for one audit. Trusted identity
 * (`auditId`/`tenantId`) always comes from the function parameters — never from the
 * finding objects themselves (Step 6 requirement 8-9: cross-audit/cross-tenant
 * attribution is impossible by construction, not by trusting caller-supplied fields).
 * Each finding must already carry its own `module` (the trusted value assigned by
 * `normalizeAndValidateModuleFindings` at the adapter boundary); this function does not
 * infer or override it beyond that value, it only re-validates it.
 *
 * Explicit partial-batch policy (Step 6 requirement 11): each finding is independently
 * revalidated; valid findings persist, invalid ones are dropped and returned in
 * `rejected` with structured reasons. A malformed finding in the batch never blocks the
 * valid ones, and never silently vanishes — callers must log/observe `rejected`.
 */
export async function persistFindings(
  auditId: string,
  tenantId: string,
  findings: unknown[]
): Promise<PersistFindingsResult> {
  const rejected: RejectedFinding[] = [];
  const valid: RuntimeFinding[] = [];

  for (const raw of findings) {
    const moduleName =
      typeof (raw as Record<string, unknown>)?.module === 'string'
        ? ((raw as Record<string, unknown>).module as string)
        : 'unknown';
    const result = validateFindingForPersistence(raw, { auditId, tenantId, moduleName });
    if (result.ok) {
      valid.push(result.finding);
    } else {
      const title =
        typeof (raw as Record<string, unknown>)?.title === 'string'
          ? ((raw as Record<string, unknown>).title as string)
          : undefined;
      rejected.push({
        module: moduleName,
        title,
        reason: 'rejected at persistence',
        issues: result.issues,
      });
    }
  }

  if (rejected.length > 0) {
    logger.warn(
      { event: 'audit.findings_rejected_at_persistence', auditId, tenantId, rejected },
      `[findingPersistence] Rejected ${rejected.length} malformed finding(s) before write`
    );
  }

  if (valid.length > 0) {
    await prisma.finding.createMany({
      data: valid.map((f) => ({
        module: f.module,
        category: f.category,
        type: f.type,
        title: f.title,
        description: f.description,
        evidence: f.evidence as unknown as Prisma.InputJsonValue,
        metrics: f.metrics as unknown as Prisma.InputJsonValue,
        impactScore: f.impactScore,
        confidenceScore: f.confidenceScore,
        effortEstimate: f.effortEstimate,
        recommendedFix: f.recommendedFix as unknown as Prisma.InputJsonValue,
        auditId,
        tenantId,
        manuallyEdited: false,
        excluded: false,
      })),
    });
  }

  return { persisted: valid.length, rejected };
}

/** Fields an operator/analyst may edit on an already-persisted finding via the API. */
export interface FindingEditableFields {
  title?: string;
  description?: string;
  impactScore?: number;
  confidenceScore?: number;
  excluded?: boolean;
  effortEstimate?: 'LOW' | 'MEDIUM' | 'HIGH';
}

/**
 * Bounded update of a human-reviewed, already-persisted finding. Never touches
 * evidence/module/auditId/tenantId — those are set once, at creation, by
 * `persistFindings`. Score bounds match the canonical contract (0-10). Callers must
 * perform their own tenant-ownership check (e.g. `findFirst({ where: { id, audit: {
 * tenantId } } })`) before calling this, since Prisma's `update` where-clause can only
 * target a unique id.
 */
export async function updateFindingFields(id: string, fields: FindingEditableFields) {
  const data: Record<string, unknown> = { manuallyEdited: true };

  if (fields.title !== undefined) data.title = fields.title;
  if (fields.description !== undefined) data.description = fields.description;
  if (fields.excluded !== undefined) data.excluded = fields.excluded;
  if (fields.effortEstimate !== undefined) data.effortEstimate = fields.effortEstimate;

  if (fields.impactScore !== undefined) {
    if (fields.impactScore < 0 || fields.impactScore > 10) {
      throw new RangeError('impactScore must be between 0 and 10');
    }
    data.impactScore = fields.impactScore;
  }
  if (fields.confidenceScore !== undefined) {
    if (fields.confidenceScore < 0 || fields.confidenceScore > 10) {
      throw new RangeError('confidenceScore must be between 0 and 10');
    }
    data.confidenceScore = fields.confidenceScore;
  }

  // tenantId is enforced via the caller's ownership check (findFirst with tenant scope)
  // before this is invoked; Prisma's `where: { id }` here matches the existing route's
  // established pattern. Kept as a single-purpose, non-evidence-touching write.
  return prisma.finding.update({ where: { id }, data });
}

/** Soft-deletes a finding (marks excluded, never removed from evidentiary record). */
export async function excludeFinding(id: string) {
  return prisma.finding.update({ where: { id }, data: { excluded: true, manuallyEdited: true } });
}
