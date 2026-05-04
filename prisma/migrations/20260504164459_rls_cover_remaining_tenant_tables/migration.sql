-- ============================================================================
-- Migration: Add RLS coverage for the remaining first-class tenant-bearing tables
-- Source: PHASE-2.6-RLS-COVERAGE-INVENTORY.md (Phase 2.6-A)
-- Coverage: 16/16 previously-uncovered tenant-bearing models
-- Result: tenant_isolation + tenant_bypass parity for all first-class tenantId tables
-- ============================================================================

-- Policy logic mirrors prisma/migrations/20260429093000_enable_rls/migration.sql:
--   Required tenantId (NOT NULL): USING ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
--   Optional tenantId (nullable):  USING ("tenantId" IS NULL OR "tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
--   WITH CHECK mirrors USING for write protection.
--
-- Bypass logic mirrors prisma/migrations/20260501014500_rls_bypass_policies/migration.sql:
--   USING (current_setting('app.bypass_rls', true) = 'true')
--   WITH CHECK (current_setting('app.bypass_rls', true) = 'true')

-- VERIFIED: CheckoutAttempt -> checkout_attempts
ALTER TABLE "checkout_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "checkout_attempts" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "checkout_attempts";
CREATE POLICY tenant_isolation ON "checkout_attempts"
  FOR ALL
  USING ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid);
DROP POLICY IF EXISTS tenant_bypass ON "checkout_attempts";
CREATE POLICY tenant_bypass ON "checkout_attempts"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

-- VERIFIED: AuditTrailEvent -> AuditTrailEvent
ALTER TABLE "AuditTrailEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditTrailEvent" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "AuditTrailEvent";
CREATE POLICY tenant_isolation ON "AuditTrailEvent"
  FOR ALL
  USING ("tenantId" IS NULL OR "tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId" IS NULL OR "tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid);
DROP POLICY IF EXISTS tenant_bypass ON "AuditTrailEvent";
CREATE POLICY tenant_bypass ON "AuditTrailEvent"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

-- VERIFIED: CircuitBreakerState -> CircuitBreakerState
ALTER TABLE "CircuitBreakerState" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CircuitBreakerState" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "CircuitBreakerState";
CREATE POLICY tenant_isolation ON "CircuitBreakerState"
  FOR ALL
  USING ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid);
DROP POLICY IF EXISTS tenant_bypass ON "CircuitBreakerState";
CREATE POLICY tenant_bypass ON "CircuitBreakerState"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

-- VERIFIED: DeadLetterQueue -> DeadLetterQueue
ALTER TABLE "DeadLetterQueue" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DeadLetterQueue" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "DeadLetterQueue";
CREATE POLICY tenant_isolation ON "DeadLetterQueue"
  FOR ALL
  USING ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid);
DROP POLICY IF EXISTS tenant_bypass ON "DeadLetterQueue";
CREATE POLICY tenant_bypass ON "DeadLetterQueue"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

-- VERIFIED: ClientDashboard -> ClientDashboard
ALTER TABLE "ClientDashboard" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ClientDashboard" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ClientDashboard";
CREATE POLICY tenant_isolation ON "ClientDashboard"
  FOR ALL
  USING ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid);
DROP POLICY IF EXISTS tenant_bypass ON "ClientDashboard";
CREATE POLICY tenant_bypass ON "ClientDashboard"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

-- VERIFIED: UpsellOpportunity -> UpsellOpportunity
ALTER TABLE "UpsellOpportunity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UpsellOpportunity" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "UpsellOpportunity";
CREATE POLICY tenant_isolation ON "UpsellOpportunity"
  FOR ALL
  USING ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid);
DROP POLICY IF EXISTS tenant_bypass ON "UpsellOpportunity";
CREATE POLICY tenant_bypass ON "UpsellOpportunity"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

-- VERIFIED: NotificationPreference -> NotificationPreference
ALTER TABLE "NotificationPreference" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NotificationPreference" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "NotificationPreference";
CREATE POLICY tenant_isolation ON "NotificationPreference"
  FOR ALL
  USING ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid);
DROP POLICY IF EXISTS tenant_bypass ON "NotificationPreference";
CREATE POLICY tenant_bypass ON "NotificationPreference"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

-- VERIFIED: ScheduledAuditRun -> ScheduledAuditRun
ALTER TABLE "ScheduledAuditRun" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ScheduledAuditRun" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ScheduledAuditRun";
CREATE POLICY tenant_isolation ON "ScheduledAuditRun"
  FOR ALL
  USING ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid);
DROP POLICY IF EXISTS tenant_bypass ON "ScheduledAuditRun";
CREATE POLICY tenant_bypass ON "ScheduledAuditRun"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

-- VERIFIED: CompetitorSignal -> CompetitorSignal
ALTER TABLE "CompetitorSignal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CompetitorSignal" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "CompetitorSignal";
CREATE POLICY tenant_isolation ON "CompetitorSignal"
  FOR ALL
  USING ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid);
DROP POLICY IF EXISTS tenant_bypass ON "CompetitorSignal";
CREATE POLICY tenant_bypass ON "CompetitorSignal"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

-- VERIFIED: ReEngagementCampaign -> ReEngagementCampaign
ALTER TABLE "ReEngagementCampaign" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReEngagementCampaign" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ReEngagementCampaign";
CREATE POLICY tenant_isolation ON "ReEngagementCampaign"
  FOR ALL
  USING ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid);
DROP POLICY IF EXISTS tenant_bypass ON "ReEngagementCampaign";
CREATE POLICY tenant_bypass ON "ReEngagementCampaign"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

-- VERIFIED: WinBackCampaign -> WinBackCampaign
ALTER TABLE "WinBackCampaign" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WinBackCampaign" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "WinBackCampaign";
CREATE POLICY tenant_isolation ON "WinBackCampaign"
  FOR ALL
  USING ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid);
DROP POLICY IF EXISTS tenant_bypass ON "WinBackCampaign";
CREATE POLICY tenant_bypass ON "WinBackCampaign"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

-- VERIFIED: PromptVersion -> PromptVersion
ALTER TABLE "PromptVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PromptVersion" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "PromptVersion";
CREATE POLICY tenant_isolation ON "PromptVersion"
  FOR ALL
  USING ("tenantId" IS NULL OR "tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId" IS NULL OR "tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid);
DROP POLICY IF EXISTS tenant_bypass ON "PromptVersion";
CREATE POLICY tenant_bypass ON "PromptVersion"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

-- VERIFIED: PromptPerformanceLog -> PromptPerformanceLog
ALTER TABLE "PromptPerformanceLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PromptPerformanceLog" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "PromptPerformanceLog";
CREATE POLICY tenant_isolation ON "PromptPerformanceLog"
  FOR ALL
  USING ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid);
DROP POLICY IF EXISTS tenant_bypass ON "PromptPerformanceLog";
CREATE POLICY tenant_bypass ON "PromptPerformanceLog"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

-- VERIFIED: ABExperiment -> ABExperiment
ALTER TABLE "ABExperiment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ABExperiment" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ABExperiment";
CREATE POLICY tenant_isolation ON "ABExperiment"
  FOR ALL
  USING ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid);
DROP POLICY IF EXISTS tenant_bypass ON "ABExperiment";
CREATE POLICY tenant_bypass ON "ABExperiment"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

-- VERIFIED: Prediction -> Prediction
ALTER TABLE "Prediction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Prediction" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Prediction";
CREATE POLICY tenant_isolation ON "Prediction"
  FOR ALL
  USING ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid);
DROP POLICY IF EXISTS tenant_bypass ON "Prediction";
CREATE POLICY tenant_bypass ON "Prediction"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

-- VERIFIED: Scenario -> Scenario
ALTER TABLE "Scenario" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Scenario" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Scenario";
CREATE POLICY tenant_isolation ON "Scenario"
  FOR ALL
  USING ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid);
DROP POLICY IF EXISTS tenant_bypass ON "Scenario";
CREATE POLICY tenant_bypass ON "Scenario"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');
