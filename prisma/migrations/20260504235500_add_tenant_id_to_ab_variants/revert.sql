-- ============================================================================
-- Revert: Remove direct tenantId coverage for ABVariant
-- Revert pair for 20260504235500_add_tenant_id_to_ab_variants/migration.sql
-- This file is informational; Prisma does not auto-run reverts.
-- ============================================================================

DROP POLICY IF EXISTS tenant_bypass ON "ABVariant";
DROP POLICY IF EXISTS tenant_isolation ON "ABVariant";
ALTER TABLE "ABVariant" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "ABVariant" DISABLE ROW LEVEL SECURITY;
DROP INDEX IF EXISTS "ABVariant_tenantId_idx";
ALTER TABLE "ABVariant" DROP CONSTRAINT IF EXISTS "ABVariant_tenantId_fkey";
ALTER TABLE "ABVariant" DROP COLUMN IF EXISTS "tenantId";
