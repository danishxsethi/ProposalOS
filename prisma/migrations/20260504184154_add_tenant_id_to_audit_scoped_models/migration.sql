-- ============================================================================
-- Migration: Add direct tenantId coverage for audit-scoped portal models
-- Source: PHASE-2.6-C-SCHEMA-GAP-PLAN.md (Phase 2.6-D implementation batch)
-- Coverage: FindingStatus, ClientMessage, ReviewSnapshot
-- ============================================================================

-- Step 1: add nullable tenantId columns
ALTER TABLE "FindingStatus" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "ClientMessage" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "ReviewSnapshot" ADD COLUMN "tenantId" TEXT;

-- Step 2: deterministic backfill from parent Audit
UPDATE "FindingStatus" AS child
SET "tenantId" = audit."tenantId"
FROM "Audit" AS audit
WHERE child."auditId" = audit."id"
  AND child."tenantId" IS NULL;

UPDATE "ClientMessage" AS child
SET "tenantId" = audit."tenantId"
FROM "Audit" AS audit
WHERE child."auditId" = audit."id"
  AND child."tenantId" IS NULL;

UPDATE "ReviewSnapshot" AS child
SET "tenantId" = audit."tenantId"
FROM "Audit" AS audit
WHERE child."auditId" = audit."id"
  AND child."tenantId" IS NULL;

-- Step 3: fail fast if any orphan or unbackfilled row remains
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "FindingStatus" WHERE "tenantId" IS NULL) THEN
    RAISE EXCEPTION 'FindingStatus tenantId backfill failed: NULL tenantId rows remain';
  END IF;

  IF EXISTS (SELECT 1 FROM "ClientMessage" WHERE "tenantId" IS NULL) THEN
    RAISE EXCEPTION 'ClientMessage tenantId backfill failed: NULL tenantId rows remain';
  END IF;

  IF EXISTS (SELECT 1 FROM "ReviewSnapshot" WHERE "tenantId" IS NULL) THEN
    RAISE EXCEPTION 'ReviewSnapshot tenantId backfill failed: NULL tenantId rows remain';
  END IF;
END
$$;

-- Step 4: lock in relational integrity
ALTER TABLE "FindingStatus" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "ClientMessage" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "ReviewSnapshot" ALTER COLUMN "tenantId" SET NOT NULL;

ALTER TABLE "FindingStatus"
  ADD CONSTRAINT "FindingStatus_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientMessage"
  ADD CONSTRAINT "ClientMessage_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReviewSnapshot"
  ADD CONSTRAINT "ReviewSnapshot_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "FindingStatus_tenantId_idx" ON "FindingStatus"("tenantId");
CREATE INDEX IF NOT EXISTS "ClientMessage_tenantId_idx" ON "ClientMessage"("tenantId");
CREATE INDEX IF NOT EXISTS "ReviewSnapshot_tenantId_idx" ON "ReviewSnapshot"("tenantId");

-- Step 5: enable RLS and add tenant_isolation + tenant_bypass parity
ALTER TABLE "FindingStatus" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FindingStatus" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "FindingStatus";
CREATE POLICY tenant_isolation ON "FindingStatus"
  FOR ALL
  USING (((current_user = 'postgres' AND (current_setting('app.current_tenant_id', true) = '' OR current_setting('app.current_tenant_id', true) IS NULL)) OR "tenantId"::text = current_setting('app.current_tenant_id', true)))
  WITH CHECK (((current_user = 'postgres' AND (current_setting('app.current_tenant_id', true) = '' OR current_setting('app.current_tenant_id', true) IS NULL)) OR "tenantId"::text = current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS tenant_bypass ON "FindingStatus";
CREATE POLICY tenant_bypass ON "FindingStatus"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

ALTER TABLE "ClientMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ClientMessage" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ClientMessage";
CREATE POLICY tenant_isolation ON "ClientMessage"
  FOR ALL
  USING (((current_user = 'postgres' AND (current_setting('app.current_tenant_id', true) = '' OR current_setting('app.current_tenant_id', true) IS NULL)) OR "tenantId"::text = current_setting('app.current_tenant_id', true)))
  WITH CHECK (((current_user = 'postgres' AND (current_setting('app.current_tenant_id', true) = '' OR current_setting('app.current_tenant_id', true) IS NULL)) OR "tenantId"::text = current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS tenant_bypass ON "ClientMessage";
CREATE POLICY tenant_bypass ON "ClientMessage"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

ALTER TABLE "ReviewSnapshot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReviewSnapshot" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ReviewSnapshot";
CREATE POLICY tenant_isolation ON "ReviewSnapshot"
  FOR ALL
  USING (((current_user = 'postgres' AND (current_setting('app.current_tenant_id', true) = '' OR current_setting('app.current_tenant_id', true) IS NULL)) OR "tenantId"::text = current_setting('app.current_tenant_id', true)))
  WITH CHECK (((current_user = 'postgres' AND (current_setting('app.current_tenant_id', true) = '' OR current_setting('app.current_tenant_id', true) IS NULL)) OR "tenantId"::text = current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS tenant_bypass ON "ReviewSnapshot";
CREATE POLICY tenant_bypass ON "ReviewSnapshot"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');
