-- Wave 9D lifecycle controls. Forward-only and additive.
-- Rollback: drop lifecycle_occurrences and the three nullable NPSSurvey columns/index.

ALTER TABLE "NPSSurvey" ADD COLUMN "tokenHash" TEXT;
ALTER TABLE "NPSSurvey" ADD COLUMN "tokenExpiresAt" TIMESTAMP(3);
ALTER TABLE "NPSSurvey" ADD COLUMN "tokenConsumedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "NPSSurvey_tokenHash_key" ON "NPSSurvey"("tokenHash");
CREATE INDEX "NPSSurvey_tokenExpiresAt_idx" ON "NPSSurvey"("tokenExpiresAt");

CREATE TABLE "LifecycleOccurrence" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "workflow" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "occurrenceKey" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "recipientHash" TEXT,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 3,
  "nextAttemptAt" TIMESTAMP(3),
  "providerMessageId" TEXT,
  "lastErrorCode" TEXT,
  "leaseOwner" TEXT,
  "leaseExpiresAt" TIMESTAMP(3),
  "cancellationReason" TEXT,
  "cancellationActor" TEXT,
  "cancelledAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LifecycleOccurrence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LifecycleOccurrence_tenantId_workflow_entityId_occurrenceKey_key"
  ON "LifecycleOccurrence"("tenantId", "workflow", "entityId", "occurrenceKey");
CREATE INDEX "LifecycleOccurrence_tenantId_status_nextAttemptAt_idx"
  ON "LifecycleOccurrence"("tenantId", "status", "nextAttemptAt");
CREATE INDEX "LifecycleOccurrence_idempotencyKey_idx" ON "LifecycleOccurrence"("idempotencyKey");
CREATE INDEX "LifecycleOccurrence_recipientHash_status_idx"
  ON "LifecycleOccurrence"("recipientHash", "status");
