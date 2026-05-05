-- ============================================================================
-- Revert: Remove direct tenantId coverage for audit-scoped portal models
-- Revert pair for 20260504184154_add_tenant_id_to_audit_scoped_models/migration.sql
-- This file is informational; Prisma does not auto-run reverts.
-- ============================================================================

DROP POLICY IF EXISTS tenant_bypass ON "FindingStatus";
DROP POLICY IF EXISTS tenant_isolation ON "FindingStatus";
ALTER TABLE "FindingStatus" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "FindingStatus" DISABLE ROW LEVEL SECURITY;
DROP INDEX IF EXISTS "FindingStatus_tenantId_idx";
ALTER TABLE "FindingStatus" DROP CONSTRAINT IF EXISTS "FindingStatus_tenantId_fkey";
ALTER TABLE "FindingStatus" DROP COLUMN IF EXISTS "tenantId";

DROP POLICY IF EXISTS tenant_bypass ON "ClientMessage";
DROP POLICY IF EXISTS tenant_isolation ON "ClientMessage";
ALTER TABLE "ClientMessage" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "ClientMessage" DISABLE ROW LEVEL SECURITY;
DROP INDEX IF EXISTS "ClientMessage_tenantId_idx";
ALTER TABLE "ClientMessage" DROP CONSTRAINT IF EXISTS "ClientMessage_tenantId_fkey";
ALTER TABLE "ClientMessage" DROP COLUMN IF EXISTS "tenantId";

DROP POLICY IF EXISTS tenant_bypass ON "ReviewSnapshot";
DROP POLICY IF EXISTS tenant_isolation ON "ReviewSnapshot";
ALTER TABLE "ReviewSnapshot" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "ReviewSnapshot" DISABLE ROW LEVEL SECURITY;
DROP INDEX IF EXISTS "ReviewSnapshot_tenantId_idx";
ALTER TABLE "ReviewSnapshot" DROP CONSTRAINT IF EXISTS "ReviewSnapshot_tenantId_fkey";
ALTER TABLE "ReviewSnapshot" DROP COLUMN IF EXISTS "tenantId";
