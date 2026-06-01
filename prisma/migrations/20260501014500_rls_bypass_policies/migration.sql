-- ============================================================================
-- Migration: Add RLS bypass policies for explicitly-audited cross-tenant flows
-- Generated from prisma/migrations/20260429093000_enable_rls/migration.sql VERIFIED comments
-- Source coverage: 50/50 tables match existing tenant_isolation policies
-- IMPORTANT: when adding new tables to tenant_isolation, also add their tenant_bypass policy here or in a new migration
-- ============================================================================

-- This migration intentionally adds a second permissive policy to the same
-- tables already covered by tenant_isolation. PostgreSQL OR-combines permissive
-- policies, so tenant_bypass only opens access when the runtime sets:
--   set_config('app.bypass_rls', 'true', true)

-- VERIFIED SOURCE: Audit -> Audit
DROP POLICY IF EXISTS tenant_bypass ON "Audit";
CREATE POLICY tenant_bypass ON "Audit"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

-- VERIFIED SOURCE: Finding -> Finding
DROP POLICY IF EXISTS tenant_bypass ON "Finding";
CREATE POLICY tenant_bypass ON "Finding"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

-- VERIFIED SOURCE: Proposal -> Proposal
DROP POLICY IF EXISTS tenant_bypass ON "Proposal";
CREATE POLICY tenant_bypass ON "Proposal"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

-- VERIFIED SOURCE: ProposalAcceptance -> ProposalAcceptance
DROP POLICY IF EXISTS tenant_bypass ON "ProposalAcceptance";
CREATE POLICY tenant_bypass ON "ProposalAcceptance"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

-- VERIFIED SOURCE: ProposalView -> ProposalView
DROP POLICY IF EXISTS tenant_bypass ON "ProposalView";
CREATE POLICY tenant_bypass ON "ProposalView"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

-- VERIFIED SOURCE: ContactRequest -> ContactRequest
DROP POLICY IF EXISTS tenant_bypass ON "ContactRequest";
CREATE POLICY tenant_bypass ON "ContactRequest"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

-- VERIFIED SOURCE: ProposalFollowUp -> ProposalFollowUp
DROP POLICY IF EXISTS tenant_bypass ON "ProposalFollowUp";
CREATE POLICY tenant_bypass ON "ProposalFollowUp"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

-- VERIFIED SOURCE: EvidenceSnapshot -> EvidenceSnapshot
DROP POLICY IF EXISTS tenant_bypass ON "EvidenceSnapshot";
CREATE POLICY tenant_bypass ON "EvidenceSnapshot"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

-- VERIFIED SOURCE: ProposalTemplate -> ProposalTemplate
DROP POLICY IF EXISTS tenant_bypass ON "ProposalTemplate";
CREATE POLICY tenant_bypass ON "ProposalTemplate"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

-- VERIFIED SOURCE: User -> User
DROP POLICY IF EXISTS tenant_bypass ON "User";
CREATE POLICY tenant_bypass ON "User"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

-- VERIFIED SOURCE: Invitation -> Invitation
DROP POLICY IF EXISTS tenant_bypass ON "Invitation";
CREATE POLICY tenant_bypass ON "Invitation"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

-- VERIFIED SOURCE: Playbook -> Playbook
DROP POLICY IF EXISTS tenant_bypass ON "Playbook";
CREATE POLICY tenant_bypass ON "Playbook"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

-- VERIFIED SOURCE: AuditSchedule -> AuditSchedule
DROP POLICY IF EXISTS tenant_bypass ON "AuditSchedule";
CREATE POLICY tenant_bypass ON "AuditSchedule"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

-- VERIFIED SOURCE: AuditTarget -> AuditTarget
DROP POLICY IF EXISTS tenant_bypass ON "AuditTarget";
CREATE POLICY tenant_bypass ON "AuditTarget"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

-- VERIFIED SOURCE: ProspectDiscoveryJob -> ProspectDiscoveryJob
DROP POLICY IF EXISTS tenant_bypass ON "ProspectDiscoveryJob";
CREATE POLICY tenant_bypass ON "ProspectDiscoveryJob"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

-- VERIFIED SOURCE: ProspectLead -> ProspectLead
DROP POLICY IF EXISTS tenant_bypass ON "ProspectLead";
CREATE POLICY tenant_bypass ON "ProspectLead"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

-- VERIFIED SOURCE: ProspectEnrichmentRun -> ProspectEnrichmentRun
DROP POLICY IF EXISTS tenant_bypass ON "ProspectEnrichmentRun";
CREATE POLICY tenant_bypass ON "ProspectEnrichmentRun"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

-- VERIFIED SOURCE: OutreachSendingDomain -> OutreachSendingDomain
DROP POLICY IF EXISTS tenant_bypass ON "OutreachSendingDomain";
CREATE POLICY tenant_bypass ON "OutreachSendingDomain"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

-- VERIFIED SOURCE: OutreachDomainDailyStat -> OutreachDomainDailyStat
DROP POLICY IF EXISTS tenant_bypass ON "OutreachDomainDailyStat";
CREATE POLICY tenant_bypass ON "OutreachDomainDailyStat"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

-- VERIFIED SOURCE: OutreachEmail -> OutreachEmail
DROP POLICY IF EXISTS tenant_bypass ON "OutreachEmail";
CREATE POLICY tenant_bypass ON "OutreachEmail"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

-- VERIFIED SOURCE: OutreachEmailEvent -> OutreachEmailEvent
DROP POLICY IF EXISTS tenant_bypass ON "OutreachEmailEvent";
CREATE POLICY tenant_bypass ON "OutreachEmailEvent"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

-- VERIFIED SOURCE: ApiKey -> ApiKey
DROP POLICY IF EXISTS tenant_bypass ON "ApiKey";
CREATE POLICY tenant_bypass ON "ApiKey"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

-- VERIFIED SOURCE: TenantBranding -> TenantBranding
DROP POLICY IF EXISTS tenant_bypass ON "TenantBranding";
CREATE POLICY tenant_bypass ON "TenantBranding"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

-- VERIFIED SOURCE: ProspectStateTransition -> ProspectStateTransition
DROP POLICY IF EXISTS tenant_bypass ON "ProspectStateTransition";
CREATE POLICY tenant_bypass ON "ProspectStateTransition"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

-- VERIFIED SOURCE: DeliveryTask -> DeliveryTask
DROP POLICY IF EXISTS tenant_bypass ON "DeliveryTask";
CREATE POLICY tenant_bypass ON "DeliveryTask"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

-- VERIFIED SOURCE: PipelineConfig -> PipelineConfig
DROP POLICY IF EXISTS tenant_bypass ON "PipelineConfig";
CREATE POLICY tenant_bypass ON "PipelineConfig"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

-- VERIFIED SOURCE: PipelineErrorLog -> PipelineErrorLog
DROP POLICY IF EXISTS tenant_bypass ON "PipelineErrorLog";
CREATE POLICY tenant_bypass ON "PipelineErrorLog"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

-- VERIFIED SOURCE: OutreachTemplatePerformance -> OutreachTemplatePerformance
DROP POLICY IF EXISTS tenant_bypass ON "OutreachTemplatePerformance";
CREATE POLICY tenant_bypass ON "OutreachTemplatePerformance"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

-- VERIFIED SOURCE: WinLossRecord -> WinLossRecord
DROP POLICY IF EXISTS tenant_bypass ON "WinLossRecord";
CREATE POLICY tenant_bypass ON "WinLossRecord"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

-- VERIFIED SOURCE: PreWarmingAction -> PreWarmingAction
DROP POLICY IF EXISTS tenant_bypass ON "PreWarmingAction";
CREATE POLICY tenant_bypass ON "PreWarmingAction"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

-- VERIFIED SOURCE: DetectedSignal -> DetectedSignal
DROP POLICY IF EXISTS tenant_bypass ON "DetectedSignal";
CREATE POLICY tenant_bypass ON "DetectedSignal"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

-- VERIFIED SOURCE: ChatConversation -> ChatConversation
DROP POLICY IF EXISTS tenant_bypass ON "ChatConversation";
CREATE POLICY tenant_bypass ON "ChatConversation"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

-- VERIFIED SOURCE: PartnerDeliveredLead -> PartnerDeliveredLead
DROP POLICY IF EXISTS tenant_bypass ON "PartnerDeliveredLead";
CREATE POLICY tenant_bypass ON "PartnerDeliveredLead"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

-- VERIFIED SOURCE: ProposalOutreach -> ProposalOutreach
DROP POLICY IF EXISTS tenant_bypass ON "ProposalOutreach";
CREATE POLICY tenant_bypass ON "ProposalOutreach"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

-- VERIFIED SOURCE: FollowUpEmailSend -> FollowUpEmailSend
DROP POLICY IF EXISTS tenant_bypass ON "FollowUpEmailSend";
CREATE POLICY tenant_bypass ON "FollowUpEmailSend"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

-- VERIFIED SOURCE: UsageRecord -> UsageRecord
DROP POLICY IF EXISTS tenant_bypass ON "UsageRecord";
CREATE POLICY tenant_bypass ON "UsageRecord"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

-- VERIFIED SOURCE: FailedWebhookEvent -> failed_webhook_events
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'failed_webhook_events') THEN
    DROP POLICY IF EXISTS tenant_bypass ON "failed_webhook_events";
    CREATE POLICY tenant_bypass ON "failed_webhook_events"
      FOR ALL
      USING (current_setting('app.bypass_rls', true) = 'true')
      WITH CHECK (current_setting('app.bypass_rls', true) = 'true');
  END IF;
END $$;

-- VERIFIED SOURCE: CartAbandonmentEvent -> cart_abandonment_events
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cart_abandonment_events') THEN
    DROP POLICY IF EXISTS tenant_bypass ON "cart_abandonment_events";
    CREATE POLICY tenant_bypass ON "cart_abandonment_events"
      FOR ALL
      USING (current_setting('app.bypass_rls', true) = 'true')
      WITH CHECK (current_setting('app.bypass_rls', true) = 'true');
  END IF;
END $$;

-- VERIFIED SOURCE: Subscription -> subscriptions
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'subscriptions') THEN
    DROP POLICY IF EXISTS tenant_bypass ON "subscriptions";
    CREATE POLICY tenant_bypass ON "subscriptions"
      FOR ALL
      USING (current_setting('app.bypass_rls', true) = 'true')
      WITH CHECK (current_setting('app.bypass_rls', true) = 'true');
  END IF;
END $$;

-- VERIFIED SOURCE: Payment -> payments
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payments') THEN
    DROP POLICY IF EXISTS tenant_bypass ON "payments";
    CREATE POLICY tenant_bypass ON "payments"
      FOR ALL
      USING (current_setting('app.bypass_rls', true) = 'true')
      WITH CHECK (current_setting('app.bypass_rls', true) = 'true');
  END IF;
END $$;

-- VERIFIED SOURCE: GeneratedArtifact -> GeneratedArtifact
DROP POLICY IF EXISTS tenant_bypass ON "GeneratedArtifact";
CREATE POLICY tenant_bypass ON "GeneratedArtifact"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

-- VERIFIED SOURCE: DeliveryBundle -> DeliveryBundle
DROP POLICY IF EXISTS tenant_bypass ON "DeliveryBundle";
CREATE POLICY tenant_bypass ON "DeliveryBundle"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

-- VERIFIED SOURCE: AdversarialQARun -> AdversarialQARun
DROP POLICY IF EXISTS tenant_bypass ON "AdversarialQARun";
CREATE POLICY tenant_bypass ON "AdversarialQARun"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

-- VERIFIED SOURCE: HallucinationLog -> HallucinationLog
DROP POLICY IF EXISTS tenant_bypass ON "HallucinationLog";
CREATE POLICY tenant_bypass ON "HallucinationLog"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

-- VERIFIED SOURCE: HumanReviewFlag -> HumanReviewFlag
DROP POLICY IF EXISTS tenant_bypass ON "HumanReviewFlag";
CREATE POLICY tenant_bypass ON "HumanReviewFlag"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

-- VERIFIED SOURCE: Project -> Project
DROP POLICY IF EXISTS tenant_bypass ON "Project";
CREATE POLICY tenant_bypass ON "Project"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

-- VERIFIED SOURCE: NPSSurvey -> NPSSurvey
DROP POLICY IF EXISTS tenant_bypass ON "NPSSurvey";
CREATE POLICY tenant_bypass ON "NPSSurvey"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

-- VERIFIED SOURCE: QATelemetry -> QATelemetry
DROP POLICY IF EXISTS tenant_bypass ON "QATelemetry";
CREATE POLICY tenant_bypass ON "QATelemetry"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

-- VERIFIED SOURCE: MonitoringConfig -> MonitoringConfig
DROP POLICY IF EXISTS tenant_bypass ON "MonitoringConfig";
CREATE POLICY tenant_bypass ON "MonitoringConfig"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

-- VERIFIED SOURCE: LocationGroup -> LocationGroup
DROP POLICY IF EXISTS tenant_bypass ON "LocationGroup";
CREATE POLICY tenant_bypass ON "LocationGroup"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');
