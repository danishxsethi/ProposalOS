-- ============================================================================
-- Migration: Enable Row Level Security on all tenant-scoped tables
-- Created: 2026-02-25
-- 
-- This migration adds database-level tenant isolation as a defense-in-depth
-- layer on top of the application-level AsyncLocalStorage scoping.
--
-- To APPLY:  psql $DATABASE_URL -f prisma/migrations/rls/enable_rls.sql
-- To REVERT: psql $DATABASE_URL -f prisma/migrations/rls/revert_rls.sql
-- ============================================================================

-- Step 1: Create the application role (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user;
  END IF;
END
$$;

-- Step 2: Grant connect + usage on all objects to app_user
GRANT CONNECT ON DATABASE postgres TO app_user;
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;

-- ============================================================================
-- Step 3: Enable RLS on all tenant-scoped tables and create policies
-- 
-- Policy logic:
--   Required tenantId (NOT NULL): USING ("tenantId" = current_setting('app.current_tenant_id', true))
--   Optional tenantId (nullable):  USING ("tenantId" IS NULL OR "tenantId" = current_setting('app.current_tenant_id', true))
--   Tables without tenantId:       No RLS (Tenant, global config tables)
-- ============================================================================

-- Helper: current_setting with 'true' as missing_ok means returns NULL instead of error when not set,
-- which causes zero rows returned — correct fail-closed behavior.

-- ── Audit ──────────────────────────────────────────────────────────────────
ALTER TABLE "Audit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Audit" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Audit";
CREATE POLICY tenant_isolation ON "Audit"
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- ── Finding ────────────────────────────────────────────────────────────────
ALTER TABLE "Finding" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Finding" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Finding";
CREATE POLICY tenant_isolation ON "Finding"
  FOR ALL
  USING ("tenantId" IS NULL OR "tenantId" = current_setting('app.current_tenant_id', true));

-- ── Proposal ───────────────────────────────────────────────────────────────
ALTER TABLE "Proposal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Proposal" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Proposal";
CREATE POLICY tenant_isolation ON "Proposal"
  FOR ALL
  USING ("tenantId" IS NULL OR "tenantId" = current_setting('app.current_tenant_id', true));

-- ── ProposalAcceptance ─────────────────────────────────────────────────────
-- Joins via proposalId; no direct tenantId — skip RLS, rely on Proposal RLS

-- ── ContactRequest ─────────────────────────────────────────────────────────
ALTER TABLE "ContactRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ContactRequest" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ContactRequest";
CREATE POLICY tenant_isolation ON "ContactRequest"
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- ── ProposalFollowUp ───────────────────────────────────────────────────────
ALTER TABLE "ProposalFollowUp" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProposalFollowUp" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProposalFollowUp";
CREATE POLICY tenant_isolation ON "ProposalFollowUp"
  FOR ALL
  USING ("tenantId" IS NULL OR "tenantId" = current_setting('app.current_tenant_id', true));

-- ── EvidenceSnapshot ───────────────────────────────────────────────────────
ALTER TABLE "EvidenceSnapshot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EvidenceSnapshot" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "EvidenceSnapshot";
CREATE POLICY tenant_isolation ON "EvidenceSnapshot"
  FOR ALL
  USING ("tenantId" IS NULL OR "tenantId" = current_setting('app.current_tenant_id', true));

-- ── ProposalTemplate ───────────────────────────────────────────────────────
ALTER TABLE "ProposalTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProposalTemplate" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProposalTemplate";
CREATE POLICY tenant_isolation ON "ProposalTemplate"
  FOR ALL
  USING ("tenantId" IS NULL OR "tenantId" = current_setting('app.current_tenant_id', true));

-- ── User ───────────────────────────────────────────────────────────────────
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "User";
CREATE POLICY tenant_isolation ON "User"
  FOR ALL
  USING ("tenantId" IS NULL OR "tenantId" = current_setting('app.current_tenant_id', true));

-- ── Invitation ─────────────────────────────────────────────────────────────
ALTER TABLE "Invitation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Invitation" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Invitation";
CREATE POLICY tenant_isolation ON "Invitation"
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- ── Playbook ───────────────────────────────────────────────────────────────
ALTER TABLE "Playbook" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Playbook" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Playbook";
CREATE POLICY tenant_isolation ON "Playbook"
  FOR ALL
  USING ("tenantId" IS NULL OR "tenantId" = current_setting('app.current_tenant_id', true));

-- ── AuditSchedule ──────────────────────────────────────────────────────────
ALTER TABLE "AuditSchedule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditSchedule" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "AuditSchedule";
CREATE POLICY tenant_isolation ON "AuditSchedule"
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- ── AuditTarget ────────────────────────────────────────────────────────────
-- ALTER TABLE "AuditTarget" ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE "AuditTarget" FORCE ROW LEVEL SECURITY;
-- DROP POLICY IF EXISTS tenant_isolation ON "AuditTarget";
-- CREATE POLICY tenant_isolation ON "AuditTarget"
--   FOR ALL
--   USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- ── ProspectDiscoveryJob ───────────────────────────────────────────────────
ALTER TABLE "ProspectDiscoveryJob" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProspectDiscoveryJob" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProspectDiscoveryJob";
CREATE POLICY tenant_isolation ON "ProspectDiscoveryJob"
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- ── ProspectLead ───────────────────────────────────────────────────────────
ALTER TABLE "ProspectLead" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProspectLead" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProspectLead";
CREATE POLICY tenant_isolation ON "ProspectLead"
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- ── ProspectEnrichmentRun ──────────────────────────────────────────────────
ALTER TABLE "ProspectEnrichmentRun" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProspectEnrichmentRun" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProspectEnrichmentRun";
CREATE POLICY tenant_isolation ON "ProspectEnrichmentRun"
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- ── OutreachSendingDomain ──────────────────────────────────────────────────
ALTER TABLE "OutreachSendingDomain" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OutreachSendingDomain" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "OutreachSendingDomain";
CREATE POLICY tenant_isolation ON "OutreachSendingDomain"
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- ── OutreachDomainDailyStat ────────────────────────────────────────────────
ALTER TABLE "OutreachDomainDailyStat" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OutreachDomainDailyStat" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "OutreachDomainDailyStat";
CREATE POLICY tenant_isolation ON "OutreachDomainDailyStat"
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- ── OutreachEmail ──────────────────────────────────────────────────────────
ALTER TABLE "OutreachEmail" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OutreachEmail" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "OutreachEmail";
CREATE POLICY tenant_isolation ON "OutreachEmail"
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- ── OutreachEmailEvent ─────────────────────────────────────────────────────
ALTER TABLE "OutreachEmailEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OutreachEmailEvent" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "OutreachEmailEvent";
CREATE POLICY tenant_isolation ON "OutreachEmailEvent"
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- ── ApiKey ─────────────────────────────────────────────────────────────────
ALTER TABLE "ApiKey" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ApiKey" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ApiKey";
CREATE POLICY tenant_isolation ON "ApiKey"
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- ── TenantBranding ─────────────────────────────────────────────────────────
-- Single row per tenant; tenantId IS the PK — no additional RLS needed beyond the
-- unique constraint; but add anyway for defense-in-depth.
ALTER TABLE "TenantBranding" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TenantBranding" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "TenantBranding";
CREATE POLICY tenant_isolation ON "TenantBranding"
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- ── ProspectStateTransition ────────────────────────────────────────────────
ALTER TABLE "ProspectStateTransition" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProspectStateTransition" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProspectStateTransition";
CREATE POLICY tenant_isolation ON "ProspectStateTransition"
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- ── DeliveryTask ───────────────────────────────────────────────────────────
ALTER TABLE "DeliveryTask" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DeliveryTask" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "DeliveryTask";
CREATE POLICY tenant_isolation ON "DeliveryTask"
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- ── PipelineConfig ─────────────────────────────────────────────────────────
ALTER TABLE "PipelineConfig" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PipelineConfig" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "PipelineConfig";
CREATE POLICY tenant_isolation ON "PipelineConfig"
  FOR ALL
  USING ("tenantId" IS NULL OR "tenantId" = current_setting('app.current_tenant_id', true));

-- ── PipelineErrorLog ───────────────────────────────────────────────────────
ALTER TABLE "PipelineErrorLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PipelineErrorLog" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "PipelineErrorLog";
CREATE POLICY tenant_isolation ON "PipelineErrorLog"
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- ── WinLossRecord ──────────────────────────────────────────────────────────
ALTER TABLE "WinLossRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WinLossRecord" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "WinLossRecord";
CREATE POLICY tenant_isolation ON "WinLossRecord"
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- ── PreWarmingAction ───────────────────────────────────────────────────────
ALTER TABLE "PreWarmingAction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PreWarmingAction" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "PreWarmingAction";
CREATE POLICY tenant_isolation ON "PreWarmingAction"
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- ── DetectedSignal ─────────────────────────────────────────────────────────
ALTER TABLE "DetectedSignal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DetectedSignal" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "DetectedSignal";
CREATE POLICY tenant_isolation ON "DetectedSignal"
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- ── ChatConversation ───────────────────────────────────────────────────────
ALTER TABLE "ChatConversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ChatConversation" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ChatConversation";
CREATE POLICY tenant_isolation ON "ChatConversation"
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- ── Project ────────────────────────────────────────────────────────────────
ALTER TABLE "Project" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Project" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Project";
CREATE POLICY tenant_isolation ON "Project"
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- ── NPSSurvey ──────────────────────────────────────────────────────────────
ALTER TABLE "NPSSurvey" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NPSSurvey" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "NPSSurvey";
CREATE POLICY tenant_isolation ON "NPSSurvey"
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- ── QATelemetry ────────────────────────────────────────────────────────────
ALTER TABLE "QATelemetry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QATelemetry" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "QATelemetry";
CREATE POLICY tenant_isolation ON "QATelemetry"
  FOR ALL
  USING ("tenantId" IS NULL OR "tenantId" = current_setting('app.current_tenant_id', true));

-- ── UsageRecord ────────────────────────────────────────────────────────────
ALTER TABLE "UsageRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UsageRecord" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "UsageRecord";
CREATE POLICY tenant_isolation ON "UsageRecord"
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- ── ProposalOutreach ───────────────────────────────────────────────────────
ALTER TABLE "ProposalOutreach" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProposalOutreach" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProposalOutreach";
CREATE POLICY tenant_isolation ON "ProposalOutreach"
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- ── FollowUpEmailSend ──────────────────────────────────────────────────────
ALTER TABLE "FollowUpEmailSend" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FollowUpEmailSend" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "FollowUpEmailSend";
CREATE POLICY tenant_isolation ON "FollowUpEmailSend"
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- Step 4: Validation query — without setting app.current_tenant_id, returns 0 rows
-- Run this after applying the migration:
--   SET app.current_tenant_id = '';
--   SELECT COUNT(*) FROM "Audit"; -- Must return 0
--   SELECT COUNT(*) FROM "Proposal"; -- Must return 0
