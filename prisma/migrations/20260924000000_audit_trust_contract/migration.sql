-- Campaign 1: explicit audit trust state, module outcomes, and evidence provenance.
ALTER TYPE "FindingType" ADD VALUE IF NOT EXISTS 'POSITIVE';

-- The runtime contract and UI use integer 0-10 scores. Historical confidence
-- uses a mixed convention: values above 10 were percentages; values at or below
-- 10 are already on the product scale. Impact scores already use 1-10.
ALTER TABLE "Finding" DROP CONSTRAINT IF EXISTS "Finding_confidenceScore_check";
ALTER TABLE "Finding" DROP CONSTRAINT IF EXISTS "Finding_impactScore_check";
ALTER TABLE "Finding" ALTER COLUMN "confidenceScore" TYPE INTEGER
  USING CASE WHEN "confidenceScore" > 10 THEN round("confidenceScore"::numeric / 10)::integer
             ELSE "confidenceScore" END;
ALTER TABLE "Finding"
  ADD CONSTRAINT "Finding_confidenceScore_check"
  CHECK ("confidenceScore" >= 0 AND "confidenceScore" <= 10);
ALTER TABLE "Finding"
  ADD CONSTRAINT "Finding_impactScore_check"
  CHECK ("impactScore" >= 1 AND "impactScore" <= 10);

CREATE TYPE "AuditTrustState" AS ENUM ('PENDING', 'TRUSTED', 'DEGRADED_REVIEW_REQUIRED', 'FAILED');
ALTER TABLE "Audit" ADD COLUMN "trustState" "AuditTrustState" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "Audit" ADD COLUMN "moduleResults" JSONB NOT NULL DEFAULT '{}';

ALTER TABLE "EvidenceSnapshot" ADD COLUMN "targetUrl" TEXT;
ALTER TABLE "EvidenceSnapshot" ADD COLUMN "providerRequestId" TEXT;
ALTER TABLE "EvidenceSnapshot" ADD COLUMN "methodVersion" TEXT;
ALTER TABLE "EvidenceSnapshot" ADD COLUMN "observationStatus" TEXT NOT NULL DEFAULT 'COMPLETE';

CREATE INDEX "EvidenceSnapshot_tenantId_auditId_module_collectedAt_idx"
  ON "EvidenceSnapshot"("tenantId", "auditId", "module", "collectedAt");
