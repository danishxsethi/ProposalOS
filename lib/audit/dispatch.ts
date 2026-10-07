/**
 * lib/audit/dispatch.ts
 *
 * Shared entry point for kicking off ONE audit's execution durably (P1-24 / P1-20 /
 * P0-22 / P0-23).
 *
 * Every audit-creation call site (authenticated /api/audit, /api/v1/audit,
 * /api/public/audit, /api/client/scan, the sniper worker, and scheduled re-audits)
 * should call this instead of either:
 *   - fire-and-forget calling runAudit() directly in-process (lost on crash/redeploy,
 *     no retry, no durability — the exact defect P1-20 describes), or
 *   - creating a QUEUED Audit row and never triggering execution at all (P0-22/P0-23).
 *
 * This enqueues a single-item AuditJob (batchId == auditId — a "batch of one") through
 * the same durable queue used by the batch endpoint. Execution then happens via the
 * worker (push-dispatched via WORKER_DISPATCH_URL, or picked up by the
 * `audit-job-sweep` cron poller — see cron.yaml).
 */

import { type AuditJobRecord, enqueueAuditJob } from '@/lib/queue/auditJobQueue';
import { runWithTenantAsync } from '@/lib/tenant/context';

export interface DispatchAuditExecutionInput {
  tenantId: string;
  auditId: string;
  push?: boolean;
  generateProposal?: boolean;
}

/**
 * Enqueue a single audit for durable execution. Idempotent — calling this more than
 * once for the same auditId is a no-op after the first call.
 */
export async function dispatchAuditExecution(
  input: DispatchAuditExecutionInput
): Promise<AuditJobRecord> {
  const job = await runWithTenantAsync(input.tenantId, () =>
    enqueueAuditJob({
      tenantId: input.tenantId,
      batchId: input.auditId,
      auditId: input.auditId,
      idempotencyKey: `single:${input.auditId}`,
      dispatch: input.push !== false,
      generateProposal: input.generateProposal,
    })
  );
  return job;
}
