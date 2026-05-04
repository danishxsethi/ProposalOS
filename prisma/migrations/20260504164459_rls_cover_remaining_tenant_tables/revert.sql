-- ============================================================================
-- Revert: Drop RLS coverage for the remaining first-class tenant-bearing tables
-- Revert pair for 20260504164459_rls_cover_remaining_tenant_tables/migration.sql
-- This file is informational; Prisma does not auto-run reverts.
-- ============================================================================

DROP POLICY IF EXISTS tenant_bypass ON "checkout_attempts";
DROP POLICY IF EXISTS tenant_isolation ON "checkout_attempts";
ALTER TABLE "checkout_attempts" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "checkout_attempts" DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_bypass ON "AuditTrailEvent";
DROP POLICY IF EXISTS tenant_isolation ON "AuditTrailEvent";
ALTER TABLE "AuditTrailEvent" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "AuditTrailEvent" DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_bypass ON "CircuitBreakerState";
DROP POLICY IF EXISTS tenant_isolation ON "CircuitBreakerState";
ALTER TABLE "CircuitBreakerState" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "CircuitBreakerState" DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_bypass ON "DeadLetterQueue";
DROP POLICY IF EXISTS tenant_isolation ON "DeadLetterQueue";
ALTER TABLE "DeadLetterQueue" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "DeadLetterQueue" DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_bypass ON "ClientDashboard";
DROP POLICY IF EXISTS tenant_isolation ON "ClientDashboard";
ALTER TABLE "ClientDashboard" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "ClientDashboard" DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_bypass ON "UpsellOpportunity";
DROP POLICY IF EXISTS tenant_isolation ON "UpsellOpportunity";
ALTER TABLE "UpsellOpportunity" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "UpsellOpportunity" DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_bypass ON "NotificationPreference";
DROP POLICY IF EXISTS tenant_isolation ON "NotificationPreference";
ALTER TABLE "NotificationPreference" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "NotificationPreference" DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_bypass ON "ScheduledAuditRun";
DROP POLICY IF EXISTS tenant_isolation ON "ScheduledAuditRun";
ALTER TABLE "ScheduledAuditRun" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "ScheduledAuditRun" DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_bypass ON "CompetitorSignal";
DROP POLICY IF EXISTS tenant_isolation ON "CompetitorSignal";
ALTER TABLE "CompetitorSignal" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "CompetitorSignal" DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_bypass ON "ReEngagementCampaign";
DROP POLICY IF EXISTS tenant_isolation ON "ReEngagementCampaign";
ALTER TABLE "ReEngagementCampaign" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "ReEngagementCampaign" DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_bypass ON "WinBackCampaign";
DROP POLICY IF EXISTS tenant_isolation ON "WinBackCampaign";
ALTER TABLE "WinBackCampaign" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "WinBackCampaign" DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_bypass ON "PromptVersion";
DROP POLICY IF EXISTS tenant_isolation ON "PromptVersion";
ALTER TABLE "PromptVersion" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "PromptVersion" DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_bypass ON "PromptPerformanceLog";
DROP POLICY IF EXISTS tenant_isolation ON "PromptPerformanceLog";
ALTER TABLE "PromptPerformanceLog" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "PromptPerformanceLog" DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_bypass ON "ABExperiment";
DROP POLICY IF EXISTS tenant_isolation ON "ABExperiment";
ALTER TABLE "ABExperiment" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "ABExperiment" DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_bypass ON "Prediction";
DROP POLICY IF EXISTS tenant_isolation ON "Prediction";
ALTER TABLE "Prediction" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "Prediction" DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_bypass ON "Scenario";
DROP POLICY IF EXISTS tenant_isolation ON "Scenario";
ALTER TABLE "Scenario" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "Scenario" DISABLE ROW LEVEL SECURITY;
