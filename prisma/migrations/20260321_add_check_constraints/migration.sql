-- AlterSchema
-- Add CHECK constraints for data validation at database level
-- Migration: 20260321_add_check_constraints
--
-- REMEDIATION NOTE (2026-05-14):
-- The original committed version of this file had two classes of SQL syntax errors:
--   1. Extra closing parentheses on simple CHECK expressions (e.g. `100))` instead of `100)`)
--   2. Missing closing parentheses on IS NULL OR (...) expressions (e.g. `100)` instead of `100))`)
-- Additionally, several ALTER TABLE statements referenced tables that are not created until
-- later migrations (ClientDashboard, PromptPerformanceLog, ABVariant, Prediction).
-- Those constraints are wrapped in DO $$ ... $$ blocks so they are skipped gracefully
-- on a fresh empty-DB replay if the tables do not yet exist, while still applying
-- correctly on databases where those tables already exist.
-- This file was corrected in-place because the project is pre-GA and the production
-- database (proposal-engine-db) was confirmed dormant with 0 rows (SECURITY-INCIDENT.md).
-- No production data was at risk.

-- Audit table: overallScore must be 0-100
ALTER TABLE "Audit"
  ADD CONSTRAINT "Audit_overallScore_check"
  CHECK ("overallScore" IS NULL OR ("overallScore" >= 0 AND "overallScore" <= 100));

-- Audit table: apiCostCents must be non-negative
ALTER TABLE "Audit"
  ADD CONSTRAINT "Audit_apiCostCents_check"
  CHECK ("apiCostCents" >= 0);

-- Finding table: impactScore must be 1-10
ALTER TABLE "Finding"
  ADD CONSTRAINT "Finding_impactScore_check"
  CHECK ("impactScore" >= 1 AND "impactScore" <= 10);

-- Finding table: confidenceScore must be 0-100
ALTER TABLE "Finding"
  ADD CONSTRAINT "Finding_confidenceScore_check"
  CHECK ("confidenceScore" >= 0 AND "confidenceScore" <= 100);

-- Proposal table: qaScore and clientScore must be 0-100
ALTER TABLE "Proposal"
  ADD CONSTRAINT "Proposal_qaScore_check"
  CHECK ("qaScore" IS NULL OR ("qaScore" >= 0 AND "qaScore" <= 100));

ALTER TABLE "Proposal"
  ADD CONSTRAINT "Proposal_clientScore_check"
  CHECK ("clientScore" IS NULL OR ("clientScore" >= 0 AND "clientScore" <= 100));

-- ProspectLead table: painScore must be 0-100
ALTER TABLE "ProspectLead"
  ADD CONSTRAINT "ProspectLead_painScore_check"
  CHECK ("painScore" IS NULL OR ("painScore" >= 0 AND "painScore" <= 100));

-- ProspectLead table: engagementScore must be 0-100
ALTER TABLE "ProspectLead"
  ADD CONSTRAINT "ProspectLead_engagementScore_check"
  CHECK ("engagementScore" >= 0 AND "engagementScore" <= 100);

-- OutreachEmail table: qualityScore must be 0-100
ALTER TABLE "OutreachEmail"
  ADD CONSTRAINT "OutreachEmail_qualityScore_check"
  CHECK ("qualityScore" >= 0 AND "qualityScore" <= 100);

-- ClientDashboard table: healthScore must be 0-100
-- Wrapped in DO block: table may not exist on a fresh empty-DB replay
-- (ClientDashboard is defined in schema.prisma but was not included in the init migration).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ClientDashboard') THEN
    ALTER TABLE "ClientDashboard"
      ADD CONSTRAINT "ClientDashboard_healthScore_check"
      CHECK ("healthScore" >= 0 AND "healthScore" <= 100);
  END IF;
END $$;

-- NPSSurvey table: score must be 0-10
ALTER TABLE "NPSSurvey"
  ADD CONSTRAINT "NPSSurvey_score_check"
  CHECK ("score" IS NULL OR ("score" >= 0 AND "score" <= 10));

-- QATelemetry table: qaScore must be 0.0-1.0
ALTER TABLE "QATelemetry"
  ADD CONSTRAINT "QATelemetry_qaScore_check"
  CHECK ("qaScore" >= 0.0 AND "qaScore" <= 1.0);

-- PromptPerformanceLog table: qualityScore and downstreamImpact must be 0-100
-- Wrapped in DO block: table may not exist on a fresh empty-DB replay.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'PromptPerformanceLog') THEN
    ALTER TABLE "PromptPerformanceLog"
      ADD CONSTRAINT "PromptPerformanceLog_qualityScore_check"
      CHECK ("qualityScore" >= 0 AND "qualityScore" <= 100);

    ALTER TABLE "PromptPerformanceLog"
      ADD CONSTRAINT "PromptPerformanceLog_downstreamImpact_check"
      CHECK ("downstreamImpact" >= 0 AND "downstreamImpact" <= 100);
  END IF;
END $$;

-- ABVariant table: trafficPercentage must be 0-100
-- Wrapped in DO block: table may not exist on a fresh empty-DB replay.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ABVariant') THEN
    ALTER TABLE "ABVariant"
      ADD CONSTRAINT "ABVariant_trafficPercentage_check"
      CHECK ("trafficPercentage" >= 0 AND "trafficPercentage" <= 100);
  END IF;
END $$;

-- Prediction table: confidenceIntervalLower must be <= predictedValue <= confidenceIntervalUpper
-- Wrapped in DO block: table may not exist on a fresh empty-DB replay.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Prediction') THEN
    ALTER TABLE "Prediction"
      ADD CONSTRAINT "Prediction_confidenceInterval_check"
      CHECK ("confidenceIntervalLower" IS NULL OR "confidenceIntervalUpper" IS NULL OR
             ("confidenceIntervalLower" <= "predictedValue" AND "predictedValue" <= "confidenceIntervalUpper"));
  END IF;
END $$;

-- PipelineConfig table: Validate reasonable bounds
ALTER TABLE "PipelineConfig"
  ADD CONSTRAINT "PipelineConfig_concurrencyLimit_check"
  CHECK ("concurrencyLimit" > 0 AND "concurrencyLimit" <= 100);

ALTER TABLE "PipelineConfig"
  ADD CONSTRAINT "PipelineConfig_batchSize_check"
  CHECK ("batchSize" > 0 AND "batchSize" <= 1000);

ALTER TABLE "PipelineConfig"
  ADD CONSTRAINT "PipelineConfig_painScoreThreshold_check"
  CHECK ("painScoreThreshold" >= 0 AND "painScoreThreshold" <= 100);

ALTER TABLE "PipelineConfig"
  ADD CONSTRAINT "PipelineConfig_dailyVolumeLimit_check"
  CHECK ("dailyVolumeLimit" > 0);

ALTER TABLE "PipelineConfig"
  ADD CONSTRAINT "PipelineConfig_spendingLimitCents_check"
  CHECK ("spendingLimitCents" >= 0);

-- CircuitBreakerState table: errorRate must be 0.0-1.0
ALTER TABLE "CircuitBreakerState"
  ADD CONSTRAINT "CircuitBreakerState_errorRate_check"
  CHECK (
    CASE
      WHEN "totalAttempts" = 0 THEN true
      ELSE ((("errorCount"::float / "totalAttempts"::float) >= 0.0) AND (("errorCount"::float / "totalAttempts"::float) <= 1.0))
    END
  );

-- Comment: Constraint purpose
-- These CHECK constraints provide defense-in-depth data validation
-- They mirror application-level Zod validation as a safety net
-- Constraints prevent invalid data even if application validation is bypassed
