-- Reconcile schema.prisma with the committed migration chain (drift gate).
-- Enum variants were referenced by lib/outreach/* and app/api/outreach/webhook
-- but never migrated; on a fresh database those writes would fail.
-- All statements are additive / non-destructive. IF NOT EXISTS keeps this
-- migration safe against databases that were previously synced via `db push`.

ALTER TYPE "OutreachEmailStatus" ADD VALUE IF NOT EXISTS 'AWAITING_APPROVAL';
ALTER TYPE "OutreachEmailStatus" ADD VALUE IF NOT EXISTS 'SIMULATED';
ALTER TYPE "OutreachEmailStatus" ADD VALUE IF NOT EXISTS 'QUEUED';
ALTER TYPE "OutreachEmailStatus" ADD VALUE IF NOT EXISTS 'SENDING';
ALTER TYPE "OutreachEmailStatus" ADD VALUE IF NOT EXISTS 'DELIVERED';
ALTER TYPE "OutreachEmailStatus" ADD VALUE IF NOT EXISTS 'BOUNCED';
ALTER TYPE "OutreachEmailStatus" ADD VALUE IF NOT EXISTS 'COMPLAINED';

ALTER TYPE "OutreachEventType" ADD VALUE IF NOT EXISTS 'DELIVERED';
ALTER TYPE "OutreachEventType" ADD VALUE IF NOT EXISTS 'BOUNCED';
ALTER TYPE "OutreachEventType" ADD VALUE IF NOT EXISTS 'COMPLAINED';

-- Cosmetic reconciliation so `prisma migrate diff` reports zero drift.
ALTER TABLE "LifecycleOccurrence" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "ProposalOutreach" ALTER COLUMN "sentAt" DROP DEFAULT;
CREATE INDEX IF NOT EXISTS "OutreachEmail_tenantId_idempotencyKey_idx" ON "OutreachEmail"("tenantId", "idempotencyKey");
ALTER INDEX IF EXISTS "LifecycleOccurrence_tenantId_workflow_entityId_occurrenceKey_ke"
  RENAME TO "LifecycleOccurrence_tenantId_workflow_entityId_occurrenceKe_key";
