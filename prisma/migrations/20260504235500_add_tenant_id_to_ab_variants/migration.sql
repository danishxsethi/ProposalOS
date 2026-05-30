-- ============================================================================
-- Migration: Add direct tenantId coverage for ABVariant
-- Source: PHASE-2.6-C-SCHEMA-GAP-PLAN.md (Phase 2.6-G implementation batch)
-- Coverage: ABVariant
-- ============================================================================
--
-- REMEDIATION NOTE (2026-05-14):
-- ABVariant is defined in schema.prisma but was not included in the
-- 20260227000000_init migration. The entire migration is wrapped in a DO block
-- so it is skipped gracefully on a fresh empty-DB replay while still applying
-- correctly on databases where ABVariant already exists.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ABVariant') THEN

    -- Step 1: add nullable tenantId column (only if not already present)
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'ABVariant' AND column_name = 'tenantId'
    ) THEN
      ALTER TABLE "ABVariant" ADD COLUMN "tenantId" TEXT;
    END IF;

    -- Step 2: deterministic backfill from parent ABExperiment
    UPDATE "ABVariant" AS child
    SET "tenantId" = experiment."tenantId"
    FROM "ABExperiment" AS experiment
    WHERE child."experimentId" = experiment."id"
      AND child."tenantId" IS NULL;

    -- Step 3: fail fast if any orphan or unbackfilled row remains
    IF EXISTS (SELECT 1 FROM "ABVariant" WHERE "tenantId" IS NULL) THEN
      RAISE EXCEPTION 'ABVariant tenantId backfill failed: NULL tenantId rows remain';
    END IF;

    -- Step 4: lock in relational integrity
    ALTER TABLE "ABVariant" ALTER COLUMN "tenantId" SET NOT NULL;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE table_schema = 'public' AND table_name = 'ABVariant' AND constraint_name = 'ABVariant_tenantId_fkey'
    ) THEN
      ALTER TABLE "ABVariant"
        ADD CONSTRAINT "ABVariant_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    CREATE INDEX IF NOT EXISTS "ABVariant_tenantId_idx" ON "ABVariant"("tenantId");

    -- Step 5: enable RLS and add tenant_isolation + tenant_bypass parity
    ALTER TABLE "ABVariant" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "ABVariant" FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS tenant_isolation ON "ABVariant";
    CREATE POLICY tenant_isolation ON "ABVariant"
      FOR ALL
      USING (((current_user = 'postgres' AND (current_setting('app.current_tenant_id', true) = '' OR current_setting('app.current_tenant_id', true) IS NULL)) OR "tenantId"::text = current_setting('app.current_tenant_id', true)))
      WITH CHECK (((current_user = 'postgres' AND (current_setting('app.current_tenant_id', true) = '' OR current_setting('app.current_tenant_id', true) IS NULL)) OR "tenantId"::text = current_setting('app.current_tenant_id', true)));
    DROP POLICY IF EXISTS tenant_bypass ON "ABVariant";
    CREATE POLICY tenant_bypass ON "ABVariant"
      FOR ALL
      USING (current_setting('app.bypass_rls', true) = 'true')
      WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

  END IF;
END $$;
