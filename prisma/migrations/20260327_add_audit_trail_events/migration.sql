CREATE TABLE IF NOT EXISTS "AuditTrailEvent" (
  "id" TEXT PRIMARY KEY,
  "eventType" TEXT NOT NULL,
  "occurredAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "tenantId" TEXT,
  "auditId" TEXT,
  "proposalId" TEXT,
  "actorId" TEXT,
  "triggerSource" TEXT,
  "correlationId" TEXT,
  "traceId" TEXT,
  "targetUrlEncrypted" TEXT,
  "targetUrlHash" TEXT,
  "modulesRun" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "findingsCount" INTEGER,
  "proposalGenerated" BOOLEAN NOT NULL DEFAULT false,
  "proposalDelivered" BOOLEAN NOT NULL DEFAULT false,
  "payload" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "previousHash" TEXT,
  "eventHash" TEXT NOT NULL UNIQUE
);

CREATE INDEX IF NOT EXISTS "AuditTrailEvent_tenantId_occurredAt_idx"
  ON "AuditTrailEvent" ("tenantId", "occurredAt");

CREATE INDEX IF NOT EXISTS "AuditTrailEvent_auditId_occurredAt_idx"
  ON "AuditTrailEvent" ("auditId", "occurredAt");

CREATE INDEX IF NOT EXISTS "AuditTrailEvent_proposalId_occurredAt_idx"
  ON "AuditTrailEvent" ("proposalId", "occurredAt");

CREATE INDEX IF NOT EXISTS "AuditTrailEvent_eventType_occurredAt_idx"
  ON "AuditTrailEvent" ("eventType", "occurredAt");