-- ============================================================================
-- Migration: Enable Row Level Security on tenant-scoped tables
-- Source: merged from prisma/enable_rls.sql (tracked) + prisma/migrations/rls/enable_rls.sql (untracked-then-tracked)
-- Reconciliation: 2026-04-29 Phase 2.1.5
-- Coverage: target 50/67 multi-tenant models
-- Known remaining gaps: CheckoutAttempt, Metric, AuditTrailEvent, CircuitBreakerState, DeadLetterQueue, ClientDashboard, UpsellOpportunity, NotificationPreference, ScheduledAuditRun, CompetitorSignal, ReEngagementCampaign, WinBackCampaign, PromptVersion, PromptPerformanceLog, ABExperiment, Prediction, Scenario
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
DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO app_user', current_database());
END
$$;
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;

-- ============================================================================
-- Step 3: Enable RLS on merged tenant-scoped coverage set
-- Policy logic:
--   Required tenantId (NOT NULL): USING ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
--   Optional tenantId (nullable):  USING ("tenantId" IS NULL OR "tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
--   WITH CHECK mirrors USING for write protection.
-- ============================================================================

-- TODO Phase 2.4: define explicit bypass policy for system/admin context
-- e.g. CREATE POLICY system_bypass ON <table> FOR ALL
--   USING (current_setting('app.bypass_rls', true) = 'true')
--   WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

-- VERIFIED: Audit -> Audit
ALTER TABLE "Audit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Audit" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Audit";
CREATE POLICY tenant_isolation ON "Audit"
  FOR ALL
  USING ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid);

-- VERIFIED: Finding -> Finding
ALTER TABLE "Finding" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Finding" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Finding";
CREATE POLICY tenant_isolation ON "Finding"
  FOR ALL
  USING ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid);

-- VERIFIED: Proposal -> Proposal
ALTER TABLE "Proposal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Proposal" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Proposal";
CREATE POLICY tenant_isolation ON "Proposal"
  FOR ALL
  USING ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid);

-- VERIFIED: ProposalAcceptance -> ProposalAcceptance
ALTER TABLE "ProposalAcceptance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProposalAcceptance" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProposalAcceptance";
CREATE POLICY tenant_isolation ON "ProposalAcceptance"
  FOR ALL
  USING ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid);

-- VERIFIED: ProposalView -> ProposalView
ALTER TABLE "ProposalView" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProposalView" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProposalView";
CREATE POLICY tenant_isolation ON "ProposalView"
  FOR ALL
  USING ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid);

-- VERIFIED: ContactRequest -> ContactRequest
ALTER TABLE "ContactRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ContactRequest" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ContactRequest";
CREATE POLICY tenant_isolation ON "ContactRequest"
  FOR ALL
  USING ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid);

-- VERIFIED: ProposalFollowUp -> ProposalFollowUp
ALTER TABLE "ProposalFollowUp" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProposalFollowUp" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProposalFollowUp";
CREATE POLICY tenant_isolation ON "ProposalFollowUp"
  FOR ALL
  USING ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid);

-- VERIFIED: EvidenceSnapshot -> EvidenceSnapshot
ALTER TABLE "EvidenceSnapshot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EvidenceSnapshot" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "EvidenceSnapshot";
CREATE POLICY tenant_isolation ON "EvidenceSnapshot"
  FOR ALL
  USING ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid);

-- VERIFIED: ProposalTemplate -> ProposalTemplate
ALTER TABLE "ProposalTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProposalTemplate" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProposalTemplate";
CREATE POLICY tenant_isolation ON "ProposalTemplate"
  FOR ALL
  USING ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid);

-- VERIFIED: User -> User
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "User";
CREATE POLICY tenant_isolation ON "User"
  FOR ALL
  USING ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid);

-- VERIFIED: Invitation -> Invitation
ALTER TABLE "Invitation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Invitation" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Invitation";
CREATE POLICY tenant_isolation ON "Invitation"
  FOR ALL
  USING ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid);

-- VERIFIED: Playbook -> Playbook
ALTER TABLE "Playbook" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Playbook" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Playbook";
CREATE POLICY tenant_isolation ON "Playbook"
  FOR ALL
  USING ("tenantId" IS NULL OR "tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId" IS NULL OR "tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid);

-- VERIFIED: AuditSchedule -> AuditSchedule
ALTER TABLE "AuditSchedule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditSchedule" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "AuditSchedule";
CREATE POLICY tenant_isolation ON "AuditSchedule"
  FOR ALL
  USING ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid);

-- VERIFIED: AuditTarget -> AuditTarget
ALTER TABLE "AuditTarget" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditTarget" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "AuditTarget";
CREATE POLICY tenant_isolation ON "AuditTarget"
  FOR ALL
  USING ("tenantId" IS NULL OR "tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId" IS NULL OR "tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid);

-- VERIFIED: ProspectDiscoveryJob -> ProspectDiscoveryJob
ALTER TABLE "ProspectDiscoveryJob" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProspectDiscoveryJob" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProspectDiscoveryJob";
CREATE POLICY tenant_isolation ON "ProspectDiscoveryJob"
  FOR ALL
  USING ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid);

-- VERIFIED: ProspectLead -> ProspectLead
ALTER TABLE "ProspectLead" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProspectLead" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProspectLead";
CREATE POLICY tenant_isolation ON "ProspectLead"
  FOR ALL
  USING ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid);

-- VERIFIED: ProspectEnrichmentRun -> ProspectEnrichmentRun
ALTER TABLE "ProspectEnrichmentRun" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProspectEnrichmentRun" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProspectEnrichmentRun";
CREATE POLICY tenant_isolation ON "ProspectEnrichmentRun"
  FOR ALL
  USING ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid);

-- VERIFIED: OutreachSendingDomain -> OutreachSendingDomain
ALTER TABLE "OutreachSendingDomain" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OutreachSendingDomain" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "OutreachSendingDomain";
CREATE POLICY tenant_isolation ON "OutreachSendingDomain"
  FOR ALL
  USING ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid);

-- VERIFIED: OutreachDomainDailyStat -> OutreachDomainDailyStat
ALTER TABLE "OutreachDomainDailyStat" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OutreachDomainDailyStat" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "OutreachDomainDailyStat";
CREATE POLICY tenant_isolation ON "OutreachDomainDailyStat"
  FOR ALL
  USING ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid);

-- VERIFIED: OutreachEmail -> OutreachEmail
ALTER TABLE "OutreachEmail" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OutreachEmail" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "OutreachEmail";
CREATE POLICY tenant_isolation ON "OutreachEmail"
  FOR ALL
  USING ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid);

-- VERIFIED: OutreachEmailEvent -> OutreachEmailEvent
ALTER TABLE "OutreachEmailEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OutreachEmailEvent" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "OutreachEmailEvent";
CREATE POLICY tenant_isolation ON "OutreachEmailEvent"
  FOR ALL
  USING ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid);

-- VERIFIED: ApiKey -> ApiKey
ALTER TABLE "ApiKey" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ApiKey" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ApiKey";
CREATE POLICY tenant_isolation ON "ApiKey"
  FOR ALL
  USING ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid);

-- VERIFIED: TenantBranding -> TenantBranding
ALTER TABLE "TenantBranding" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TenantBranding" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "TenantBranding";
CREATE POLICY tenant_isolation ON "TenantBranding"
  FOR ALL
  USING ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid);

-- VERIFIED: ProspectStateTransition -> ProspectStateTransition
ALTER TABLE "ProspectStateTransition" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProspectStateTransition" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProspectStateTransition";
CREATE POLICY tenant_isolation ON "ProspectStateTransition"
  FOR ALL
  USING ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid);

-- VERIFIED: DeliveryTask -> DeliveryTask
ALTER TABLE "DeliveryTask" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DeliveryTask" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "DeliveryTask";
CREATE POLICY tenant_isolation ON "DeliveryTask"
  FOR ALL
  USING ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid);

-- VERIFIED: PipelineConfig -> PipelineConfig
ALTER TABLE "PipelineConfig" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PipelineConfig" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "PipelineConfig";
CREATE POLICY tenant_isolation ON "PipelineConfig"
  FOR ALL
  USING ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid);

-- VERIFIED: PipelineErrorLog -> PipelineErrorLog
ALTER TABLE "PipelineErrorLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PipelineErrorLog" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "PipelineErrorLog";
CREATE POLICY tenant_isolation ON "PipelineErrorLog"
  FOR ALL
  USING ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid);

-- VERIFIED: OutreachTemplatePerformance -> OutreachTemplatePerformance
ALTER TABLE "OutreachTemplatePerformance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OutreachTemplatePerformance" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "OutreachTemplatePerformance";
CREATE POLICY tenant_isolation ON "OutreachTemplatePerformance"
  FOR ALL
  USING ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid);

-- VERIFIED: WinLossRecord -> WinLossRecord
ALTER TABLE "WinLossRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WinLossRecord" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "WinLossRecord";
CREATE POLICY tenant_isolation ON "WinLossRecord"
  FOR ALL
  USING ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid);

-- VERIFIED: PreWarmingAction -> PreWarmingAction
ALTER TABLE "PreWarmingAction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PreWarmingAction" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "PreWarmingAction";
CREATE POLICY tenant_isolation ON "PreWarmingAction"
  FOR ALL
  USING ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid);

-- VERIFIED: DetectedSignal -> DetectedSignal
ALTER TABLE "DetectedSignal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DetectedSignal" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "DetectedSignal";
CREATE POLICY tenant_isolation ON "DetectedSignal"
  FOR ALL
  USING ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid);

-- VERIFIED: ChatConversation -> ChatConversation
ALTER TABLE "ChatConversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ChatConversation" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ChatConversation";
CREATE POLICY tenant_isolation ON "ChatConversation"
  FOR ALL
  USING ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid);

-- VERIFIED: PartnerDeliveredLead -> PartnerDeliveredLead
ALTER TABLE "PartnerDeliveredLead" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PartnerDeliveredLead" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "PartnerDeliveredLead";
CREATE POLICY tenant_isolation ON "PartnerDeliveredLead"
  FOR ALL
  USING ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid);

-- VERIFIED: ProposalOutreach -> ProposalOutreach
ALTER TABLE "ProposalOutreach" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProposalOutreach" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProposalOutreach";
CREATE POLICY tenant_isolation ON "ProposalOutreach"
  FOR ALL
  USING ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid);

-- VERIFIED: FollowUpEmailSend -> FollowUpEmailSend
ALTER TABLE "FollowUpEmailSend" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FollowUpEmailSend" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "FollowUpEmailSend";
CREATE POLICY tenant_isolation ON "FollowUpEmailSend"
  FOR ALL
  USING ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid);

-- VERIFIED: UsageRecord -> UsageRecord
ALTER TABLE "UsageRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UsageRecord" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "UsageRecord";
CREATE POLICY tenant_isolation ON "UsageRecord"
  FOR ALL
  USING ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid);

-- VERIFIED: FailedWebhookEvent -> failed_webhook_events
ALTER TABLE "failed_webhook_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "failed_webhook_events" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "failed_webhook_events";
CREATE POLICY tenant_isolation ON "failed_webhook_events"
  FOR ALL
  USING ("tenantId" IS NULL OR "tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId" IS NULL OR "tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid);

-- VERIFIED: CartAbandonmentEvent -> cart_abandonment_events
ALTER TABLE "cart_abandonment_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cart_abandonment_events" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "cart_abandonment_events";
CREATE POLICY tenant_isolation ON "cart_abandonment_events"
  FOR ALL
  USING ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid);

-- VERIFIED: Subscription -> subscriptions
ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subscriptions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "subscriptions";
CREATE POLICY tenant_isolation ON "subscriptions"
  FOR ALL
  USING ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid);

-- VERIFIED: Payment -> payments
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payments" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "payments";
CREATE POLICY tenant_isolation ON "payments"
  FOR ALL
  USING ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid);

-- VERIFIED: GeneratedArtifact -> GeneratedArtifact
ALTER TABLE "GeneratedArtifact" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GeneratedArtifact" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "GeneratedArtifact";
CREATE POLICY tenant_isolation ON "GeneratedArtifact"
  FOR ALL
  USING ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid);

-- VERIFIED: DeliveryBundle -> DeliveryBundle
ALTER TABLE "DeliveryBundle" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DeliveryBundle" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "DeliveryBundle";
CREATE POLICY tenant_isolation ON "DeliveryBundle"
  FOR ALL
  USING ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid);

-- VERIFIED: AdversarialQARun -> AdversarialQARun
ALTER TABLE "AdversarialQARun" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AdversarialQARun" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "AdversarialQARun";
CREATE POLICY tenant_isolation ON "AdversarialQARun"
  FOR ALL
  USING ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid);

-- VERIFIED: HallucinationLog -> HallucinationLog
ALTER TABLE "HallucinationLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HallucinationLog" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "HallucinationLog";
CREATE POLICY tenant_isolation ON "HallucinationLog"
  FOR ALL
  USING ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid);

-- VERIFIED: HumanReviewFlag -> HumanReviewFlag
ALTER TABLE "HumanReviewFlag" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HumanReviewFlag" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "HumanReviewFlag";
CREATE POLICY tenant_isolation ON "HumanReviewFlag"
  FOR ALL
  USING ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid);

-- VERIFIED: Project -> Project
ALTER TABLE "Project" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Project" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Project";
CREATE POLICY tenant_isolation ON "Project"
  FOR ALL
  USING ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid);

-- VERIFIED: NPSSurvey -> NPSSurvey
ALTER TABLE "NPSSurvey" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NPSSurvey" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "NPSSurvey";
CREATE POLICY tenant_isolation ON "NPSSurvey"
  FOR ALL
  USING ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid);

-- VERIFIED: QATelemetry -> QATelemetry
ALTER TABLE "QATelemetry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QATelemetry" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "QATelemetry";
CREATE POLICY tenant_isolation ON "QATelemetry"
  FOR ALL
  USING ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid);

-- VERIFIED: MonitoringConfig -> MonitoringConfig
ALTER TABLE "MonitoringConfig" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MonitoringConfig" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "MonitoringConfig";
CREATE POLICY tenant_isolation ON "MonitoringConfig"
  FOR ALL
  USING ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid);

-- VERIFIED: LocationGroup -> LocationGroup
ALTER TABLE "LocationGroup" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LocationGroup" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "LocationGroup";
CREATE POLICY tenant_isolation ON "LocationGroup"
  FOR ALL
  USING ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId"::uuid = current_setting('app.current_tenant_id', true)::uuid);
-- COVERAGE MANIFEST
-- Models with policies in this migration: Audit, Finding, Proposal, ProposalAcceptance, ProposalView, ContactRequest, ProposalFollowUp, EvidenceSnapshot, ProposalTemplate, User, Invitation, Playbook, AuditSchedule, AuditTarget, ProspectDiscoveryJob, ProspectLead, ProspectEnrichmentRun, OutreachSendingDomain, OutreachDomainDailyStat, OutreachEmail, OutreachEmailEvent, ApiKey, TenantBranding, ProspectStateTransition, DeliveryTask, PipelineConfig, PipelineErrorLog, OutreachTemplatePerformance, WinLossRecord, PreWarmingAction, DetectedSignal, ChatConversation, PartnerDeliveredLead, ProposalOutreach, FollowUpEmailSend, UsageRecord, FailedWebhookEvent, CartAbandonmentEvent, Subscription, Payment, GeneratedArtifact, DeliveryBundle, AdversarialQARun, HallucinationLog, HumanReviewFlag, Project, NPSSurvey, QATelemetry, MonitoringConfig, LocationGroup
-- Models with tenantId but NOT covered here (defer to subsequent migrations): CheckoutAttempt, Metric, AuditTrailEvent, CircuitBreakerState, DeadLetterQueue, ClientDashboard, UpsellOpportunity, NotificationPreference, ScheduledAuditRun, CompetitorSignal, ReEngagementCampaign, WinBackCampaign, PromptVersion, PromptPerformanceLog, ABExperiment, Prediction, Scenario
-- Models that should have tenantId but don't (defer to Phase 2.3 schema migration): FindingStatus, ClientMessage, ReviewSnapshot, ConversationState, ObjectionLog, EmailSequence, ABVariant
