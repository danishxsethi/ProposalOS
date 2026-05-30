-- AlterTable
-- Add circuit breaker fields to PipelineConfig
ALTER TABLE "PipelineConfig" 
  ADD COLUMN IF NOT EXISTS "circuitBreakerEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "errorRateThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS "circuitBreakerMinSamples" INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS "circuitBreakerWindowMs" INTEGER NOT NULL DEFAULT 300000,
  ADD COLUMN IF NOT EXISTS "circuitBreakerOpenTimeoutMs" INTEGER NOT NULL DEFAULT 600000,
  ADD COLUMN IF NOT EXISTS "circuitBreakerHalfOpenMaxAttempts" INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS "maxFailureCount" INTEGER NOT NULL DEFAULT 3;

-- CreateTable
-- Circuit Breaker State per tenant/stage
CREATE TABLE IF NOT EXISTS "CircuitBreakerState" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" TEXT NOT NULL,
  "stage" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'CLOSED',
  "errorCount" INTEGER NOT NULL DEFAULT 0,
  "successCount" INTEGER NOT NULL DEFAULT 0,
  "totalAttempts" INTEGER NOT NULL DEFAULT 0,
  "lastErrorAt" TIMESTAMP(3),
  "lastStateChangeAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "halfOpenAttempts" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CircuitBreakerState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
-- Dead Letter Queue for permanently failed prospects
CREATE TABLE IF NOT EXISTS "DeadLetterQueue" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" TEXT NOT NULL,
  "prospectId" TEXT NOT NULL,
  "originalStatus" TEXT NOT NULL,
  "failureCount" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT NOT NULL,
  "lastErrorAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'pending',

  CONSTRAINT "DeadLetterQueue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CircuitBreakerState_tenantId_stage_key" ON "CircuitBreakerState"("tenantId", "stage");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CircuitBreakerState_tenantId_state_idx" ON "CircuitBreakerState"("tenantId", "state");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CircuitBreakerState_stage_idx" ON "CircuitBreakerState"("stage");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "DeadLetterQueue_prospectId_key" ON "DeadLetterQueue"("prospectId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DeadLetterQueue_tenantId_status_idx" ON "DeadLetterQueue"("tenantId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DeadLetterQueue_createdAt_idx" ON "DeadLetterQueue"("createdAt");

-- AddForeignKey
ALTER TABLE "CircuitBreakerState" 
  ADD CONSTRAINT "CircuitBreakerState_tenantId_fkey" 
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeadLetterQueue" 
  ADD CONSTRAINT "DeadLetterQueue_tenantId_fkey" 
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeadLetterQueue" 
  ADD CONSTRAINT "DeadLetterQueue_prospectId_fkey" 
  FOREIGN KEY ("prospectId") REFERENCES "ProspectLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;