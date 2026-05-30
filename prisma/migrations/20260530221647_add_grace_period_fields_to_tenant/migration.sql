/*
  Warnings:

  - The primary key for the `CircuitBreakerState` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `DeadLetterQueue` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- DropForeignKey
ALTER TABLE "Audit" DROP CONSTRAINT "Audit_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "CircuitBreakerState" DROP CONSTRAINT "CircuitBreakerState_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "DeadLetterQueue" DROP CONSTRAINT "DeadLetterQueue_prospectId_fkey";

-- DropForeignKey
ALTER TABLE "DeadLetterQueue" DROP CONSTRAINT "DeadLetterQueue_tenantId_fkey";

-- DropIndex
DROP INDEX "AdversarialQARun_tenantId_auditId_createdAt_idx";

-- DropIndex
DROP INDEX "Audit_status_createdAt_idx";

-- DropIndex
DROP INDEX "Audit_tenantId_businessUrl_idx";

-- DropIndex
DROP INDEX "ClientMessage_auditId_createdAt_idx";

-- DropIndex
DROP INDEX "DeadLetterQueue_tenantId_status_createdAt_idx";

-- DropIndex
DROP INDEX "DeliveryTask_tenantId_status_estimatedCompletionDate_idx";

-- DropIndex
DROP INDEX "EvidenceSnapshot_tenantId_auditId_module_idx";

-- DropIndex
DROP INDEX "Finding_tenantId_auditId_type_idx";

-- DropIndex
DROP INDEX "Finding_tenantId_impactScore_idx";

-- DropIndex
DROP INDEX "FindingStatus_auditId_status_idx";

-- DropIndex
DROP INDEX "GeneratedArtifact_tenantId_proposalId_status_idx";

-- DropIndex
DROP INDEX "HallucinationLog_tenantId_category_weekStart_idx";

-- DropIndex
DROP INDEX "HumanReviewFlag_tenantId_status_createdAt_idx";

-- DropIndex
DROP INDEX "NPSSurvey_projectId_surveyDay_status_idx";

-- DropIndex
DROP INDEX "OutreachEmail_tenantId_leadId_createdAt_idx";

-- DropIndex
DROP INDEX "Proposal_tenantId_clientScore_idx";

-- DropIndex
DROP INDEX "Proposal_tenantId_status_createdAt_idx";

-- DropIndex
DROP INDEX "ProposalFollowUp_tenantId_status_scheduledAt_idx";

-- DropIndex
DROP INDEX "ProspectLead_tenantId_status_engagementScore_idx";

-- DropIndex
DROP INDEX "ProspectStateTransition_tenantId_leadId_createdAt_idx";

-- DropIndex
DROP INDEX "QATelemetry_tenantId_qaScore_idx";

-- DropIndex
DROP INDEX "ReviewSnapshot_auditId_date_idx";

-- DropIndex
DROP INDEX "UsageRecord_tenantId_timestamp_idx";

-- DropIndex
DROP INDEX "cart_abandonment_events_proposalId_step_timestamp_idx";

-- DropIndex
DROP INDEX "cart_abandonment_events_tenantId_checkoutType_timestamp_idx";

-- AlterTable
ALTER TABLE "AuditTrailEvent" ALTER COLUMN "occurredAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "CircuitBreakerState" DROP CONSTRAINT "CircuitBreakerState_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ADD CONSTRAINT "CircuitBreakerState_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "DeadLetterQueue" DROP CONSTRAINT "DeadLetterQueue_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ADD CONSTRAINT "DeadLetterQueue_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Session" ALTER COLUMN "lastSeenAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "gracePeriodEndsAt" TIMESTAMP(3),
ADD COLUMN     "gracePeriodNotifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "audit_jobs" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "ClientDashboard" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "healthScore" INTEGER NOT NULL,
    "lastScanDate" TIMESTAMP(3) NOT NULL,
    "previousScore" INTEGER,
    "scoreChange" INTEGER,
    "findingsFixed" INTEGER NOT NULL,
    "findingsTotal" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientDashboard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UpsellOpportunity" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL,
    "triggerReason" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "dealValue" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UpsellOpportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "smsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "frequency" TEXT NOT NULL,
    "types" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledAuditRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "previousAuditId" TEXT,
    "status" TEXT NOT NULL,
    "comparisonReport" JSONB,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduledAuditRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitorSignal" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leadId" TEXT,
    "signalType" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "competitorName" TEXT NOT NULL,
    "competitorUrl" TEXT,
    "signalData" JSONB NOT NULL,
    "outreachTriggered" BOOLEAN NOT NULL DEFAULT false,
    "upsellProposalId" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetitorSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReEngagementCampaign" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "step" INTEGER NOT NULL DEFAULT 0,
    "lastSentAt" TIMESTAMP(3),
    "convertedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReEngagementCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WinBackCampaign" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "formerTenantId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "step" INTEGER NOT NULL DEFAULT 0,
    "offerCode" TEXT,
    "lastSentAt" TIMESTAMP(3),
    "convertedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WinBackCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromptVersion" (
    "id" TEXT NOT NULL,
    "versionHash" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "promptText" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "parentVersionHash" TEXT,
    "branchName" TEXT NOT NULL DEFAULT 'main',
    "changelog" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "environment" TEXT NOT NULL DEFAULT 'production',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT,

    CONSTRAINT "PromptVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromptPerformanceLog" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "promptVersionHash" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "qualityScore" DOUBLE PRECISION NOT NULL,
    "downstreamImpact" DOUBLE PRECISION NOT NULL,
    "costUSD" DOUBLE PRECISION NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "experimentId" TEXT,
    "variantId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "PromptPerformanceLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ABExperiment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),
    "winnerVariantId" TEXT,
    "statisticalSignificance" DOUBLE PRECISION,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "ABExperiment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ABVariant" (
    "id" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "promptVersionHash" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "trafficPercentage" INTEGER NOT NULL,
    "sampleSize" INTEGER NOT NULL DEFAULT 0,
    "avgQualityScore" DOUBLE PRECISION,
    "avgDownstreamImpact" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ABVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prediction" (
    "id" TEXT NOT NULL,
    "auditId" TEXT,
    "predictionType" TEXT NOT NULL,
    "predictedValue" DOUBLE PRECISION NOT NULL,
    "confidenceIntervalLower" DOUBLE PRECISION NOT NULL,
    "confidenceIntervalUpper" DOUBLE PRECISION NOT NULL,
    "actualValue" DOUBLE PRECISION,
    "observedAt" TIMESTAMP(3),
    "predictionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT NOT NULL,
    "promptVersionHash" TEXT,

    CONSTRAINT "Prediction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scenario" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "selectedRecommendations" JSONB NOT NULL,
    "projectedROI" DOUBLE PRECISION NOT NULL,
    "projectedTimeline" TEXT NOT NULL,
    "projectedTraffic" INTEGER NOT NULL,
    "confidenceIntervals" JSONB NOT NULL,
    "comparisonToBaseline" JSONB NOT NULL,
    "calculationTimeMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "Scenario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientDashboard_auditId_key" ON "ClientDashboard"("auditId");

-- CreateIndex
CREATE INDEX "ClientDashboard_tenantId_idx" ON "ClientDashboard"("tenantId");

-- CreateIndex
CREATE INDEX "ClientDashboard_auditId_idx" ON "ClientDashboard"("auditId");

-- CreateIndex
CREATE INDEX "UpsellOpportunity_tenantId_status_idx" ON "UpsellOpportunity"("tenantId", "status");

-- CreateIndex
CREATE INDEX "UpsellOpportunity_triggerType_idx" ON "UpsellOpportunity"("triggerType");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_tenantId_userId_key" ON "NotificationPreference"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "ScheduledAuditRun_tenantId_idx" ON "ScheduledAuditRun"("tenantId");

-- CreateIndex
CREATE INDEX "ScheduledAuditRun_scheduleId_idx" ON "ScheduledAuditRun"("scheduleId");

-- CreateIndex
CREATE INDEX "ScheduledAuditRun_auditId_idx" ON "ScheduledAuditRun"("auditId");

-- CreateIndex
CREATE INDEX "CompetitorSignal_tenantId_signalType_detectedAt_idx" ON "CompetitorSignal"("tenantId", "signalType", "detectedAt");

-- CreateIndex
CREATE INDEX "CompetitorSignal_leadId_idx" ON "CompetitorSignal"("leadId");

-- CreateIndex
CREATE INDEX "ReEngagementCampaign_tenantId_status_idx" ON "ReEngagementCampaign"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ReEngagementCampaign_proposalId_idx" ON "ReEngagementCampaign"("proposalId");

-- CreateIndex
CREATE INDEX "WinBackCampaign_tenantId_status_idx" ON "WinBackCampaign"("tenantId", "status");

-- CreateIndex
CREATE INDEX "WinBackCampaign_formerTenantId_idx" ON "WinBackCampaign"("formerTenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PromptVersion_versionHash_key" ON "PromptVersion"("versionHash");

-- CreateIndex
CREATE INDEX "PromptVersion_nodeId_idx" ON "PromptVersion"("nodeId");

-- CreateIndex
CREATE INDEX "PromptVersion_versionHash_idx" ON "PromptVersion"("versionHash");

-- CreateIndex
CREATE INDEX "PromptVersion_isActive_idx" ON "PromptVersion"("isActive");

-- CreateIndex
CREATE INDEX "PromptVersion_environment_idx" ON "PromptVersion"("environment");

-- CreateIndex
CREATE INDEX "PromptVersion_tenantId_idx" ON "PromptVersion"("tenantId");

-- CreateIndex
CREATE INDEX "PromptVersion_createdAt_idx" ON "PromptVersion"("createdAt");

-- CreateIndex
CREATE INDEX "PromptPerformanceLog_promptVersionHash_idx" ON "PromptPerformanceLog"("promptVersionHash");

-- CreateIndex
CREATE INDEX "PromptPerformanceLog_nodeId_idx" ON "PromptPerformanceLog"("nodeId");

-- CreateIndex
CREATE INDEX "PromptPerformanceLog_experimentId_idx" ON "PromptPerformanceLog"("experimentId");

-- CreateIndex
CREATE INDEX "PromptPerformanceLog_timestamp_idx" ON "PromptPerformanceLog"("timestamp");

-- CreateIndex
CREATE INDEX "PromptPerformanceLog_tenantId_idx" ON "PromptPerformanceLog"("tenantId");

-- CreateIndex
CREATE INDEX "ABExperiment_nodeId_idx" ON "ABExperiment"("nodeId");

-- CreateIndex
CREATE INDEX "ABExperiment_status_idx" ON "ABExperiment"("status");

-- CreateIndex
CREATE INDEX "ABExperiment_tenantId_idx" ON "ABExperiment"("tenantId");

-- CreateIndex
CREATE INDEX "ABVariant_experimentId_idx" ON "ABVariant"("experimentId");

-- CreateIndex
CREATE INDEX "ABVariant_promptVersionHash_idx" ON "ABVariant"("promptVersionHash");

-- CreateIndex
CREATE INDEX "ABVariant_tenantId_idx" ON "ABVariant"("tenantId");

-- CreateIndex
CREATE INDEX "Prediction_auditId_idx" ON "Prediction"("auditId");

-- CreateIndex
CREATE INDEX "Prediction_predictionType_idx" ON "Prediction"("predictionType");

-- CreateIndex
CREATE INDEX "Prediction_tenantId_idx" ON "Prediction"("tenantId");

-- CreateIndex
CREATE INDEX "Prediction_predictionDate_idx" ON "Prediction"("predictionDate");

-- CreateIndex
CREATE INDEX "Scenario_auditId_idx" ON "Scenario"("auditId");

-- CreateIndex
CREATE INDEX "Scenario_tenantId_idx" ON "Scenario"("tenantId");

-- CreateIndex
CREATE INDEX "Scenario_createdAt_idx" ON "Scenario"("createdAt");

-- CreateIndex
CREATE INDEX "EvidenceSnapshot_tenantId_idx" ON "EvidenceSnapshot"("tenantId");

-- CreateIndex
CREATE INDEX "Finding_tenantId_idx" ON "Finding"("tenantId");

-- CreateIndex
CREATE INDEX "Proposal_tenantId_idx" ON "Proposal"("tenantId");

-- CreateIndex
CREATE INDEX "ProposalTemplate_tenantId_idx" ON "ProposalTemplate"("tenantId");

-- CreateIndex
CREATE INDEX "QATelemetry_tenantId_idx" ON "QATelemetry"("tenantId");

-- CreateIndex
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");

-- CreateIndex
CREATE INDEX "checkout_attempts_tenantId_idx" ON "checkout_attempts"("tenantId");

-- AddForeignKey
ALTER TABLE "Audit" ADD CONSTRAINT "Audit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromptVersion" ADD CONSTRAINT "PromptVersion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromptPerformanceLog" ADD CONSTRAINT "PromptPerformanceLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromptPerformanceLog" ADD CONSTRAINT "PromptPerformanceLog_promptVersionHash_fkey" FOREIGN KEY ("promptVersionHash") REFERENCES "PromptVersion"("versionHash") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ABExperiment" ADD CONSTRAINT "ABExperiment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ABVariant" ADD CONSTRAINT "ABVariant_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "ABExperiment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ABVariant" ADD CONSTRAINT "ABVariant_promptVersionHash_fkey" FOREIGN KEY ("promptVersionHash") REFERENCES "PromptVersion"("versionHash") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ABVariant" ADD CONSTRAINT "ABVariant_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prediction" ADD CONSTRAINT "Prediction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prediction" ADD CONSTRAINT "Prediction_promptVersionHash_fkey" FOREIGN KEY ("promptVersionHash") REFERENCES "PromptVersion"("versionHash") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scenario" ADD CONSTRAINT "Scenario_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "OutreachTemplatePerformance_tenantId_templateId_vertical_city_k" RENAME TO "OutreachTemplatePerformance_tenantId_templateId_vertical_ci_key";
