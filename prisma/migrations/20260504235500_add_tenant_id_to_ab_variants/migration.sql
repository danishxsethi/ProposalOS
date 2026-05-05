-- ============================================================================
-- Migration: Add direct tenantId coverage for ABVariant
-- Source: PHASE-2.6-C-SCHEMA-GAP-PLAN.md (Phase 2.6-G implementation batch)
-- Coverage: ABVariant
-- ============================================================================

-- Step 1: add nullable tenantId column
ALTER TABLE "ABVariant" ADD COLUMN "tenantId" TEXT;

-- Step 2: deterministic backfill from parent ABExperiment
UPDATE "ABVariant" AS child
SET "tenantId" = experiment."tenantId"
FROM "ABExperiment" AS experiment
WHERE child."experimentId" = experiment."id"
  AND child."tenantId" IS NULL;

-- Step 3: fail fast if any orphan or unbackfilled row remains
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "ABVariant" WHERE "tenantId" IS NULL) THEN
    RAISE EXCEPTION 'ABVariant tenantId backfill failed: NULL tenantId rows remain';
  END IF;
END
$$;

-- Step 4: lock in relational integrity
ALTER TABLE "ABVariant" ALTER COLUMN "tenantId" SET NOT NULL;

ALTER TABLE "ABVariant"
  ADD CONSTRAINT "ABVariant_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "ABVariant_tenantId_idx" ON "ABVariant"("tenantId");

-- Step 5: enable RLS and add tenant_isolation + tenant_bypass parity
ALTER TABLE "ABVariant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ABVariant" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ABVariant";
CREATE POLICY tenant_isolation ON "ABVariant"
  FOR ALL
  USING ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid);
DROP POLICY IF EXISTS tenant_bypass ON "ABVariant";
CREATE POLICY tenant_bypass ON "ABVariant"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');
