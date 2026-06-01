-- AlterTable - ProposalAcceptance
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ProposalAcceptance') THEN
        ALTER TABLE "ProposalAcceptance" ADD COLUMN IF NOT EXISTS "tenantId" TEXT NOT NULL;
        CREATE INDEX IF NOT EXISTS "ProposalAcceptance_tenantId_idx" ON "ProposalAcceptance"("tenantId");
        ALTER TABLE "ProposalAcceptance" DROP CONSTRAINT IF EXISTS "ProposalAcceptance_tenantId_fkey";
        ALTER TABLE "ProposalAcceptance" ADD CONSTRAINT "ProposalAcceptance_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END
$$;

-- AlterTable - ProposalView
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ProposalView') THEN
        ALTER TABLE "ProposalView" ADD COLUMN IF NOT EXISTS "tenantId" TEXT NOT NULL;
        CREATE INDEX IF NOT EXISTS "ProposalView_tenantId_idx" ON "ProposalView"("tenantId");
        ALTER TABLE "ProposalView" DROP CONSTRAINT IF EXISTS "ProposalView_tenantId_fkey";
        ALTER TABLE "ProposalView" ADD CONSTRAINT "ProposalView_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END
$$;

-- AlterTable - AuditTarget
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'AuditTarget') THEN
        ALTER TABLE "AuditTarget" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
        CREATE INDEX IF NOT EXISTS "AuditTarget_tenantId_idx" ON "AuditTarget"("tenantId");
        ALTER TABLE "AuditTarget" DROP CONSTRAINT IF EXISTS "AuditTarget_tenantId_fkey";
        ALTER TABLE "AuditTarget" ADD CONSTRAINT "AuditTarget_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END
$$;

-- AlterTable - OutreachTemplatePerformance
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'OutreachTemplatePerformance') THEN
        ALTER TABLE "OutreachTemplatePerformance" ADD COLUMN IF NOT EXISTS "tenantId" TEXT NOT NULL;
        DROP INDEX IF EXISTS "OutreachTemplatePerformance_templateId_vertical_city_key";
        CREATE UNIQUE INDEX IF NOT EXISTS "OutreachTemplatePerformance_tenantId_templateId_vertical_city_key" ON "OutreachTemplatePerformance"("tenantId", "templateId", "vertical", "city");
        CREATE INDEX IF NOT EXISTS "OutreachTemplatePerformance_tenantId_idx" ON "OutreachTemplatePerformance"("tenantId");
        ALTER TABLE "OutreachTemplatePerformance" DROP CONSTRAINT IF EXISTS "OutreachTemplatePerformance_tenantId_fkey";
        ALTER TABLE "OutreachTemplatePerformance" ADD CONSTRAINT "OutreachTemplatePerformance_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END
$$;

-- AlterTable - ProposalOutreach
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ProposalOutreach') THEN
        ALTER TABLE "ProposalOutreach" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
        ALTER TABLE "ProposalOutreach" ALTER COLUMN "tenantId" SET NOT NULL;
        CREATE INDEX IF NOT EXISTS "ProposalOutreach_tenantId_idx" ON "ProposalOutreach"("tenantId");
        ALTER TABLE "ProposalOutreach" DROP CONSTRAINT IF EXISTS "ProposalOutreach_tenantId_fkey";
        ALTER TABLE "ProposalOutreach" ADD CONSTRAINT "ProposalOutreach_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END
$$;

-- AlterTable - FollowUpEmailSend
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'FollowUpEmailSend') THEN
        ALTER TABLE "FollowUpEmailSend" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
        ALTER TABLE "FollowUpEmailSend" ALTER COLUMN "tenantId" SET NOT NULL;
        CREATE INDEX IF NOT EXISTS "FollowUpEmailSend_tenantId_idx" ON "FollowUpEmailSend"("tenantId");
        ALTER TABLE "FollowUpEmailSend" DROP CONSTRAINT IF EXISTS "FollowUpEmailSend_tenantId_fkey";
        ALTER TABLE "FollowUpEmailSend" ADD CONSTRAINT "FollowUpEmailSend_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END
$$;

-- AlterTable - failed_webhook_events
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'failed_webhook_events') THEN
        ALTER TABLE "failed_webhook_events" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
        CREATE INDEX IF NOT EXISTS "failed_webhook_events_tenantId_idx" ON "failed_webhook_events"("tenantId");
        ALTER TABLE "failed_webhook_events" DROP CONSTRAINT IF EXISTS "failed_webhook_events_tenantId_fkey";
        ALTER TABLE "failed_webhook_events" ADD CONSTRAINT "failed_webhook_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END
$$;

-- AlterTable - cart_abandonment_events
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'cart_abandonment_events') THEN
        ALTER TABLE "cart_abandonment_events" ADD COLUMN IF NOT EXISTS "tenantId" TEXT NOT NULL;
        CREATE INDEX IF NOT EXISTS "cart_abandonment_events_tenantId_idx" ON "cart_abandonment_events"("tenantId");
        ALTER TABLE "cart_abandonment_events" DROP CONSTRAINT IF EXISTS "cart_abandonment_events_tenantId_fkey";
        ALTER TABLE "cart_abandonment_events" ADD CONSTRAINT "cart_abandonment_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END
$$;

-- AlterTable - PartnerDeliveredLead
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'PartnerDeliveredLead') THEN
        ALTER TABLE "PartnerDeliveredLead" ADD COLUMN IF NOT EXISTS "tenantId" TEXT NOT NULL;
        CREATE INDEX IF NOT EXISTS "PartnerDeliveredLead_tenantId_idx" ON "PartnerDeliveredLead"("tenantId");
        ALTER TABLE "PartnerDeliveredLead" DROP CONSTRAINT IF EXISTS "PartnerDeliveredLead_tenantId_fkey";
        ALTER TABLE "PartnerDeliveredLead" ADD CONSTRAINT "PartnerDeliveredLead_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END
$$;