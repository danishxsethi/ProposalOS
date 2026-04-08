-- Create a policy for tenant isolation
-- Applies to Audit, Finding, Proposal, ProspectLead, ProspectDiscoveryJob, etc.

-- Enable RLS on Tenant Scoped Tables
ALTER TABLE "Audit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Finding" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Proposal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProspectLead" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProspectDiscoveryJob" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TenantBranding" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditSchedule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ApiKey" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Subscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Payment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OutreachEmail" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ContactRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProposalFollowUp" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EvidenceSnapshot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DeliveryTask" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PipelineConfig" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ChatConversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GeneratedArtifact" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DeliveryBundle" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AdversarialQARun" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HallucinationLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HumanReviewFlag" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Project" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NPSSurvey" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MonitoringConfig" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LocationGroup" ENABLE ROW LEVEL SECURITY;

-- Newly added tenant-scoped tables
ALTER TABLE "ProposalAcceptance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProposalView" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditTarget" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OutreachTemplatePerformance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProposalOutreach" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FollowUpEmailSend" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FailedWebhookEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CartAbandonmentEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PartnerDeliveredLead" ENABLE ROW LEVEL SECURITY;

-- Create Policies to ensure tenant isolation relies on current_setting('app.current_tenant_id')
-- If app.current_tenant_id is not set, it shouldn't expose rows (except for super admins if needed, but not handled here)

-- Audit
DROP POLICY IF EXISTS "tenant_isolation_audit" ON "Audit";
CREATE POLICY "tenant_isolation_audit" ON "Audit"
    USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- Finding
DROP POLICY IF EXISTS "tenant_isolation_finding" ON "Finding";
CREATE POLICY "tenant_isolation_finding" ON "Finding"
    USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- Proposal
DROP POLICY IF EXISTS "tenant_isolation_proposal" ON "Proposal";
CREATE POLICY "tenant_isolation_proposal" ON "Proposal"
    USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- ProspectLead
DROP POLICY IF EXISTS "tenant_isolation_prospect_lead" ON "ProspectLead";
CREATE POLICY "tenant_isolation_prospect_lead" ON "ProspectLead"
    USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- ProspectDiscoveryJob
DROP POLICY IF EXISTS "tenant_isolation_prospect_job" ON "ProspectDiscoveryJob";
CREATE POLICY "tenant_isolation_prospect_job" ON "ProspectDiscoveryJob"
    USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- TenantBranding
DROP POLICY IF EXISTS "tenant_isolation_branding" ON "TenantBranding";
CREATE POLICY "tenant_isolation_branding" ON "TenantBranding"
    USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- AuditSchedule
DROP POLICY IF EXISTS "tenant_isolation_audit_schedule" ON "AuditSchedule";
CREATE POLICY "tenant_isolation_audit_schedule" ON "AuditSchedule"
    USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- ApiKey
DROP POLICY IF EXISTS "tenant_isolation_apikey" ON "ApiKey";
CREATE POLICY "tenant_isolation_apikey" ON "ApiKey"
    USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- Subscription
DROP POLICY IF EXISTS "tenant_isolation_subscription" ON "Subscription";
CREATE POLICY "tenant_isolation_subscription" ON "Subscription"
    USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- Payment
DROP POLICY IF EXISTS "tenant_isolation_payment" ON "Payment";
CREATE POLICY "tenant_isolation_payment" ON "Payment"
    USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- OutreachEmail
DROP POLICY IF EXISTS "tenant_isolation_outreach" ON "OutreachEmail";
CREATE POLICY "tenant_isolation_outreach" ON "OutreachEmail"
    USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- ContactRequest
DROP POLICY IF EXISTS "tenant_isolation_contact" ON "ContactRequest";
CREATE POLICY "tenant_isolation_contact" ON "ContactRequest"
    USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- ProposalFollowUp
DROP POLICY IF EXISTS "tenant_isolation_followup" ON "ProposalFollowUp";
CREATE POLICY "tenant_isolation_followup" ON "ProposalFollowUp"
    USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- EvidenceSnapshot
DROP POLICY IF EXISTS "tenant_isolation_evidence" ON "EvidenceSnapshot";
CREATE POLICY "tenant_isolation_evidence" ON "EvidenceSnapshot"
    USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- DeliveryTask
DROP POLICY IF EXISTS "tenant_isolation_delivery_task" ON "DeliveryTask";
CREATE POLICY "tenant_isolation_delivery_task" ON "DeliveryTask"
    USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- PipelineConfig
DROP POLICY IF EXISTS "tenant_isolation_pipeline_config" ON "PipelineConfig";
CREATE POLICY "tenant_isolation_pipeline_config" ON "PipelineConfig"
    USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- ChatConversation
DROP POLICY IF EXISTS "tenant_isolation_chat" ON "ChatConversation";
CREATE POLICY "tenant_isolation_chat" ON "ChatConversation"
    USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- GeneratedArtifact
DROP POLICY IF EXISTS "tenant_isolation_artifact" ON "GeneratedArtifact";
CREATE POLICY "tenant_isolation_artifact" ON "GeneratedArtifact"
    USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- DeliveryBundle
DROP POLICY IF EXISTS "tenant_isolation_bundle" ON "DeliveryBundle";
CREATE POLICY "tenant_isolation_bundle" ON "DeliveryBundle"
    USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- AdversarialQARun
DROP POLICY IF EXISTS "tenant_isolation_qa_run" ON "AdversarialQARun";
CREATE POLICY "tenant_isolation_qa_run" ON "AdversarialQARun"
    USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- HallucinationLog
DROP POLICY IF EXISTS "tenant_isolation_hallucination" ON "HallucinationLog";
CREATE POLICY "tenant_isolation_hallucination" ON "HallucinationLog"
    USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- HumanReviewFlag
DROP POLICY IF EXISTS "tenant_isolation_human_review" ON "HumanReviewFlag";
CREATE POLICY "tenant_isolation_human_review" ON "HumanReviewFlag"
    USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- Project
DROP POLICY IF EXISTS "tenant_isolation_project" ON "Project";
CREATE POLICY "tenant_isolation_project" ON "Project"
    USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- NPSSurvey
DROP POLICY IF EXISTS "tenant_isolation_nps" ON "NPSSurvey";
CREATE POLICY "tenant_isolation_nps" ON "NPSSurvey"
    USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- MonitoringConfig
DROP POLICY IF EXISTS "tenant_isolation_monitoring" ON "MonitoringConfig";
CREATE POLICY "tenant_isolation_monitoring" ON "MonitoringConfig"
    USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- LocationGroup
DROP POLICY IF EXISTS "tenant_isolation_location_group" ON "LocationGroup";
CREATE POLICY "tenant_isolation_location_group" ON "LocationGroup"
    USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- ProposalAcceptance
DROP POLICY IF EXISTS "tenant_isolation_proposal_acceptance" ON "ProposalAcceptance";
CREATE POLICY "tenant_isolation_proposal_acceptance" ON "ProposalAcceptance"
    USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- ProposalView
DROP POLICY IF EXISTS "tenant_isolation_proposal_view" ON "ProposalView";
CREATE POLICY "tenant_isolation_proposal_view" ON "ProposalView"
    USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- AuditTarget (nullable tenantId - allow system-wide targets)
DROP POLICY IF EXISTS "tenant_isolation_audit_target" ON "AuditTarget";
CREATE POLICY "tenant_isolation_audit_target" ON "AuditTarget"
    USING ("tenantId" IS NULL OR "tenantId" = current_setting('app.current_tenant_id', true));

-- OutreachTemplatePerformance
DROP POLICY IF EXISTS "tenant_isolation_outreach_template_perf" ON "OutreachTemplatePerformance";
CREATE POLICY "tenant_isolation_outreach_template_perf" ON "OutreachTemplatePerformance"
    USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- ProposalOutreach
DROP POLICY IF EXISTS "tenant_isolation_proposal_outreach" ON "ProposalOutreach";
CREATE POLICY "tenant_isolation_proposal_outreach" ON "ProposalOutreach"
    USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- FollowUpEmailSend
DROP POLICY IF EXISTS "tenant_isolation_followup_email" ON "FollowUpEmailSend";
CREATE POLICY "tenant_isolation_followup_email" ON "FollowUpEmailSend"
    USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- FailedWebhookEvent (nullable tenantId - allow system-level webhooks)
DROP POLICY IF EXISTS "tenant_isolation_failed_webhook" ON "FailedWebhookEvent";
CREATE POLICY "tenant_isolation_failed_webhook" ON "FailedWebhookEvent"
    USING ("tenantId" IS NULL OR "tenantId" = current_setting('app.current_tenant_id', true));

-- CartAbandonmentEvent
DROP POLICY IF EXISTS "tenant_isolation_cart_abandonment" ON "CartAbandonmentEvent";
CREATE POLICY "tenant_isolation_cart_abandonment" ON "CartAbandonmentEvent"
    USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- PartnerDeliveredLead
DROP POLICY IF EXISTS "tenant_isolation_partner_delivered_lead" ON "PartnerDeliveredLead";
CREATE POLICY "tenant_isolation_partner_delivered_lead" ON "PartnerDeliveredLead"
    USING ("tenantId" = current_setting('app.current_tenant_id', true));
