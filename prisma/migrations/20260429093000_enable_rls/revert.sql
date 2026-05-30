-- Revert pair for 20260429093000_enable_rls/migration.sql
-- Run manually if RLS rollout needs to be undone
-- This file is informational; Prisma does not auto-run reverts.

-- VERIFIED: Audit -> Audit
DROP POLICY IF EXISTS tenant_isolation ON "Audit";
ALTER TABLE "Audit" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "Audit" DISABLE ROW LEVEL SECURITY;

-- VERIFIED: Finding -> Finding
DROP POLICY IF EXISTS tenant_isolation ON "Finding";
ALTER TABLE "Finding" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "Finding" DISABLE ROW LEVEL SECURITY;

-- VERIFIED: Proposal -> Proposal
DROP POLICY IF EXISTS tenant_isolation ON "Proposal";
ALTER TABLE "Proposal" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "Proposal" DISABLE ROW LEVEL SECURITY;

-- VERIFIED: ProposalAcceptance -> ProposalAcceptance
DROP POLICY IF EXISTS tenant_isolation ON "ProposalAcceptance";
ALTER TABLE "ProposalAcceptance" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "ProposalAcceptance" DISABLE ROW LEVEL SECURITY;

-- VERIFIED: ProposalView -> ProposalView
DROP POLICY IF EXISTS tenant_isolation ON "ProposalView";
ALTER TABLE "ProposalView" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "ProposalView" DISABLE ROW LEVEL SECURITY;

-- VERIFIED: ContactRequest -> ContactRequest
DROP POLICY IF EXISTS tenant_isolation ON "ContactRequest";
ALTER TABLE "ContactRequest" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "ContactRequest" DISABLE ROW LEVEL SECURITY;

-- VERIFIED: ProposalFollowUp -> ProposalFollowUp
DROP POLICY IF EXISTS tenant_isolation ON "ProposalFollowUp";
ALTER TABLE "ProposalFollowUp" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "ProposalFollowUp" DISABLE ROW LEVEL SECURITY;

-- VERIFIED: EvidenceSnapshot -> EvidenceSnapshot
DROP POLICY IF EXISTS tenant_isolation ON "EvidenceSnapshot";
ALTER TABLE "EvidenceSnapshot" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "EvidenceSnapshot" DISABLE ROW LEVEL SECURITY;

-- VERIFIED: ProposalTemplate -> ProposalTemplate
DROP POLICY IF EXISTS tenant_isolation ON "ProposalTemplate";
ALTER TABLE "ProposalTemplate" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "ProposalTemplate" DISABLE ROW LEVEL SECURITY;

-- VERIFIED: User -> User
DROP POLICY IF EXISTS tenant_isolation ON "User";
ALTER TABLE "User" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "User" DISABLE ROW LEVEL SECURITY;

-- VERIFIED: Invitation -> Invitation
DROP POLICY IF EXISTS tenant_isolation ON "Invitation";
ALTER TABLE "Invitation" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "Invitation" DISABLE ROW LEVEL SECURITY;

-- VERIFIED: Playbook -> Playbook
DROP POLICY IF EXISTS tenant_isolation ON "Playbook";
ALTER TABLE "Playbook" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "Playbook" DISABLE ROW LEVEL SECURITY;

-- VERIFIED: AuditSchedule -> AuditSchedule
DROP POLICY IF EXISTS tenant_isolation ON "AuditSchedule";
ALTER TABLE "AuditSchedule" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "AuditSchedule" DISABLE ROW LEVEL SECURITY;

-- VERIFIED: AuditTarget -> AuditTarget
DROP POLICY IF EXISTS tenant_isolation ON "AuditTarget";
ALTER TABLE "AuditTarget" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "AuditTarget" DISABLE ROW LEVEL SECURITY;

-- VERIFIED: ProspectDiscoveryJob -> ProspectDiscoveryJob
DROP POLICY IF EXISTS tenant_isolation ON "ProspectDiscoveryJob";
ALTER TABLE "ProspectDiscoveryJob" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "ProspectDiscoveryJob" DISABLE ROW LEVEL SECURITY;

-- VERIFIED: ProspectLead -> ProspectLead
DROP POLICY IF EXISTS tenant_isolation ON "ProspectLead";
ALTER TABLE "ProspectLead" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "ProspectLead" DISABLE ROW LEVEL SECURITY;

-- VERIFIED: ProspectEnrichmentRun -> ProspectEnrichmentRun
DROP POLICY IF EXISTS tenant_isolation ON "ProspectEnrichmentRun";
ALTER TABLE "ProspectEnrichmentRun" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "ProspectEnrichmentRun" DISABLE ROW LEVEL SECURITY;

-- VERIFIED: OutreachSendingDomain -> OutreachSendingDomain
DROP POLICY IF EXISTS tenant_isolation ON "OutreachSendingDomain";
ALTER TABLE "OutreachSendingDomain" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "OutreachSendingDomain" DISABLE ROW LEVEL SECURITY;

-- VERIFIED: OutreachDomainDailyStat -> OutreachDomainDailyStat
DROP POLICY IF EXISTS tenant_isolation ON "OutreachDomainDailyStat";
ALTER TABLE "OutreachDomainDailyStat" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "OutreachDomainDailyStat" DISABLE ROW LEVEL SECURITY;

-- VERIFIED: OutreachEmail -> OutreachEmail
DROP POLICY IF EXISTS tenant_isolation ON "OutreachEmail";
ALTER TABLE "OutreachEmail" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "OutreachEmail" DISABLE ROW LEVEL SECURITY;

-- VERIFIED: OutreachEmailEvent -> OutreachEmailEvent
DROP POLICY IF EXISTS tenant_isolation ON "OutreachEmailEvent";
ALTER TABLE "OutreachEmailEvent" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "OutreachEmailEvent" DISABLE ROW LEVEL SECURITY;

-- VERIFIED: ApiKey -> ApiKey
DROP POLICY IF EXISTS tenant_isolation ON "ApiKey";
ALTER TABLE "ApiKey" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "ApiKey" DISABLE ROW LEVEL SECURITY;

-- VERIFIED: TenantBranding -> TenantBranding
DROP POLICY IF EXISTS tenant_isolation ON "TenantBranding";
ALTER TABLE "TenantBranding" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "TenantBranding" DISABLE ROW LEVEL SECURITY;

-- VERIFIED: ProspectStateTransition -> ProspectStateTransition
DROP POLICY IF EXISTS tenant_isolation ON "ProspectStateTransition";
ALTER TABLE "ProspectStateTransition" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "ProspectStateTransition" DISABLE ROW LEVEL SECURITY;

-- VERIFIED: DeliveryTask -> DeliveryTask
DROP POLICY IF EXISTS tenant_isolation ON "DeliveryTask";
ALTER TABLE "DeliveryTask" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "DeliveryTask" DISABLE ROW LEVEL SECURITY;

-- VERIFIED: PipelineConfig -> PipelineConfig
DROP POLICY IF EXISTS tenant_isolation ON "PipelineConfig";
ALTER TABLE "PipelineConfig" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "PipelineConfig" DISABLE ROW LEVEL SECURITY;

-- VERIFIED: PipelineErrorLog -> PipelineErrorLog
DROP POLICY IF EXISTS tenant_isolation ON "PipelineErrorLog";
ALTER TABLE "PipelineErrorLog" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "PipelineErrorLog" DISABLE ROW LEVEL SECURITY;

-- VERIFIED: OutreachTemplatePerformance -> OutreachTemplatePerformance
DROP POLICY IF EXISTS tenant_isolation ON "OutreachTemplatePerformance";
ALTER TABLE "OutreachTemplatePerformance" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "OutreachTemplatePerformance" DISABLE ROW LEVEL SECURITY;

-- VERIFIED: WinLossRecord -> WinLossRecord
DROP POLICY IF EXISTS tenant_isolation ON "WinLossRecord";
ALTER TABLE "WinLossRecord" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "WinLossRecord" DISABLE ROW LEVEL SECURITY;

-- VERIFIED: PreWarmingAction -> PreWarmingAction
DROP POLICY IF EXISTS tenant_isolation ON "PreWarmingAction";
ALTER TABLE "PreWarmingAction" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "PreWarmingAction" DISABLE ROW LEVEL SECURITY;

-- VERIFIED: DetectedSignal -> DetectedSignal
DROP POLICY IF EXISTS tenant_isolation ON "DetectedSignal";
ALTER TABLE "DetectedSignal" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "DetectedSignal" DISABLE ROW LEVEL SECURITY;

-- VERIFIED: ChatConversation -> ChatConversation
DROP POLICY IF EXISTS tenant_isolation ON "ChatConversation";
ALTER TABLE "ChatConversation" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "ChatConversation" DISABLE ROW LEVEL SECURITY;

-- VERIFIED: PartnerDeliveredLead -> PartnerDeliveredLead
DROP POLICY IF EXISTS tenant_isolation ON "PartnerDeliveredLead";
ALTER TABLE "PartnerDeliveredLead" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "PartnerDeliveredLead" DISABLE ROW LEVEL SECURITY;

-- VERIFIED: ProposalOutreach -> ProposalOutreach
DROP POLICY IF EXISTS tenant_isolation ON "ProposalOutreach";
ALTER TABLE "ProposalOutreach" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "ProposalOutreach" DISABLE ROW LEVEL SECURITY;

-- VERIFIED: FollowUpEmailSend -> FollowUpEmailSend
DROP POLICY IF EXISTS tenant_isolation ON "FollowUpEmailSend";
ALTER TABLE "FollowUpEmailSend" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "FollowUpEmailSend" DISABLE ROW LEVEL SECURITY;

-- VERIFIED: UsageRecord -> UsageRecord
DROP POLICY IF EXISTS tenant_isolation ON "UsageRecord";
ALTER TABLE "UsageRecord" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "UsageRecord" DISABLE ROW LEVEL SECURITY;

-- VERIFIED: FailedWebhookEvent -> failed_webhook_events
DROP POLICY IF EXISTS tenant_isolation ON "failed_webhook_events";
ALTER TABLE "failed_webhook_events" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "failed_webhook_events" DISABLE ROW LEVEL SECURITY;

-- VERIFIED: CartAbandonmentEvent -> cart_abandonment_events
DROP POLICY IF EXISTS tenant_isolation ON "cart_abandonment_events";
ALTER TABLE "cart_abandonment_events" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "cart_abandonment_events" DISABLE ROW LEVEL SECURITY;

-- VERIFIED: Subscription -> subscriptions
DROP POLICY IF EXISTS tenant_isolation ON "subscriptions";
ALTER TABLE "subscriptions" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "subscriptions" DISABLE ROW LEVEL SECURITY;

-- VERIFIED: Payment -> payments
DROP POLICY IF EXISTS tenant_isolation ON "payments";
ALTER TABLE "payments" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "payments" DISABLE ROW LEVEL SECURITY;

-- VERIFIED: GeneratedArtifact -> GeneratedArtifact
DROP POLICY IF EXISTS tenant_isolation ON "GeneratedArtifact";
ALTER TABLE "GeneratedArtifact" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "GeneratedArtifact" DISABLE ROW LEVEL SECURITY;

-- VERIFIED: DeliveryBundle -> DeliveryBundle
DROP POLICY IF EXISTS tenant_isolation ON "DeliveryBundle";
ALTER TABLE "DeliveryBundle" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "DeliveryBundle" DISABLE ROW LEVEL SECURITY;

-- VERIFIED: AdversarialQARun -> AdversarialQARun
DROP POLICY IF EXISTS tenant_isolation ON "AdversarialQARun";
ALTER TABLE "AdversarialQARun" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "AdversarialQARun" DISABLE ROW LEVEL SECURITY;

-- VERIFIED: HallucinationLog -> HallucinationLog
DROP POLICY IF EXISTS tenant_isolation ON "HallucinationLog";
ALTER TABLE "HallucinationLog" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "HallucinationLog" DISABLE ROW LEVEL SECURITY;

-- VERIFIED: HumanReviewFlag -> HumanReviewFlag
DROP POLICY IF EXISTS tenant_isolation ON "HumanReviewFlag";
ALTER TABLE "HumanReviewFlag" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "HumanReviewFlag" DISABLE ROW LEVEL SECURITY;

-- VERIFIED: Project -> Project
DROP POLICY IF EXISTS tenant_isolation ON "Project";
ALTER TABLE "Project" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "Project" DISABLE ROW LEVEL SECURITY;

-- VERIFIED: NPSSurvey -> NPSSurvey
DROP POLICY IF EXISTS tenant_isolation ON "NPSSurvey";
ALTER TABLE "NPSSurvey" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "NPSSurvey" DISABLE ROW LEVEL SECURITY;

-- VERIFIED: QATelemetry -> QATelemetry
DROP POLICY IF EXISTS tenant_isolation ON "QATelemetry";
ALTER TABLE "QATelemetry" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "QATelemetry" DISABLE ROW LEVEL SECURITY;

-- VERIFIED: MonitoringConfig -> MonitoringConfig
DROP POLICY IF EXISTS tenant_isolation ON "MonitoringConfig";
ALTER TABLE "MonitoringConfig" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "MonitoringConfig" DISABLE ROW LEVEL SECURITY;

-- VERIFIED: LocationGroup -> LocationGroup
DROP POLICY IF EXISTS tenant_isolation ON "LocationGroup";
ALTER TABLE "LocationGroup" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "LocationGroup" DISABLE ROW LEVEL SECURITY;
DROP ROLE IF EXISTS app_user;
