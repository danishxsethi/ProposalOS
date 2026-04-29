-- AlterSchema
-- Add CHECK constraints for data validation at database level
-- Migration: 20260321_add_check_constraints

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
  CHECK ("engagementScore" >= 0 AND "engagementScore" <= 100));

-- OutreachEmail table: qualityScore must be 0-100
ALTER TABLE "OutreachEmail" 
  ADD CONSTRAINT "OutreachEmail_qualityScore_check" 
  CHECK ("qualityScore" >= 0 AND "qualityScore" <= 100));

-- ClientDashboard table: healthScore must be 0-100
ALTER TABLE "ClientDashboard" 
  ADD CONSTRAINT "ClientDashboard_healthScore_check" 
  CHECK ("healthScore" >= 0 AND "healthScore" <= 100));

-- NPSSurvey table: score must be 0-10
ALTER TABLE "NPSSurvey" 
  ADD CONSTRAINT "NPSSurvey_score_check" 
  CHECK ("score" IS NULL OR ("score" >= 0 AND "score" <= 10));

-- QATelemetry table: qaScore must be 0.0-1.0
ALTER TABLE "QATelemetry" 
  ADD CONSTRAINT "QATelemetry_qaScore_check" 
  CHECK ("qaScore" >= 0.0 AND "qaScore" <= 1.0));

-- PromptPerformanceLog table: qualityScore and downstreamImpact must be 0-100
ALTER TABLE "PromptPerformanceLog" 
  ADD CONSTRAINT "PromptPerformanceLog_qualityScore_check" 
  CHECK ("qualityScore" >= 0 AND "qualityScore" <= 100));

ALTER TABLE "PromptPerformanceLog" 
  ADD CONSTRAINT "PromptPerformanceLog_downstreamImpact_check" 
  CHECK ("downstreamImpact" >= 0 AND "downstreamImpact" <= 100));

-- ABVariant table: trafficPercentage must be 0-100
ALTER TABLE "ABVariant" 
  ADD CONSTRAINT "ABVariant_trafficPercentage_check" 
  CHECK ("trafficPercentage" >= 0 AND "trafficPercentage" <= 100));

-- Prediction table: confidenceIntervalLower must be <= predictedValue <= confidenceIntervalUpper
ALTER TABLE "Prediction" 
  ADD CONSTRAINT "Prediction_confidenceInterval_check" 
  CHECK ("confidenceIntervalLower" IS NULL OR "confidenceIntervalUpper" IS NULL OR 
         ("confidenceIntervalLower" <= "predictedValue" AND "predictedValue" <= "confidenceIntervalUpper"));

-- PipelineConfig table: Validate reasonable bounds
ALTER TABLE "PipelineConfig" 
  ADD CONSTRAINT "PipelineConfig_concurrencyLimit_check" 
  CHECK ("concurrencyLimit" > 0 AND "concurrencyLimit" <= 100);

ALTER TABLE "PipelineConfig" 
  ADD CONSTRAINT "PipelineConfig_batchSize_check" 
  CHECK ("batchSize" > 0 AND "batchSize" <= 1000);

ALTER TABLE "PipelineConfig" 
  ADD CONSTRAINT "PipelineConfig_painScoreThreshold_check" 
  CHECK ("painScoreThreshold" >= 0 AND "painScoreThreshold" <= 100));

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
  ));

-- Comment: Constraint purpose
-- These CHECK constraints provide defense-in-depth data validation
-- They mirror application-level Zod validation as a safety net
-- Constraints prevent invalid data even if application validation is bypassed