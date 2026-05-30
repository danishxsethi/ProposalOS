-- AlterTable - Add tenantId to ProposalAcceptance
ALTER TABLE "ProposalAcceptance" ADD COLUMN "tenantId" TEXT NOT NULL;
CREATE INDEX "ProposalAcceptance_tenantId_idx" ON "ProposalAcceptance"("tenantId");
ALTER TABLE "ProposalAcceptance" ADD CONSTRAINT "ProposalAcceptance_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable - Add tenantId to ProposalView
ALTER TABLE "ProposalView" ADD COLUMN "tenantId" TEXT NOT NULL;
CREATE INDEX "ProposalView_tenantId_idx" ON "ProposalView"("tenantId");
ALTER TABLE "ProposalView" ADD CONSTRAINT "ProposalView_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable - Add tenantId to AuditTarget (nullable for system-wide targets)
ALTER TABLE "AuditTarget" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "AuditTarget_tenantId_idx" ON "AuditTarget"("tenantId");
ALTER TABLE "AuditTarget" ADD CONSTRAINT "AuditTarget_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable - Add tenantId to OutreachTemplatePerformance
ALTER TABLE "OutreachTemplatePerformance" ADD COLUMN "tenantId" TEXT NOT NULL;
DROP INDEX IF EXISTS "OutreachTemplatePerformance_templateId_vertical_city_key";
CREATE UNIQUE INDEX "OutreachTemplatePerformance_tenantId_templateId_vertical_city_key" ON "OutreachTemplatePerformance"("tenantId", "templateId", "vertical", "city");
CREATE INDEX "OutreachTemplatePerformance_tenantId_idx" ON "OutreachTemplatePerformance"("tenantId");
ALTER TABLE "OutreachTemplatePerformance" ADD CONSTRAINT "OutreachTemplatePerformance_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable - Add tenantId to ProposalOutreach (make required)
ALTER TABLE "ProposalOutreach" ALTER COLUMN "tenantId" SET NOT NULL;
CREATE INDEX "ProposalOutreach_tenantId_idx" ON "ProposalOutreach"("tenantId");
ALTER TABLE "ProposalOutreach" ADD CONSTRAINT "ProposalOutreach_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable - Add tenantId to FollowUpEmailSend (make required)
ALTER TABLE "FollowUpEmailSend" ALTER COLUMN "tenantId" SET NOT NULL;
CREATE INDEX "FollowUpEmailSend_tenantId_idx" ON "FollowUpEmailSend"("tenantId");
ALTER TABLE "FollowUpEmailSend" ADD CONSTRAINT "FollowUpEmailSend_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable - Add tenantId to FailedWebhookEvent (nullable for system-level webhooks)
ALTER TABLE "failed_webhook_events" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "failed_webhook_events_tenantId_idx" ON "failed_webhook_events"("tenantId");
ALTER TABLE "failed_webhook_events" ADD CONSTRAINT "failed_webhook_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable - Add tenantId to CartAbandonmentEvent
ALTER TABLE "cart_abandonment_events" ADD COLUMN "tenantId" TEXT NOT NULL;
CREATE INDEX "cart_abandonment_events_tenantId_idx" ON "cart_abandonment_events"("tenantId");
ALTER TABLE "cart_abandonment_events" ADD CONSTRAINT "cart_abandonment_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable - Add tenantId to PartnerDeliveredLead
ALTER TABLE "PartnerDeliveredLead" ADD COLUMN "tenantId" TEXT NOT NULL;
CREATE INDEX "PartnerDeliveredLead_tenantId_idx" ON "PartnerDeliveredLead"("tenantId");
ALTER TABLE "PartnerDeliveredLead" ADD CONSTRAINT "PartnerDeliveredLead_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;