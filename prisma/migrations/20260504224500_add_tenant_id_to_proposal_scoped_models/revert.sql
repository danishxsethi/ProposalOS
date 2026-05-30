-- ============================================================================
-- Revert: Remove direct tenantId coverage for proposal-scoped communication models
-- Revert pair for 20260504224500_add_tenant_id_to_proposal_scoped_models/migration.sql
-- This file is informational; Prisma does not auto-run reverts.
-- ============================================================================

DROP POLICY IF EXISTS tenant_bypass ON "ConversationState";
DROP POLICY IF EXISTS tenant_isolation ON "ConversationState";
ALTER TABLE "ConversationState" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "ConversationState" DISABLE ROW LEVEL SECURITY;
DROP INDEX IF EXISTS "ConversationState_tenantId_idx";
ALTER TABLE "ConversationState" DROP CONSTRAINT IF EXISTS "ConversationState_tenantId_fkey";
ALTER TABLE "ConversationState" DROP COLUMN IF EXISTS "tenantId";

DROP POLICY IF EXISTS tenant_bypass ON "ObjectionLog";
DROP POLICY IF EXISTS tenant_isolation ON "ObjectionLog";
ALTER TABLE "ObjectionLog" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "ObjectionLog" DISABLE ROW LEVEL SECURITY;
DROP INDEX IF EXISTS "ObjectionLog_tenantId_idx";
ALTER TABLE "ObjectionLog" DROP CONSTRAINT IF EXISTS "ObjectionLog_tenantId_fkey";
ALTER TABLE "ObjectionLog" DROP COLUMN IF EXISTS "tenantId";

DROP POLICY IF EXISTS tenant_bypass ON "EmailSequence";
DROP POLICY IF EXISTS tenant_isolation ON "EmailSequence";
ALTER TABLE "EmailSequence" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "EmailSequence" DISABLE ROW LEVEL SECURITY;
DROP INDEX IF EXISTS "EmailSequence_tenantId_idx";
ALTER TABLE "EmailSequence" DROP CONSTRAINT IF EXISTS "EmailSequence_tenantId_fkey";
ALTER TABLE "EmailSequence" DROP COLUMN IF EXISTS "tenantId";
