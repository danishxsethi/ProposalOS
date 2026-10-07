-- Reconcile legacy baseline tables and the application-role grants expected by
-- later migrations. The AWS staging import records the older migrations as
-- applied, but the exported schema omitted several baseline tables and roles.
-- This migration is additive: existing tables are preserved and only missing
-- tables, indexes, constraints, policies, and grants are created.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user NOLOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "processed_webhook_events" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "processed_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "failed_webhook_events" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "errorMessage" TEXT,
  "errorStack" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastAttempt" TIMESTAMP(3),
  "resolved" BOOLEAN NOT NULL DEFAULT false,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "tenantId" TEXT,
  CONSTRAINT "failed_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "cart_abandonment_events" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "proposalId" TEXT NOT NULL,
  "checkoutType" TEXT NOT NULL,
  "step" TEXT NOT NULL,
  "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata" JSONB,
  "tenantId" TEXT NOT NULL,
  CONSTRAINT "cart_abandonment_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "pricing_plans" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "type" TEXT NOT NULL,
  "interval" TEXT,
  "status" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "tiers" JSONB NOT NULL,
  "stripeProductId" TEXT,
  "stripePriceIds" JSONB,
  "features" JSONB,
  "limits" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdBy" TEXT,
  "updatedBy" TEXT,
  CONSTRAINT "pricing_plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "subscriptions" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "stripeSubscriptionId" TEXT NOT NULL,
  "stripePriceId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "currentPeriodStart" TIMESTAMP(3) NOT NULL,
  "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
  "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "payments" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "stripeInvoiceId" TEXT,
  "stripeChargeId" TEXT,
  "amountCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'usd',
  "status" TEXT NOT NULL,
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "failed_webhook_events_eventId_key" ON "failed_webhook_events"("eventId");
CREATE INDEX IF NOT EXISTS "failed_webhook_events_eventId_idx" ON "failed_webhook_events"("eventId");
CREATE INDEX IF NOT EXISTS "failed_webhook_events_resolved_createdAt_idx" ON "failed_webhook_events"("resolved", "createdAt");
CREATE INDEX IF NOT EXISTS "failed_webhook_events_tenantId_idx" ON "failed_webhook_events"("tenantId");
CREATE INDEX IF NOT EXISTS "cart_abandonment_events_sessionId_timestamp_idx" ON "cart_abandonment_events"("sessionId", "timestamp");
CREATE INDEX IF NOT EXISTS "cart_abandonment_events_proposalId_timestamp_idx" ON "cart_abandonment_events"("proposalId", "timestamp");
CREATE INDEX IF NOT EXISTS "cart_abandonment_events_checkoutType_timestamp_idx" ON "cart_abandonment_events"("checkoutType", "timestamp");
CREATE INDEX IF NOT EXISTS "cart_abandonment_events_step_timestamp_idx" ON "cart_abandonment_events"("step", "timestamp");
CREATE INDEX IF NOT EXISTS "cart_abandonment_events_tenantId_idx" ON "cart_abandonment_events"("tenantId");
CREATE INDEX IF NOT EXISTS "pricing_plans_type_status_idx" ON "pricing_plans"("type", "status");
CREATE INDEX IF NOT EXISTS "pricing_plans_stripeProductId_idx" ON "pricing_plans"("stripeProductId");
CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_stripeSubscriptionId_key" ON "subscriptions"("stripeSubscriptionId");
CREATE INDEX IF NOT EXISTS "subscriptions_tenantId_idx" ON "subscriptions"("tenantId");
CREATE UNIQUE INDEX IF NOT EXISTS "payments_stripeInvoiceId_key" ON "payments"("stripeInvoiceId");
CREATE INDEX IF NOT EXISTS "payments_tenantId_idx" ON "payments"("tenantId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'failed_webhook_events_tenantId_fkey' AND conrelid = 'public.failed_webhook_events'::regclass) THEN
    ALTER TABLE "failed_webhook_events" ADD CONSTRAINT "failed_webhook_events_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cart_abandonment_events_tenantId_fkey' AND conrelid = 'public.cart_abandonment_events'::regclass) THEN
    ALTER TABLE "cart_abandonment_events" ADD CONSTRAINT "cart_abandonment_events_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_tenantId_fkey' AND conrelid = 'public.subscriptions'::regclass) THEN
    ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_tenantId_fkey' AND conrelid = 'public.payments'::regclass) THEN
    ALTER TABLE "payments" ADD CONSTRAINT "payments_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

ALTER TABLE "failed_webhook_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "failed_webhook_events" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "failed_webhook_events";
CREATE POLICY tenant_isolation ON "failed_webhook_events" FOR ALL
  USING (((current_user = 'postgres' AND (current_setting('app.current_tenant_id', true) = '' OR current_setting('app.current_tenant_id', true) IS NULL)) OR "tenantId" IS NULL OR "tenantId"::text = current_setting('app.current_tenant_id', true)))
  WITH CHECK (((current_user = 'postgres' AND (current_setting('app.current_tenant_id', true) = '' OR current_setting('app.current_tenant_id', true) IS NULL)) OR "tenantId" IS NULL OR "tenantId"::text = current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS tenant_bypass ON "failed_webhook_events";
CREATE POLICY tenant_bypass ON "failed_webhook_events" FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

ALTER TABLE "cart_abandonment_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cart_abandonment_events" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "cart_abandonment_events";
CREATE POLICY tenant_isolation ON "cart_abandonment_events" FOR ALL
  USING (((current_user = 'postgres' AND (current_setting('app.current_tenant_id', true) = '' OR current_setting('app.current_tenant_id', true) IS NULL)) OR "tenantId"::text = current_setting('app.current_tenant_id', true)))
  WITH CHECK (((current_user = 'postgres' AND (current_setting('app.current_tenant_id', true) = '' OR current_setting('app.current_tenant_id', true) IS NULL)) OR "tenantId"::text = current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS tenant_bypass ON "cart_abandonment_events";
CREATE POLICY tenant_bypass ON "cart_abandonment_events" FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subscriptions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "subscriptions";
CREATE POLICY tenant_isolation ON "subscriptions" FOR ALL
  USING (((current_user = 'postgres' AND (current_setting('app.current_tenant_id', true) = '' OR current_setting('app.current_tenant_id', true) IS NULL)) OR "tenantId"::text = current_setting('app.current_tenant_id', true)))
  WITH CHECK (((current_user = 'postgres' AND (current_setting('app.current_tenant_id', true) = '' OR current_setting('app.current_tenant_id', true) IS NULL)) OR "tenantId"::text = current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS tenant_bypass ON "subscriptions";
CREATE POLICY tenant_bypass ON "subscriptions" FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payments" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "payments";
CREATE POLICY tenant_isolation ON "payments" FOR ALL
  USING (((current_user = 'postgres' AND (current_setting('app.current_tenant_id', true) = '' OR current_setting('app.current_tenant_id', true) IS NULL)) OR "tenantId"::text = current_setting('app.current_tenant_id', true)))
  WITH CHECK (((current_user = 'postgres' AND (current_setting('app.current_tenant_id', true) = '' OR current_setting('app.current_tenant_id', true) IS NULL)) OR "tenantId"::text = current_setting('app.current_tenant_id', true)));
DROP POLICY IF EXISTS tenant_bypass ON "payments";
CREATE POLICY tenant_bypass ON "payments" FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO app_user', current_database());
END
$$;

GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;

DO $$
DECLARE
  app_role RECORD;
BEGIN
  FOR app_role IN
    SELECT rolname
    FROM pg_roles
    WHERE rolname = 'proposalos_app' OR left(rolname, 14) = 'proposalos_app_'
  LOOP
    EXECUTE format('GRANT app_user TO %I', app_role.rolname);
  END LOOP;
END
$$;
