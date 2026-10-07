-- Read-only storage-reference inventory for an isolated restored database copy.
-- This query returns only aggregate row counts. It never returns tenant IDs,
-- object keys, URLs, or JSON values. Do not run it on the live production DB:
-- the JSON scans may be expensive, and the migration inventory belongs on a
-- restored snapshot/export before any URL rewrites or object copies.

BEGIN TRANSACTION READ ONLY;

WITH candidates (surface, payload) AS (
  SELECT 'TenantBranding.logoUrl', "logoUrl" FROM "TenantBranding" WHERE "logoUrl" IS NOT NULL
  UNION ALL
  SELECT 'TenantBranding.logoDarkUrl', "logoDarkUrl" FROM "TenantBranding" WHERE "logoDarkUrl" IS NOT NULL
  UNION ALL
  SELECT 'Tenant.branding', "branding"::text FROM "Tenant" WHERE "branding" IS NOT NULL
  UNION ALL
  SELECT 'Proposal.pdfUrl', "pdfUrl" FROM "Proposal" WHERE "pdfUrl" IS NOT NULL
  UNION ALL
  SELECT 'DeliveryBundle.zipUrl', "zipUrl" FROM "DeliveryBundle" WHERE "zipUrl" IS NOT NULL
  UNION ALL
  SELECT 'Finding.evidence', "evidence"::text FROM "Finding" WHERE "evidence" IS NOT NULL
  UNION ALL
  SELECT 'EvidenceSnapshot.rawResponse', "rawResponse"::text FROM "EvidenceSnapshot" WHERE "rawResponse" IS NOT NULL
)
SELECT
  surface,
  COUNT(*) AS rows_with_value,
  COUNT(*) FILTER (
    WHERE payload ~* '(gs://|gs%3a%2f%2f|storage[.]googleapis[.]com|storage[.]cloud[.]google[.]com|firebasestorage[.]googleapis[.]com)'
  ) AS rows_with_gcs_reference,
  COUNT(*) FILTER (
    WHERE payload ~* '(s3://|s3%3a%2f%2f|s3([.-][a-z0-9-]+)*[.]amazonaws[.]com|[.][a-z0-9.-]+[.]s3([.-][a-z0-9-]+)*[.]amazonaws[.]com)'
  ) AS rows_with_s3_reference,
  COUNT(*) FILTER (
    WHERE payload ~* '(/api/storage/private|/api/public/tenant-logo)'
  ) AS rows_with_app_mediated_reference
FROM candidates
GROUP BY surface
ORDER BY surface;

COMMIT;
