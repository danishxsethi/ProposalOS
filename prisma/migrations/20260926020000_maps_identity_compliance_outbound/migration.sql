ALTER TABLE "Proposal" ADD COLUMN "outboundEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Audit" ADD COLUMN "businessLatitude" DOUBLE PRECISION;
ALTER TABLE "Audit" ADD COLUMN "businessLongitude" DOUBLE PRECISION;

ALTER TABLE "ProposalOutreach"
  ALTER COLUMN "sentAt" DROP NOT NULL,
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "providerMessageId" TEXT,
  ADD COLUMN "providerName" TEXT,
  ADD COLUMN "errorMessage" TEXT;
CREATE UNIQUE INDEX "ProposalOutreach_idempotencyKey_key" ON "ProposalOutreach"("idempotencyKey");
CREATE INDEX "ProposalOutreach_tenantId_idempotencyKey_idx" ON "ProposalOutreach"("tenantId", "idempotencyKey");

ALTER TABLE "OutreachEmail"
  ADD COLUMN "providerName" TEXT,
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "suppressedAt" TIMESTAMP(3),
  ADD COLUMN "unsubscribeTokenHash" TEXT,
  ADD COLUMN "lastAttemptAt" TIMESTAMP(3),
  ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX "OutreachEmail_idempotencyKey_key" ON "OutreachEmail"("idempotencyKey");
CREATE INDEX "OutreachEmail_unsubscribeTokenHash_idx" ON "OutreachEmail"("unsubscribeTokenHash");

CREATE TABLE "BusinessPlaceIdentity" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "placeId" TEXT NOT NULL,
  "locationGroupId" TEXT,
  "businessName" TEXT NOT NULL,
  "identityStatus" TEXT NOT NULL,
  "identityConfidence" INTEGER,
  "candidateCount" INTEGER NOT NULL DEFAULT 1,
  "fieldProfile" TEXT NOT NULL,
  "lastObservedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BusinessPlaceIdentity_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BusinessPlaceIdentity_tenantId_placeId_key" ON "BusinessPlaceIdentity"("tenantId", "placeId");
CREATE INDEX "BusinessPlaceIdentity_tenantId_identityStatus_idx" ON "BusinessPlaceIdentity"("tenantId", "identityStatus");
CREATE INDEX "BusinessPlaceIdentity_locationGroupId_idx" ON "BusinessPlaceIdentity"("locationGroupId");
ALTER TABLE "BusinessPlaceIdentity" ADD CONSTRAINT "BusinessPlaceIdentity_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BusinessPlaceIdentity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BusinessPlaceIdentity" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "BusinessPlaceIdentity" FOR ALL
  USING ("tenantId"::text = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId"::text = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_bypass ON "BusinessPlaceIdentity" FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

GRANT SELECT, INSERT, UPDATE, DELETE ON "BusinessPlaceIdentity" TO app_user;

CREATE TABLE "ProcessedOutboundWebhook" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "tenantId" TEXT,
  CONSTRAINT "ProcessedOutboundWebhook_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ProcessedOutboundWebhook_provider_processedAt_idx" ON "ProcessedOutboundWebhook"("provider", "processedAt");
CREATE INDEX "ProcessedOutboundWebhook_tenantId_processedAt_idx" ON "ProcessedOutboundWebhook"("tenantId", "processedAt");
ALTER TABLE "ProcessedOutboundWebhook" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProcessedOutboundWebhook" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ProcessedOutboundWebhook" FOR ALL
  USING ("tenantId"::text = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId"::text = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_bypass ON "ProcessedOutboundWebhook" FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');
GRANT SELECT, INSERT, UPDATE, DELETE ON "ProcessedOutboundWebhook" TO app_user;
