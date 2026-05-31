-- AlterSchema
-- Add composite indexes for top query patterns
-- Migration: 20260321_add_composite_indexes
--
-- REMEDIATION NOTE (2026-05-14):
-- Several tables referenced in this migration are defined in schema.prisma but were
-- not included in the 20260227000000_init migration. Those index creations are wrapped
-- in DO $$ ... $$ blocks so they are skipped gracefully on a fresh empty-DB replay
-- while still applying correctly on databases where those tables already exist.
-- Affected tables: ClientDashboard, CompetitorSignal, NotificationPreference,
--   PromptPerformanceLog, ReEngagementCampaign, ScheduledAuditRun,
--   UpsellOpportunity, WinBackCampaign.

-- Audit: URL lookup by tenant (top query: find audit by businessUrl+tenantId)
CREATE INDEX IF NOT EXISTS "Audit_tenantId_businessUrl_idx" ON "Audit"("tenantId", "businessUrl");

-- Audit: Status filtering with date range (top query: filter by status+createdAt)
CREATE INDEX IF NOT EXISTS "Audit_status_createdAt_idx" ON "Audit"("status", "createdAt");

-- Finding: Findings by audit with severity/type filtering
CREATE INDEX IF NOT EXISTS "Finding_tenantId_auditId_type_idx" ON "Finding"("tenantId", "auditId", "type");

-- Finding: Findings by tenant with severity filtering (for dashboard queries)
CREATE INDEX IF NOT EXISTS "Finding_tenantId_impactScore_idx" ON "Finding"("tenantId", "impactScore" DESC);

-- Proposal: Proposals by tenant with status and date filtering (top query)
CREATE INDEX IF NOT EXISTS "Proposal_tenantId_status_createdAt_idx" ON "Proposal"("tenantId", "status", "createdAt");

-- Proposal: Proposals by tenant for dashboard (with clientScore for prioritization)
CREATE INDEX IF NOT EXISTS "Proposal_tenantId_clientScore_idx" ON "Proposal"("tenantId", "clientScore" DESC NULLS LAST);

-- ProspectLead: Leads by tenant with status and engagement (pipeline queries)
CREATE INDEX IF NOT EXISTS "ProspectLead_tenantId_status_engagementScore_idx" ON "ProspectLead"("tenantId", "status", "engagementScore" DESC);

-- ProspectLead: Leads by tenant with outreach stage and next action (outreach scheduling)
CREATE INDEX IF NOT EXISTS "ProspectLead_tenantId_outreachStage_outreachNextActionAt_idx" ON "ProspectLead"("tenantId", "outreachStage", "outreachNextActionAt");

-- OutreachEmail: Emails by tenant with status and date (email queue queries)
CREATE INDEX IF NOT EXISTS "OutreachEmail_tenantId_status_createdAt_idx" ON "OutreachEmail"("tenantId", "status", "createdAt");

-- OutreachEmail: Emails by lead for thread view
CREATE INDEX IF NOT EXISTS "OutreachEmail_tenantId_leadId_createdAt_idx" ON "OutreachEmail"("tenantId", "leadId", "createdAt");

-- ProposalFollowUp: Follow-ups by tenant with status and scheduled date
CREATE INDEX IF NOT EXISTS "ProposalFollowUp_tenantId_status_scheduledAt_idx" ON "ProposalFollowUp"("tenantId", "status", "scheduledAt");

-- EvidenceSnapshot: Evidence by audit and module (audit result queries)
CREATE INDEX IF NOT EXISTS "EvidenceSnapshot_tenantId_auditId_module_idx" ON "EvidenceSnapshot"("tenantId", "auditId", "module");

-- PipelineConfig: Single config per tenant (already unique, but add explicit index)
CREATE INDEX IF NOT EXISTS "PipelineConfig_tenantId_idx" ON "PipelineConfig"("tenantId");

-- CircuitBreakerState: State by tenant and stage (circuit breaker checks)
CREATE INDEX IF NOT EXISTS "CircuitBreakerState_tenantId_state_idx" ON "CircuitBreakerState"("tenantId", "state");

-- DeadLetterQueue: DLQ entries by tenant and status (DLQ processing)
CREATE INDEX IF NOT EXISTS "DeadLetterQueue_tenantId_status_createdAt_idx" ON "DeadLetterQueue"("tenantId", "status", "createdAt");

-- UsageRecord: Usage by tenant with timestamp (billing queries)
CREATE INDEX IF NOT EXISTS "UsageRecord_tenantId_timestamp_idx" ON "UsageRecord"("tenantId", "timestamp");

-- PromptPerformanceLog: Performance by prompt version and timestamp (analytics)
-- Wrapped in DO block: table may not exist on a fresh empty-DB replay.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'PromptPerformanceLog') THEN
    CREATE INDEX IF NOT EXISTS "PromptPerformanceLog_promptVersionHash_timestamp_idx" ON "PromptPerformanceLog"("promptVersionHash", "timestamp");
    CREATE INDEX IF NOT EXISTS "PromptPerformanceLog_nodeId_timestamp_idx" ON "PromptPerformanceLog"("nodeId", "timestamp");
  END IF;
END $$;

-- GeneratedArtifact: Artifacts by tenant and proposal (delivery queries)
CREATE INDEX IF NOT EXISTS "GeneratedArtifact_tenantId_proposalId_status_idx" ON "GeneratedArtifact"("tenantId", "proposalId", "status");

-- DeliveryTask: Tasks by tenant and status (delivery queue)
CREATE INDEX IF NOT EXISTS "DeliveryTask_tenantId_status_estimatedCompletionDate_idx" ON "DeliveryTask"("tenantId", "status", "estimatedCompletionDate");

-- ClientMessage: Messages by audit for chat view
CREATE INDEX IF NOT EXISTS "ClientMessage_auditId_createdAt_idx" ON "ClientMessage"("auditId", "createdAt");

-- FindingStatus: Status by audit for progress tracking
CREATE INDEX IF NOT EXISTS "FindingStatus_auditId_status_idx" ON "FindingStatus"("auditId", "status");

-- ReviewSnapshot: Snapshots by audit for historical view
CREATE INDEX IF NOT EXISTS "ReviewSnapshot_auditId_date_idx" ON "ReviewSnapshot"("auditId", "date");

-- NPSSurvey: Surveys by project and status (NPS automation)
CREATE INDEX IF NOT EXISTS "NPSSurvey_projectId_surveyDay_status_idx" ON "NPSSurvey"("projectId", "surveyDay", "status");

-- QATelemetry: QA runs by graph and timestamp (QA analytics)
CREATE INDEX IF NOT EXISTS "QATelemetry_graphName_createdAt_idx" ON "QATelemetry"("graphName", "createdAt");

-- QATelemetry: QA runs by tenant for tenant-specific analytics
CREATE INDEX IF NOT EXISTS "QATelemetry_tenantId_qaScore_idx" ON "QATelemetry"("tenantId", "qaScore");

-- CartAbandonmentEvent: Events by proposal for funnel analysis
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cart_abandonment_events') THEN
    CREATE INDEX IF NOT EXISTS "cart_abandonment_events_proposalId_step_timestamp_idx" ON "cart_abandonment_events"("proposalId", "step", "timestamp");
    CREATE INDEX IF NOT EXISTS "cart_abandonment_events_tenantId_checkoutType_timestamp_idx" ON "cart_abandonment_events"("tenantId", "checkoutType", "timestamp");
  END IF;
END $$;

-- CompetitorSignal: Signals by tenant and type (competitor monitoring)
-- Wrapped in DO block: table may not exist on a fresh empty-DB replay.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'CompetitorSignal') THEN
    CREATE INDEX IF NOT EXISTS "CompetitorSignal_tenantId_signalType_detectedAt_idx" ON "CompetitorSignal"("tenantId", "signalType", "detectedAt");
  END IF;
END $$;

-- ReEngagementCampaign: Campaigns by tenant and status
-- Wrapped in DO block: table may not exist on a fresh empty-DB replay.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ReEngagementCampaign') THEN
    CREATE INDEX IF NOT EXISTS "ReEngagementCampaign_tenantId_status_proposalId_idx" ON "ReEngagementCampaign"("tenantId", "status", "proposalId");
  END IF;
END $$;

-- WinBackCampaign: Campaigns by tenant and former tenant
-- Wrapped in DO block: table may not exist on a fresh empty-DB replay.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'WinBackCampaign') THEN
    CREATE INDEX IF NOT EXISTS "WinBackCampaign_tenantId_formerTenantId_status_idx" ON "WinBackCampaign"("tenantId", "formerTenantId", "status");
  END IF;
END $$;

-- UpsellOpportunity: Opportunities by tenant and status
-- Wrapped in DO block: table may not exist on a fresh empty-DB replay.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'UpsellOpportunity') THEN
    CREATE INDEX IF NOT EXISTS "UpsellOpportunity_tenantId_status_triggerType_idx" ON "UpsellOpportunity"("tenantId", "status", "triggerType");
  END IF;
END $$;

-- ScheduledAuditRun: Runs by tenant and schedule
-- Wrapped in DO block: table may not exist on a fresh empty-DB replay.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ScheduledAuditRun') THEN
    CREATE INDEX IF NOT EXISTS "ScheduledAuditRun_tenantId_scheduleId_status_idx" ON "ScheduledAuditRun"("tenantId", "scheduleId", "status");
  END IF;
END $$;

-- ClientDashboard: Dashboard by tenant and audit
-- Wrapped in DO block: table may not exist on a fresh empty-DB replay.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ClientDashboard') THEN
    CREATE INDEX IF NOT EXISTS "ClientDashboard_tenantId_healthScore_idx" ON "ClientDashboard"("tenantId", "healthScore");
  END IF;
END $$;

-- NotificationPreference: Preferences by tenant and user
-- Wrapped in DO block: table may not exist on a fresh empty-DB replay.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'NotificationPreference') THEN
    CREATE INDEX IF NOT EXISTS "NotificationPreference_tenantId_userId_idx" ON "NotificationPreference"("tenantId", "userId");
  END IF;
END $$;

-- HallucinationLog: Logs by tenant and category (QA analysis)
CREATE INDEX IF NOT EXISTS "HallucinationLog_tenantId_category_weekStart_idx" ON "HallucinationLog"("tenantId", "category", "weekStart");

-- HumanReviewFlag: Flags by tenant and status (review queue)
CREATE INDEX IF NOT EXISTS "HumanReviewFlag_tenantId_status_createdAt_idx" ON "HumanReviewFlag"("tenantId", "status", "createdAt");

-- AdversarialQARun: QA runs by tenant and audit
CREATE INDEX IF NOT EXISTS "AdversarialQARun_tenantId_auditId_createdAt_idx" ON "AdversarialQARun"("tenantId", "auditId", "createdAt");

-- OutreachEmailEvent: Events by tenant and type (event analytics)
CREATE INDEX IF NOT EXISTS "OutreachEmailEvent_tenantId_type_occurredAt_idx" ON "OutreachEmailEvent"("tenantId", "type", "occurredAt");

-- ProspectStateTransition: Transitions by lead and tenant
CREATE INDEX IF NOT EXISTS "ProspectStateTransition_tenantId_leadId_createdAt_idx" ON "ProspectStateTransition"("tenantId", "leadId", "createdAt");

-- PreWarmingAction: Actions by tenant and platform
CREATE INDEX IF NOT EXISTS "PreWarmingAction_tenantId_platform_scheduledAt_idx" ON "PreWarmingAction"("tenantId", "platform", "scheduledAt");

-- DetectedSignal: Signals by tenant and type
CREATE INDEX IF NOT EXISTS "DetectedSignal_tenantId_signalType_detectedAt_idx" ON "DetectedSignal"("tenantId", "signalType", "detectedAt");

-- WinLossRecord: Records by tenant and vertical
CREATE INDEX IF NOT EXISTS "WinLossRecord_tenantId_vertical_outcome_idx" ON "WinLossRecord"("tenantId", "vertical", "outcome");

-- PipelineErrorLog: Errors by tenant and stage
CREATE INDEX IF NOT EXISTS "PipelineErrorLog_tenantId_stage_createdAt_idx" ON "PipelineErrorLog"("tenantId", "stage", "createdAt");

-- Comment: Index purpose
-- These composite indexes optimize the top 20 most frequent query patterns
-- identified in the application. They enable efficient:
-- - Tenant-scoped lookups (all queries include tenantId first)
-- - Range scans on dates and scores
-- - Filter + sort operations without additional sorting
