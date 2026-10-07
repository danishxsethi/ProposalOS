-- Persist the proposal version fingerprint separately from mutable QA JSON so
-- public access can verify that the approved artifact has not changed.
ALTER TABLE "Proposal"
  ADD COLUMN "publicationFingerprint" TEXT NOT NULL DEFAULT '';

-- Backfill from existing JSON approvals where the approval was already version-bound.
UPDATE "Proposal"
SET "publicationFingerprint" = "qaResults"->>'publicationFingerprint'
WHERE "qaResults"->>'publicationFingerprint' IS NOT NULL
  AND "qaResults"->'publicationApproval'->>'decision' = 'APPROVED'
  AND "qaResults"->'publicationApproval'->>'proposalVersion' = "version"::text;
