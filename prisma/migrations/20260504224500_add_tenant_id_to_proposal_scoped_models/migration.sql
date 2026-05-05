-- ============================================================================
-- Migration: Add direct tenantId coverage for proposal-scoped communication models
-- Source: PHASE-2.6-C-SCHEMA-GAP-PLAN.md (Phase 2.6-E implementation batch)
-- Coverage: ConversationState, ObjectionLog, EmailSequence
-- ============================================================================

-- Step 1: add nullable tenantId columns
ALTER TABLE "ConversationState" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "ObjectionLog" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "EmailSequence" ADD COLUMN "tenantId" TEXT;

-- Step 2: deterministic backfill from parent Proposal
UPDATE "ConversationState" AS child
SET "tenantId" = proposal."tenantId"
FROM "Proposal" AS proposal
WHERE child."proposalId" = proposal."id"
  AND child."tenantId" IS NULL;

UPDATE "ObjectionLog" AS child
SET "tenantId" = proposal."tenantId"
FROM "Proposal" AS proposal
WHERE child."proposalId" = proposal."id"
  AND child."tenantId" IS NULL;

UPDATE "EmailSequence" AS child
SET "tenantId" = proposal."tenantId"
FROM "Proposal" AS proposal
WHERE child."proposalId" = proposal."id"
  AND child."tenantId" IS NULL;

-- Step 3: fail fast if any orphan or unbackfilled row remains
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "ConversationState" WHERE "tenantId" IS NULL) THEN
    RAISE EXCEPTION 'ConversationState tenantId backfill failed: NULL tenantId rows remain';
  END IF;

  IF EXISTS (SELECT 1 FROM "ObjectionLog" WHERE "tenantId" IS NULL) THEN
    RAISE EXCEPTION 'ObjectionLog tenantId backfill failed: NULL tenantId rows remain';
  END IF;

  IF EXISTS (SELECT 1 FROM "EmailSequence" WHERE "tenantId" IS NULL) THEN
    RAISE EXCEPTION 'EmailSequence tenantId backfill failed: NULL tenantId rows remain';
  END IF;
END
$$;

-- Step 4: lock in relational integrity
ALTER TABLE "ConversationState" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "ObjectionLog" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "EmailSequence" ALTER COLUMN "tenantId" SET NOT NULL;

ALTER TABLE "ConversationState"
  ADD CONSTRAINT "ConversationState_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ObjectionLog"
  ADD CONSTRAINT "ObjectionLog_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailSequence"
  ADD CONSTRAINT "EmailSequence_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "ConversationState_tenantId_idx" ON "ConversationState"("tenantId");
CREATE INDEX IF NOT EXISTS "ObjectionLog_tenantId_idx" ON "ObjectionLog"("tenantId");
CREATE INDEX IF NOT EXISTS "EmailSequence_tenantId_idx" ON "EmailSequence"("tenantId");

-- Step 5: enable RLS and add tenant_isolation + tenant_bypass parity
ALTER TABLE "ConversationState" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ConversationState" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ConversationState";
CREATE POLICY tenant_isolation ON "ConversationState"
  FOR ALL
  USING ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid);
DROP POLICY IF EXISTS tenant_bypass ON "ConversationState";
CREATE POLICY tenant_bypass ON "ConversationState"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

ALTER TABLE "ObjectionLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ObjectionLog" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ObjectionLog";
CREATE POLICY tenant_isolation ON "ObjectionLog"
  FOR ALL
  USING ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid);
DROP POLICY IF EXISTS tenant_bypass ON "ObjectionLog";
CREATE POLICY tenant_bypass ON "ObjectionLog"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

ALTER TABLE "EmailSequence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmailSequence" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "EmailSequence";
CREATE POLICY tenant_isolation ON "EmailSequence"
  FOR ALL
  USING ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid);
DROP POLICY IF EXISTS tenant_bypass ON "EmailSequence";
CREATE POLICY tenant_bypass ON "EmailSequence"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');
