-- P1-1: Backfill Finding.tenantId and make it required
UPDATE "Finding" f
SET "tenantId" = a."tenantId"
FROM "Audit" a
WHERE f."auditId" = a."id" AND f."tenantId" IS NULL;

-- Delete any orphaned findings that can't be backfilled
DELETE FROM "Finding" WHERE "tenantId" IS NULL;

-- Now make the column required
ALTER TABLE "Finding" ALTER COLUMN "tenantId" SET NOT NULL;

-- P1-2: Backfill Proposal.tenantId and make it required
UPDATE "Proposal" p
SET "tenantId" = a."tenantId"
FROM "Audit" a
WHERE p."auditId" = a."id" AND p."tenantId" IS NULL;

DELETE FROM "Proposal" WHERE "tenantId" IS NULL;

ALTER TABLE "Proposal" ALTER COLUMN "tenantId" SET NOT NULL;

-- P1-3: Backfill EvidenceSnapshot.tenantId and make it required
UPDATE "EvidenceSnapshot" e
SET "tenantId" = a."tenantId"
FROM "Audit" a
WHERE e."auditId" = a."id" AND e."tenantId" IS NULL;

DELETE FROM "EvidenceSnapshot" WHERE "tenantId" IS NULL;

ALTER TABLE "EvidenceSnapshot" ALTER COLUMN "tenantId" SET NOT NULL;

-- P1-4: Backfill ProposalTemplate.tenantId and make it required
-- Prefer deriving tenant from linked proposals when available.
UPDATE "ProposalTemplate" t
SET "tenantId" = p."tenantId"
FROM (
  SELECT "templateId", MIN("tenantId") AS "tenantId"
  FROM "Proposal"
  WHERE "templateId" IS NOT NULL
  GROUP BY "templateId"
) p
WHERE t."id" = p."templateId" AND t."tenantId" IS NULL;

-- Fallback unresolved rows to a dedicated legacy tenant bucket.
INSERT INTO "Tenant" ("id", "name", "slug", "isActive", "createdAt", "updatedAt")
SELECT
  'legacy-tenant-backfill',
  'Legacy Backfill Tenant',
  'legacy-backfill-tenant',
  false,
  NOW(),
  NOW()
WHERE NOT EXISTS (
  SELECT 1
  FROM "Tenant"
  WHERE "id" = 'legacy-tenant-backfill' OR "slug" = 'legacy-backfill-tenant'
);

UPDATE "ProposalTemplate"
SET "tenantId" = 'legacy-tenant-backfill'
WHERE "tenantId" IS NULL;

ALTER TABLE "ProposalTemplate" ALTER COLUMN "tenantId" SET NOT NULL;

-- P1-5: Backfill User.tenantId and make it required
-- Users do not have a deterministic historical link in older rows;
-- assign unresolved users to legacy tenant to preserve data.
UPDATE "User"
SET "tenantId" = 'legacy-tenant-backfill'
WHERE "tenantId" IS NULL;

ALTER TABLE "User" ALTER COLUMN "tenantId" SET NOT NULL;

-- P1-6: Backfill CheckoutAttempt.tenantId and make it required
-- Prefer deriving tenant from associated proposal when present.
UPDATE "checkout_attempts" c
SET "tenantId" = p."tenantId"
FROM "Proposal" p
WHERE c."proposalId" = p."id" AND c."tenantId" IS NULL;

UPDATE "checkout_attempts"
SET "tenantId" = 'legacy-tenant-backfill'
WHERE "tenantId" IS NULL;

ALTER TABLE "checkout_attempts" ALTER COLUMN "tenantId" SET NOT NULL;

-- P1-7: Backfill QATelemetry.tenantId and make it required
-- Prefer proposal tenant first, then audit tenant.
UPDATE "QATelemetry" q
SET "tenantId" = p."tenantId"
FROM "Proposal" p
WHERE q."proposalId" = p."id" AND q."tenantId" IS NULL;

UPDATE "QATelemetry" q
SET "tenantId" = a."tenantId"
FROM "Audit" a
WHERE q."auditId" = a."id" AND q."tenantId" IS NULL;

UPDATE "QATelemetry"
SET "tenantId" = 'legacy-tenant-backfill'
WHERE "tenantId" IS NULL;

ALTER TABLE "QATelemetry" ALTER COLUMN "tenantId" SET NOT NULL;
