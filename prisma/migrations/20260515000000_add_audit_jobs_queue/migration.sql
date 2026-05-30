-- ============================================================================
-- Migration: Add AuditJob durable queue table
-- Task #11: Replace sequential in-process batch with durable job queue
-- ============================================================================

CREATE TABLE "audit_jobs" (
  "id"              TEXT        NOT NULL,
  "tenantId"        TEXT        NOT NULL,
  "batchId"         TEXT        NOT NULL,
  "auditId"         TEXT        NOT NULL,
  "idempotencyKey"  TEXT        NOT NULL,
  "status"          TEXT        NOT NULL DEFAULT 'QUEUED',
  "attempts"        INTEGER     NOT NULL DEFAULT 0,
  "maxAttempts"     INTEGER     NOT NULL DEFAULT 3,
  "errorMessage"    TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt"       TIMESTAMP(3),
  "completedAt"     TIMESTAMP(3),

  CONSTRAINT "audit_jobs_pkey" PRIMARY KEY ("id")
);

-- Unique idempotency key — prevents duplicate jobs for same audit+batch
CREATE UNIQUE INDEX "audit_jobs_idempotencyKey_key" ON "audit_jobs"("idempotencyKey");

-- Efficient batch status queries (tenant-scoped)
CREATE INDEX "audit_jobs_tenantId_batchId_idx" ON "audit_jobs"("tenantId", "batchId");

-- Worker claim: find next QUEUED job ordered by age
CREATE INDEX "audit_jobs_status_createdAt_idx" ON "audit_jobs"("status", "createdAt");

-- Batch status rollup
CREATE INDEX "audit_jobs_batchId_idx" ON "audit_jobs"("batchId");

-- Foreign key to Tenant
ALTER TABLE "audit_jobs"
  ADD CONSTRAINT "audit_jobs_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Row Level Security ───────────────────────────────────────────────────────
-- Same pattern as all other tenant-bearing tables in this codebase.

ALTER TABLE "audit_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_jobs" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "audit_jobs";
CREATE POLICY tenant_isolation ON "audit_jobs"
  FOR ALL
  USING (((current_user = 'postgres' AND (current_setting('app.current_tenant_id', true) = '' OR current_setting('app.current_tenant_id', true) IS NULL)) OR "tenantId"::text = current_setting('app.current_tenant_id', true)))
  WITH CHECK (((current_user = 'postgres' AND (current_setting('app.current_tenant_id', true) = '' OR current_setting('app.current_tenant_id', true) IS NULL)) OR "tenantId"::text = current_setting('app.current_tenant_id', true)));

DROP POLICY IF EXISTS tenant_bypass ON "audit_jobs";
CREATE POLICY tenant_bypass ON "audit_jobs"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');
