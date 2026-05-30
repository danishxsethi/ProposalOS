-- ============================================================================
-- Migration: Add RLS coverage for the remaining first-class tenant-bearing tables
-- Source: PHASE-2.6-RLS-COVERAGE-INVENTORY.md (Phase 2.6-A)
-- Coverage: 16/16 previously-uncovered tenant-bearing models
-- Result: tenant_isolation + tenant_bypass parity for all first-class tenantId tables
-- ============================================================================

-- Policy logic mirrors prisma/migrations/20260429093000_enable_rls/migration.sql:
--   Required tenantId (NOT NULL): USING (((current_user = 'postgres' AND (current_setting('app.current_tenant_id', true) = '' OR current_setting('app.current_tenant_id', true) IS NULL)) OR "tenantId"::text = current_setting('app.current_tenant_id', true)))
--   Optional tenantId (nullable):  USING (((current_user = 'postgres' AND (current_setting('app.current_tenant_id', true) = '' OR current_setting('app.current_tenant_id', true) IS NULL)) OR "tenantId" IS NULL OR "tenantId"::text = current_setting('app.current_tenant_id', true)))
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
  USING (((current_user = 'postgres' AND (current_setting('app.current_tenant_id', true) = '' OR current_setting('app.current_tenant_id', true) IS NULL)) OR "tenantId"::text = current_setting('app.current_tenant_id', true)))
  WITH CHECK (((current_user = 'postgres' AND (current_setting('app.current_tenant_id', true) = '' OR current_setting('app.current_tenant_id', true) IS NULL)) OR "tenantId"::text = current_setting('app.current_tenant_id', true)));
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
  USING (((current_user = 'postgres' AND (current_setting('app.current_tenant_id', true) = '' OR current_setting('app.current_tenant_id', true) IS NULL)) OR "tenantId" IS NULL OR "tenantId"::text = current_setting('app.current_tenant_id', true)))
  WITH CHECK (((current_user = 'postgres' AND (current_setting('app.current_tenant_id', true) = '' OR current_setting('app.current_tenant_id', true) IS NULL)) OR "tenantId" IS NULL OR "tenantId"::text = current_setting('app.current_tenant_id', true)));
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
  USING (((current_user = 'postgres' AND (current_setting('app.current_tenant_id', true) = '' OR current_setting('app.current_tenant_id', true) IS NULL)) OR "tenantId"::text = current_setting('app.current_tenant_id', true)))
  WITH CHECK (((current_user = 'postgres' AND (current_setting('app.current_tenant_id', true) = '' OR current_setting('app.current_tenant_id', true) IS NULL)) OR "tenantId"::text = current_setting('app.current_tenant_id', true)));
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
  USING (((current_user = 'postgres' AND (current_setting('app.current_tenant_id', true) = '' OR current_setting('app.current_tenant_id', true) IS NULL)) OR "tenantId"::text = current_setting('app.current_tenant_id', true)))
  WITH CHECK (((current_user = 'postgres' AND (current_setting('app.current_tenant_id', true) = '' OR current_setting('app.current_tenant_id', true) IS NULL)) OR "tenantId"::text = current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS tenant_bypass ON "DeadLetterQueue";
CREATE POLICY tenant_bypass ON "DeadLetterQueue"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

-- VERIFIED: ClientDashboard -> ClientDashboard
-- Wrapped in DO block: table may not exist on a fresh empty-DB replay.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ClientDashboard') THEN
    ALTER TABLE "ClientDashboard" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "ClientDashboard" FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS tenant_isolation ON "ClientDashboard";
    CREATE POLICY tenant_isolation ON "ClientDashboard"
      FOR ALL
      USING (((current_user = 'postgres' AND (current_setting('app.current_tenant_id', true) = '' OR current_setting('app.current_tenant_id', true) IS NULL)) OR "tenantId"::text = current_setting('app.current_tenant_id', true)))
      WITH CHECK (((current_user = 'postgres' AND (current_setting('app.current_tenant_id', true) = '' OR current_setting('app.current_tenant_id', true) IS NULL)) OR "tenantId"::text = current_setting('app.current_tenant_id', true)));
    DROP POLICY IF EXISTS tenant_bypass ON "ClientDashboard";
    CREATE POLICY tenant_bypass ON "ClientDashboard"
      FOR ALL
      USING (current_setting('app.bypass_rls', true) = 'true')
      WITH CHECK (current_setting('app.bypass_rls', true) = 'true');
  END IF;
END $$;

-- VERIFIED: UpsellOpportunity -> UpsellOpportunity
-- Wrapped in DO block: table may not exist on a fresh empty-DB replay.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'UpsellOpportunity') THEN
    ALTER TABLE "UpsellOpportunity" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "UpsellOpportunity" FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS tenant_isolation ON "UpsellOpportunity";
    CREATE POLICY tenant_isolation ON "UpsellOpportunity"
      FOR ALL
      USING (((current_user = 'postgres' AND (current_setting('app.current_tenant_id', true) = '' OR current_setting('app.current_tenant_id', true) IS NULL)) OR "tenantId"::text = current_setting('app.current_tenant_id', true)))
      WITH CHECK (((current_user = 'postgres' AND (current_setting('app.current_tenant_id', true) = '' OR current_setting('app.current_tenant_id', true) IS NULL)) OR "tenantId"::text = current_setting('app.current_tenant_id', true)));
    DROP POLICY IF EXISTS tenant_bypass ON "UpsellOpportunity";
    CREATE POLICY tenant_bypass ON "UpsellOpportunity"
      FOR ALL
      USING (current_setting('app.bypass_rls', true) = 'true')
      WITH CHECK (current_setting('app.bypass_rls', true) = 'true');
  END IF;
END $$;

-- VERIFIED: NotificationPreference -> NotificationPreference
-- Wrapped in DO block: table may not exist on a fresh empty-DB replay.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'NotificationPreference') THEN
    ALTER TABLE "NotificationPreference" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "NotificationPreference" FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS tenant_isolation ON "NotificationPreference";
    CREATE POLICY tenant_isolation ON "NotificationPreference"
      FOR ALL
      USING (((current_user = 'postgres' AND (current_setting('app.current_tenant_id', true) = '' OR current_setting('app.current_tenant_id', true) IS NULL)) OR "tenantId"::text = current_setting('app.current_tenant_id', true)))
      WITH CHECK (((current_user = 'postgres' AND (current_setting('app.current_tenant_id', true) = '' OR current_setting('app.current_tenant_id', true) IS NULL)) OR "tenantId"::text = current_setting('app.current_tenant_id', true)));
    DROP POLICY IF EXISTS tenant_bypass ON "NotificationPreference";
    CREATE POLICY tenant_bypass ON "NotificationPreference"
      FOR ALL
      USING (current_setting('app.bypass_rls', true) = 'true')
      WITH CHECK (current_setting('app.bypass_rls', true) = 'true');
  END IF;
END $$;

-- VERIFIED: ScheduledAuditRun -> ScheduledAuditRun
-- Wrapped in DO block: table may not exist on a fresh empty-DB replay.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ScheduledAuditRun') THEN
    ALTER TABLE "ScheduledAuditRun" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "ScheduledAuditRun" FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS tenant_isolation ON "ScheduledAuditRun";
    CREATE POLICY tenant_isolation ON "ScheduledAuditRun"
      FOR ALL
      USING (((current_user = 'postgres' AND (current_setting('app.current_tenant_id', true) = '' OR current_setting('app.current_tenant_id', true) IS NULL)) OR "tenantId"::text = current_setting('app.current_tenant_id', true)))
      WITH CHECK (((current_user = 'postgres' AND (current_setting('app.current_tenant_id', true) = '' OR current_setting('app.current_tenant_id', true) IS NULL)) OR "tenantId"::text = current_setting('app.current_tenant_id', true)));
    DROP POLICY IF EXISTS tenant_bypass ON "ScheduledAuditRun";
    CREATE POLICY tenant_bypass ON "ScheduledAuditRun"
      FOR ALL
      USING (current_setting('app.bypass_rls', true) = 'true')
      WITH CHECK (current_setting('app.bypass_rls', true) = 'true');
  END IF;
END $$;

-- VERIFIED: CompetitorSignal -> CompetitorSignal
-- Wrapped in DO block: table may not exist on a fresh empty-DB replay.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'CompetitorSignal') THEN
    ALTER TABLE "CompetitorSignal" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "CompetitorSignal" FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS tenant_isolation ON "CompetitorSignal";
    CREATE POLICY tenant_isolation ON "CompetitorSignal"
      FOR ALL
      USING (((current_user = 'postgres' AND (current_setting('app.current_tenant_id', true) = '' OR current_setting('app.current_tenant_id', true) IS NULL)) OR "tenantId"::text = current_setting('app.current_tenant_id', true)))
      WITH CHECK (((current_user = 'postgres' AND (current_setting('app.current_tenant_id', true) = '' OR current_setting('app.current_tenant_id', true) IS NULL)) OR "tenantId"::text = current_setting('app.current_tenant_id', true)));
    DROP POLICY IF EXISTS tenant_bypass ON "CompetitorSignal";
    CREATE POLICY tenant_bypass ON "CompetitorSignal"
      FOR ALL
      USING (current_setting('app.bypass_rls', true) = 'true')
      WITH CHECK (current_setting('app.bypass_rls', true) = 'true');
  END IF;
END $$;

-- VERIFIED: ReEngagementCampaign -> ReEngagementCampaign
-- Wrapped in DO block: table may not exist on a fresh empty-DB replay.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ReEngagementCampaign') THEN
    ALTER TABLE "ReEngagementCampaign" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "ReEngagementCampaign" FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS tenant_isolation ON "ReEngagementCampaign";
    CREATE POLICY tenant_isolation ON "ReEngagementCampaign"
      FOR ALL
      USING (((current_user = 'postgres' AND (current_setting('app.current_tenant_id', true) = '' OR current_setting('app.current_tenant_id', true) IS NULL)) OR "tenantId"::text = current_setting('app.current_tenant_id', true)))
      WITH CHECK (((current_user = 'postgres' AND (current_setting('app.current_tenant_id', true) = '' OR current_setting('app.current_tenant_id', true) IS NULL)) OR "tenantId"::text = current_setting('app.current_tenant_id', true)));
    DROP POLICY IF EXISTS tenant_bypass ON "ReEngagementCampaign";
    CREATE POLICY tenant_bypass ON "ReEngagementCampaign"
      FOR ALL
      USING (current_setting('app.bypass_rls', true) = 'true')
      WITH CHECK (current_setting('app.bypass_rls', true) = 'true');
  END IF;
END $$;

-- VERIFIED: WinBackCampaign -> WinBackCampaign
-- Wrapped in DO block: table may not exist on a fresh empty-DB replay.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'WinBackCampaign') THEN
    ALTER TABLE "WinBackCampaign" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "WinBackCampaign" FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS tenant_isolation ON "WinBackCampaign";
    CREATE POLICY tenant_isolation ON "WinBackCampaign"
      FOR ALL
      USING (((current_user = 'postgres' AND (current_setting('app.current_tenant_id', true) = '' OR current_setting('app.current_tenant_id', true) IS NULL)) OR "tenantId"::text = current_setting('app.current_tenant_id', true)))
      WITH CHECK (((current_user = 'postgres' AND (current_setting('app.current_tenant_id', true) = '' OR current_setting('app.current_tenant_id', true) IS NULL)) OR "tenantId"::text = current_setting('app.current_tenant_id', true)));
    DROP POLICY IF EXISTS tenant_bypass ON "WinBackCampaign";
    CREATE POLICY tenant_bypass ON "WinBackCampaign"
      FOR ALL
      USING (current_setting('app.bypass_rls', true) = 'true')
      WITH CHECK (current_setting('app.bypass_rls', true) = 'true');
  END IF;
END $$;

-- VERIFIED: PromptVersion -> PromptVersion
-- Wrapped in DO block: table may not exist on a fresh empty-DB replay.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'PromptVersion') THEN
    ALTER TABLE "PromptVersion" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "PromptVersion" FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS tenant_isolation ON "PromptVersion";
    CREATE POLICY tenant_isolation ON "PromptVersion"
      FOR ALL
      USING (((current_user = 'postgres' AND (current_setting('app.current_tenant_id', true) = '' OR current_setting('app.current_tenant_id', true) IS NULL)) OR "tenantId" IS NULL OR "tenantId"::text = current_setting('app.current_tenant_id', true)))
      WITH CHECK (((current_user = 'postgres' AND (current_setting('app.current_tenant_id', true) = '' OR current_setting('app.current_tenant_id', true) IS NULL)) OR "tenantId" IS NULL OR "tenantId"::text = current_setting('app.current_tenant_id', true)));
    DROP POLICY IF EXISTS tenant_bypass ON "PromptVersion";
    CREATE POLICY tenant_bypass ON "PromptVersion"
      FOR ALL
      USING (current_setting('app.bypass_rls', true) = 'true')
      WITH CHECK (current_setting('app.bypass_rls', true) = 'true');
  END IF;
END $$;

-- VERIFIED: PromptPerformanceLog -> PromptPerformanceLog
-- Wrapped in DO block: table may not exist on a fresh empty-DB replay.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'PromptPerformanceLog') THEN
    ALTER TABLE "PromptPerformanceLog" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "PromptPerformanceLog" FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS tenant_isolation ON "PromptPerformanceLog";
    CREATE POLICY tenant_isolation ON "PromptPerformanceLog"
      FOR ALL
      USING (((current_user = 'postgres' AND (current_setting('app.current_tenant_id', true) = '' OR current_setting('app.current_tenant_id', true) IS NULL)) OR "tenantId"::text = current_setting('app.current_tenant_id', true)))
      WITH CHECK (((current_user = 'postgres' AND (current_setting('app.current_tenant_id', true) = '' OR current_setting('app.current_tenant_id', true) IS NULL)) OR "tenantId"::text = current_setting('app.current_tenant_id', true)));
    DROP POLICY IF EXISTS tenant_bypass ON "PromptPerformanceLog";
    CREATE POLICY tenant_bypass ON "PromptPerformanceLog"
      FOR ALL
      USING (current_setting('app.bypass_rls', true) = 'true')
      WITH CHECK (current_setting('app.bypass_rls', true) = 'true');
  END IF;
END $$;

-- VERIFIED: ABExperiment -> ABExperiment
-- Wrapped in DO block: table may not exist on a fresh empty-DB replay.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ABExperiment') THEN
    ALTER TABLE "ABExperiment" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "ABExperiment" FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS tenant_isolation ON "ABExperiment";
    CREATE POLICY tenant_isolation ON "ABExperiment"
      FOR ALL
      USING (((current_user = 'postgres' AND (current_setting('app.current_tenant_id', true) = '' OR current_setting('app.current_tenant_id', true) IS NULL)) OR "tenantId"::text = current_setting('app.current_tenant_id', true)))
      WITH CHECK (((current_user = 'postgres' AND (current_setting('app.current_tenant_id', true) = '' OR current_setting('app.current_tenant_id', true) IS NULL)) OR "tenantId"::text = current_setting('app.current_tenant_id', true)));
    DROP POLICY IF EXISTS tenant_bypass ON "ABExperiment";
    CREATE POLICY tenant_bypass ON "ABExperiment"
      FOR ALL
      USING (current_setting('app.bypass_rls', true) = 'true')
      WITH CHECK (current_setting('app.bypass_rls', true) = 'true');
  END IF;
END $$;

-- VERIFIED: Prediction -> Prediction
-- Wrapped in DO block: table may not exist on a fresh empty-DB replay.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Prediction') THEN
    ALTER TABLE "Prediction" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "Prediction" FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS tenant_isolation ON "Prediction";
    CREATE POLICY tenant_isolation ON "Prediction"
      FOR ALL
      USING (((current_user = 'postgres' AND (current_setting('app.current_tenant_id', true) = '' OR current_setting('app.current_tenant_id', true) IS NULL)) OR "tenantId"::text = current_setting('app.current_tenant_id', true)))
      WITH CHECK (((current_user = 'postgres' AND (current_setting('app.current_tenant_id', true) = '' OR current_setting('app.current_tenant_id', true) IS NULL)) OR "tenantId"::text = current_setting('app.current_tenant_id', true)));
    DROP POLICY IF EXISTS tenant_bypass ON "Prediction";
    CREATE POLICY tenant_bypass ON "Prediction"
      FOR ALL
      USING (current_setting('app.bypass_rls', true) = 'true')
      WITH CHECK (current_setting('app.bypass_rls', true) = 'true');
  END IF;
END $$;

-- VERIFIED: Scenario -> Scenario
-- Wrapped in DO block: table may not exist on a fresh empty-DB replay.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Scenario') THEN
    ALTER TABLE "Scenario" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "Scenario" FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS tenant_isolation ON "Scenario";
    CREATE POLICY tenant_isolation ON "Scenario"
      FOR ALL
      USING (((current_user = 'postgres' AND (current_setting('app.current_tenant_id', true) = '' OR current_setting('app.current_tenant_id', true) IS NULL)) OR "tenantId"::text = current_setting('app.current_tenant_id', true)))
      WITH CHECK (((current_user = 'postgres' AND (current_setting('app.current_tenant_id', true) = '' OR current_setting('app.current_tenant_id', true) IS NULL)) OR "tenantId"::text = current_setting('app.current_tenant_id', true)));
    DROP POLICY IF EXISTS tenant_bypass ON "Scenario";
    CREATE POLICY tenant_bypass ON "Scenario"
      FOR ALL
      USING (current_setting('app.bypass_rls', true) = 'true')
      WITH CHECK (current_setting('app.bypass_rls', true) = 'true');
  END IF;
END $$;
