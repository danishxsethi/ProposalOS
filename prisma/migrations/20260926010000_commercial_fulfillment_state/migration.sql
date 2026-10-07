ALTER TABLE "ProposalAcceptance"
  ADD COLUMN "proposalVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "commercialFingerprint" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "commercialSnapshot" JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN "paymentTermsLockedAt" TIMESTAMP(3);

UPDATE "ProposalAcceptance" AS acceptance
SET "proposalVersion" = proposal."version",
    "paymentTermsLockedAt" = acceptance."acceptedAt",
    "commercialSnapshot" = jsonb_build_object('proposalId', proposal."id", 'proposalVersion', proposal."version", 'tier', acceptance."tier", 'legacy', true)
FROM "Proposal" AS proposal
WHERE proposal."id" = acceptance."proposalId";

ALTER TABLE "payments"
  ADD COLUMN "proposalId" TEXT,
  ADD COLUMN "acceptanceId" TEXT,
  ADD COLUMN "stripeSessionId" TEXT,
  ADD COLUMN "stripePaymentIntentId" TEXT;

CREATE UNIQUE INDEX "payments_stripeSessionId_key" ON "payments"("stripeSessionId");
CREATE UNIQUE INDEX "payments_stripePaymentIntentId_key" ON "payments"("stripePaymentIntentId");
CREATE INDEX "payments_proposalId_idx" ON "payments"("proposalId");
CREATE INDEX "payments_acceptanceId_idx" ON "payments"("acceptanceId");

ALTER TABLE "checkout_attempts"
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "acceptanceId" TEXT,
  ADD COLUMN "paymentIntentId" TEXT;
CREATE UNIQUE INDEX "checkout_attempts_idempotencyKey_key" ON "checkout_attempts"("idempotencyKey");

ALTER TABLE "Project" ADD COLUMN "orderId" TEXT;
CREATE UNIQUE INDEX "Project_orderId_key" ON "Project"("orderId");

CREATE TABLE "Order" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "proposalId" TEXT NOT NULL,
  "acceptanceId" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "commercialFingerprint" TEXT NOT NULL,
  "commercialSnapshot" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PAID',
  "paidAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Order_acceptanceId_key" ON "Order"("acceptanceId");
CREATE UNIQUE INDEX "Order_paymentId_key" ON "Order"("paymentId");
CREATE INDEX "Order_tenantId_status_createdAt_idx" ON "Order"("tenantId", "status", "createdAt");
CREATE INDEX "Order_proposalId_idx" ON "Order"("proposalId");

CREATE TABLE "FulfillmentTask" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'AWAITING_OPERATOR',
  "scope" JSONB NOT NULL,
  "executorType" TEXT NOT NULL DEFAULT 'OPERATOR',
  "ownerId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "verification" JSONB,
  "lastError" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FulfillmentTask_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FulfillmentTask_projectId_orderId_key" ON "FulfillmentTask"("projectId", "orderId");
CREATE INDEX "FulfillmentTask_tenantId_status_createdAt_idx" ON "FulfillmentTask"("tenantId", "status", "createdAt");

ALTER TABLE "payments" ADD CONSTRAINT "payments_proposalId_fkey"
  FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_acceptanceId_fkey"
  FOREIGN KEY ("acceptanceId") REFERENCES "ProposalAcceptance"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_proposalId_fkey"
  FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_acceptanceId_fkey"
  FOREIGN KEY ("acceptanceId") REFERENCES "ProposalAcceptance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FulfillmentTask" ADD CONSTRAINT "FulfillmentTask_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FulfillmentTask" ADD CONSTRAINT "FulfillmentTask_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FulfillmentTask" ADD CONSTRAINT "FulfillmentTask_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Order" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Order" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Order" FOR ALL
  USING ("tenantId"::text = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId"::text = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_bypass ON "Order" FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

ALTER TABLE "FulfillmentTask" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FulfillmentTask" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "FulfillmentTask" FOR ALL
  USING ("tenantId"::text = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId"::text = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_bypass ON "FulfillmentTask" FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

GRANT SELECT, INSERT, UPDATE, DELETE ON "Order", "FulfillmentTask" TO app_user;
