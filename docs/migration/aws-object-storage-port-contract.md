# ProposalOS object storage port contract

**Status (2026-10-04):** S3 adapter and application routes are present in the working tree; the AWS staging stack is live, but the production S3 bucket is only defined in Terraform and has not been deployed. Production database-reference reconciliation and object migration remain outstanding.
**Target:** private S3 objects, authenticated tenant reads, and an app-mediated public-logo endpoint. CloudFront is not in the current low-cost production root.

## Current storage call sites

| Surface           | Current behavior                                                                                                                                                                                                                                                          | Durable state or readers                                                                                                                                                                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tenant logos      | `app/api/upload/route.ts` uploads to private S3 under `logos/<tenantId>/...` and returns `/api/public/tenant-logo`. That route enforces the tenant key prefix and serves only JPEG/PNG/WebP.                                                                              | `TenantBranding.logoUrl` / `logoDarkUrl` persist branding URLs; `Tenant.branding` may also contain legacy JSON values. Images are public by design, but are proxied through the app rather than a CDN.                                                                           |
| Audit screenshots | `lib/evidence/screenshotCapture.ts` uploads PNGs and thumbnails to `screenshots/<tenantId>/<auditId>/...` and returns a stable `/api/storage/private?ref=s3://...` URL. `lib/llm/multimodal.ts` resolves the embedded S3 reference directly for server-side vision calls. | Finding evidence and `EvidenceSnapshot.rawResponse` can persist these URLs. `app/api/storage/private` requires authentication and checks that the S3 key belongs to the current tenant before redirecting to a five-minute S3 URL.                                               |
| Delivery bundles  | `lib/delivery/bundler.ts` uploads under `delivery-bundles/<tenantId>/<proposalId>/...`; writes remain gated by `DELIVERY_STORAGE_ENABLED`.                                                                                                                                | `DeliveryBundle.zipUrl` uses the stable private app URL. The download-status endpoint still reports that an access-controlled download is required; no dedicated route verifies bundle state and proposal acceptance yet. Keep the feature disabled until that flow is complete. |
| Proposal PDFs     | `lib/pdf/uploadPdf.ts` and `lib/storage.ts` have S3 upload helpers that return private app URLs. No call site for `uploadPdfToS3()` was found in the current source scan.                                                                                                 | `Proposal.pdfUrl` exists in Prisma; inventory legacy GCS URLs and confirm any live PDF generation call path before the GCP bucket is retired.                                                                                                                                    |

The current `app/` and `lib/` runtime scan found no `@google-cloud/storage` imports, `storage.googleapis.com` URL generation, or `makePublic()` calls; the remaining GCS URL text is in a test fixture and example documentation. GCP Terraform and legacy environment examples still describe the source platform and are not part of the AWS runtime.

## Stable reference and delivery rules

1. Never persist a presigned URL. The current private helper stores a stable app URL with the `s3://` reference embedded in its query. A canonical S3 reference is more portable if the public app hostname changes.
2. Keep buckets private with S3 Block Public Access and task-role authorization. Do not set public ACLs. Current production Terraform defines block-public-access, encryption, versioning, TLS-only transport, and API task-role permissions.
3. Resolve private references only after tenant authorization. The current private route validates object class and tenant key prefix, then redirects to a five-minute presigned S3 GET. The public logo route accepts only the `logos/<tenantId>/` prefix and image MIME types.
4. The current logo route is app-mediated; no CloudFront distribution or signing key is configured in this low-cost stack. Add a CDN only if measured traffic or delivery needs justify its recurring cost.
5. Preserve content type, metadata, and tenant/object-class partitioning. The production Terraform currently configures lifecycle transitions and permanent expiration for object classes. Confirm retention, legal hold, and tenant-delete requirements before applying those expiry rules.

## Migration and compatibility

- GCP inventory showed zero bytes in the five application buckets at the time of the check, but persisted production database references and customer-facing URLs have not been reconciled. Bucket totals alone do not prove that there are no live references or stale URLs.
- Inventory `TenantBranding.logoUrl` / `logoDarkUrl`, `Tenant.branding` JSON, `Proposal.pdfUrl`, `DeliveryBundle.zipUrl`, finding evidence, and `EvidenceSnapshot.rawResponse` for GCS URLs/references. Return aggregate counts by class/host; do not export tenant contents. Check source object existence and classify the large Cloud Build source bucket separately.
- Copy any required live objects to S3 with checksums and content metadata, then rewrite the corresponding database references to S3-backed app URLs or canonical S3 references. Preserve GCS read access only through the approved rollback window.
- The adapter is in source but not deployed to AWS production. Qualify tenant authorization and public-logo behavior in synthetic staging before production, and keep delivery bundles disabled until their acceptance/state-aware download flow is complete.
- At GCP retirement, remove GCS variables, SDK dependencies, host allowlists, and Terraform only after every database reference and rollback need is resolved.

## Implementation gates

- The production S3 bucket and access-log bucket exist only in the production Terraform scaffold. Do not run writes or cut over until the final database export and code artifact are ready.
- The approved proposal boundary in `lib/proposal/publicAccess.ts` must remain in front of any public proposal evidence. The private object route is tenant-scoped but does not replace proposal-publication authorization.
- The production S3 lifecycle rules permanently expire proposal objects after 365 days, screenshots after 365 days, audit snapshots after 180 days, outreach assets after 270 days, and logs after 90 days. Confirm these retention periods before applying the stack.
- GCP billing account `015856-D2CE86-262B61` remains linked to project `proposal-487522`. Production GCS object/reference reconciliation and the final database export remain outstanding; no production S3 bucket, restore, or object migration has been performed.
- The two exact production source archives are now downloaded and MD5-verified. Their build-context reconciliation, candidate commits, and unresolved source differences are recorded in [production source provenance](production-source-provenance-2026-10-03.md). Only those two objects were copied; the wider approximately 17.9 GB build bucket was not copied.
- The archives include `.env`-named entries. Their values were not printed, imported into the repository, or copied to AWS. The root `.dockerignore` at both candidate build commits excludes `.env*` from Docker build context, but the files remain in the private GCS build-source archives. Do not transfer those entries to AWS; assess and rotate any real credentials separately.
- AWS staging resources are live in `us-east-2`; AWS production remains undeployed. The production root uses the scoped `proposalos-migration` profile and a separate state key. No production object data has been written.

## Reviewed source surfaces

- `app/api/upload/route.ts`
- `lib/evidence/screenshotCapture.ts`
- `lib/evidence/screenshotOrchestrator.ts`
- `lib/modules/vision.ts`
- `lib/audit/findingPersistence.ts`
- `app/api/audit/[id]/route.ts`
- `lib/proposal/publicAccess.ts`
- `lib/storage.ts`
- `lib/pdf/uploadPdf.ts`
- `lib/delivery/bundler.ts`
- `app/api/delivery/[proposalId]/bundle/route.ts`
- `prisma/schema.prisma`
