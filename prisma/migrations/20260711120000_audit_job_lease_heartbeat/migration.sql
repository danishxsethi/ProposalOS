-- P2-12: AuditJob lease/heartbeat protection.
-- Forward-only, additive migration (nullable columns, no backfill required, no data loss).
-- Rollback: DROP COLUMN each of the four columns and DROP INDEX audit_jobs_status_leaseExpiresAt_idx
-- (safe — no other object depends on them).

ALTER TABLE "audit_jobs" ADD COLUMN "leaseOwner" TEXT;
ALTER TABLE "audit_jobs" ADD COLUMN "leaseToken" TEXT;
ALTER TABLE "audit_jobs" ADD COLUMN "leaseExpiresAt" TIMESTAMP(3);
ALTER TABLE "audit_jobs" ADD COLUMN "lastHeartbeatAt" TIMESTAMP(3);

CREATE INDEX "audit_jobs_status_leaseExpiresAt_idx" ON "audit_jobs"("status", "leaseExpiresAt");
