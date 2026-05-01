-- ============================================================================
-- Revert: Drop RLS bypass policies added for explicitly-audited cross-tenant flows
-- Generated from prisma/migrations/20260429093000_enable_rls/migration.sql VERIFIED comments
-- Source coverage: 50/50 tables match existing tenant_isolation policies
-- ============================================================================

DROP POLICY IF EXISTS tenant_bypass ON "Audit";
DROP POLICY IF EXISTS tenant_bypass ON "Finding";
DROP POLICY IF EXISTS tenant_bypass ON "Proposal";
DROP POLICY IF EXISTS tenant_bypass ON "ProposalAcceptance";
DROP POLICY IF EXISTS tenant_bypass ON "ProposalView";
DROP POLICY IF EXISTS tenant_bypass ON "ContactRequest";
DROP POLICY IF EXISTS tenant_bypass ON "ProposalFollowUp";
DROP POLICY IF EXISTS tenant_bypass ON "EvidenceSnapshot";
DROP POLICY IF EXISTS tenant_bypass ON "ProposalTemplate";
DROP POLICY IF EXISTS tenant_bypass ON "User";
DROP POLICY IF EXISTS tenant_bypass ON "Invitation";
DROP POLICY IF EXISTS tenant_bypass ON "Playbook";
DROP POLICY IF EXISTS tenant_bypass ON "AuditSchedule";
DROP POLICY IF EXISTS tenant_bypass ON "AuditTarget";
DROP POLICY IF EXISTS tenant_bypass ON "ProspectDiscoveryJob";
DROP POLICY IF EXISTS tenant_bypass ON "ProspectLead";
DROP POLICY IF EXISTS tenant_bypass ON "ProspectEnrichmentRun";
DROP POLICY IF EXISTS tenant_bypass ON "OutreachSendingDomain";
DROP POLICY IF EXISTS tenant_bypass ON "OutreachDomainDailyStat";
DROP POLICY IF EXISTS tenant_bypass ON "OutreachEmail";
DROP POLICY IF EXISTS tenant_bypass ON "OutreachEmailEvent";
DROP POLICY IF EXISTS tenant_bypass ON "ApiKey";
DROP POLICY IF EXISTS tenant_bypass ON "TenantBranding";
DROP POLICY IF EXISTS tenant_bypass ON "ProspectStateTransition";
DROP POLICY IF EXISTS tenant_bypass ON "DeliveryTask";
DROP POLICY IF EXISTS tenant_bypass ON "PipelineConfig";
DROP POLICY IF EXISTS tenant_bypass ON "PipelineErrorLog";
DROP POLICY IF EXISTS tenant_bypass ON "OutreachTemplatePerformance";
DROP POLICY IF EXISTS tenant_bypass ON "WinLossRecord";
DROP POLICY IF EXISTS tenant_bypass ON "PreWarmingAction";
DROP POLICY IF EXISTS tenant_bypass ON "DetectedSignal";
DROP POLICY IF EXISTS tenant_bypass ON "ChatConversation";
DROP POLICY IF EXISTS tenant_bypass ON "PartnerDeliveredLead";
DROP POLICY IF EXISTS tenant_bypass ON "ProposalOutreach";
DROP POLICY IF EXISTS tenant_bypass ON "FollowUpEmailSend";
DROP POLICY IF EXISTS tenant_bypass ON "UsageRecord";
DROP POLICY IF EXISTS tenant_bypass ON "failed_webhook_events";
DROP POLICY IF EXISTS tenant_bypass ON "cart_abandonment_events";
DROP POLICY IF EXISTS tenant_bypass ON "subscriptions";
DROP POLICY IF EXISTS tenant_bypass ON "payments";
DROP POLICY IF EXISTS tenant_bypass ON "GeneratedArtifact";
DROP POLICY IF EXISTS tenant_bypass ON "DeliveryBundle";
DROP POLICY IF EXISTS tenant_bypass ON "AdversarialQARun";
DROP POLICY IF EXISTS tenant_bypass ON "HallucinationLog";
DROP POLICY IF EXISTS tenant_bypass ON "HumanReviewFlag";
DROP POLICY IF EXISTS tenant_bypass ON "Project";
DROP POLICY IF EXISTS tenant_bypass ON "NPSSurvey";
DROP POLICY IF EXISTS tenant_bypass ON "QATelemetry";
DROP POLICY IF EXISTS tenant_bypass ON "MonitoringConfig";
DROP POLICY IF EXISTS tenant_bypass ON "LocationGroup";
