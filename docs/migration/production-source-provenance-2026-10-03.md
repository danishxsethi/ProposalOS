# ProposalOS production source provenance

**Checked:** 2026-10-03
**GCP project:** `proposal-487522`
**GCP build-source bucket:** `proposal-487522_cloudbuild` (Standard, US multi-region, private)

## Source objects

| Production component | Build ID                               | Deployed image digest                                                     | GCS object                                                      |            Size | Last updated            | GCS MD5                    |
| -------------------- | -------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------- | --------------: | ----------------------- | -------------------------- |
| API and workers      | `79881a05-60cf-4492-a2cc-0a6c8978f7fa` | `sha256:cf9e6fc62574040285ef52962bfc57ba6cd3a110d180e47ab64705b13cad3b74` | `source/1780250457.54033-eb42d3b2d77f45f3ac5874d97959b249.tgz`  | 2,735,457 bytes | 2026-05-31 18:01:01 UTC | `TW18KnLpR/XBG3x6/wvs+Q==` |
| Frontend             | `a697afdf-c211-4245-8f49-301d5f0d40ec` | `sha256:c23b988cbd09c051da34423decdfd1a04b95cf712858902c0ab5dd9047fa9903` | `source/1788509938.136523-a722d6cad4c9442ba74ad5de28377e54.tgz` | 5,011,611 bytes | 2026-09-04 08:19:01 UTC | `7p2q9+vfausfB6PWIYdOng==` |

Both downloaded files matched the GCS-reported size and MD5. They were copied to a task-specific temporary directory for analysis, not into this repository. The active Cloud SDK identity was `danish@bridgecitysystems.ca`; all object commands explicitly specified `--project=proposal-487522` because the local default project is `dealpilot-staging-20260927`.

## API and worker source comparison

The closest Git reference is `c0bb56d890b0c59cff42feaa45530bd24126c945` (2026-05-31). Across the 799 selected safe API source/build-context paths, 792 match and seven differ. No archive-only source/build-context paths were found.

The seven differences are:

- `lib/stripe/stripe.ts`
- `prisma/migrations/20260228_make_tenant_required/migration.sql`
- `prisma/migrations/20260315_add_tenant_id_to_unscoped_models/migration.sql`
- `prisma/migrations/20260321_add_composite_indexes/migration.sql`
- `prisma/migrations/20260429093000_enable_rls/migration.sql`
- `prisma/migrations/20260501014500_rls_bypass_policies/migration.sql`
- `prisma/migrations/20260530221647_add_grace_period_fields_to_tenant/migration.sql`

The archived versions of these seven files all match the versions present together at Git commit `adbb1b56f863b9685cacfd4c98d7cd0842b0e9a6`; this is file-history evidence, not proof that the full build context came from that commit. The live `proposal_engine` export contains 32 completed Prisma migration records. Its checksums for all six differing SQL migration files match the versions at candidate commit `c0bb56d890b0c59cff42feaa45530bd24126c945`, and the database contains `checkout_attempts`. The database therefore supports the candidate migration files rather than the older SQL files in the build archive. The remaining Stripe difference is behaviorally relevant: the archived helper always rejects placeholder credentials, while the candidate rejects them only in live billing mode. Cloud Build still recorded no Git revision, so the exact deployed runtime source is not proven.

The source object timestamp predates this candidate commit by about 11 hours. Cloud Build recorded no Git source revision. Treat this commit as the nearest reproducible base, not a proven exact source revision. The archived `lib/stripe/stripe.ts` was re-read directly from this GCS source archive on October 4: it rejects placeholder Stripe credentials in every billing mode. The current candidate was aligned to that exact helper behavior by making the same source change. This resolves the known Stripe helper difference, but does not prove the full production image maps to one exact Git revision.

## Frontend source comparison

The closest Git reference is `d02626580e0163e002319375864ffcd05e59fea6` (2026-09-04). The relevant root Dockerfile build context is `claraud-web/`, `packages/shared/`, `prisma/`, and the root Cloud Build/Docker configuration. All 224 common safe files in that context match the commit; there are no content differences. The archive has one additional generated file, `claraud-web/next-env.d.ts`; the repository has two additional ignore files (`.gcloudignore` and `.gitignore`). The full archive also contains 243 `lib/audit-engine/` files outside this Dockerfile's COPY inputs.

The archive timestamp is about 16 minutes earlier than the candidate commit timestamp. This is strong build-context evidence, but Cloud Build still did not record the Git revision.

## Environment-file handling

Both GCS source archives contain `.env`-named entries, including `.env.local`. Their values were not printed or imported into the repository/AWS. The candidate root `.dockerignore` rules exclude `.env*` from the Docker build context, but that did not prevent these entries from being stored in the private Cloud Build source objects. Do not copy them to AWS. Confirm whether any contain active credentials and rotate those values as appropriate.

## Remaining provenance gates

- Map the production image digest to a reproducible source revision; Cloud Build recorded no Git revision. The six SQL migration discrepancies are resolved by the live database checksums, and the known Stripe helper difference is now aligned, but neither proves which exact source tree built the runtime image.
- Reconcile the frontend archive against the candidate branch and confirm which non-build-context files are intentionally irrelevant.
- Record image-to-repository mapping in the deployment pipeline before any AWS cutover.
- No Cloud SQL restore/start, AWS database import, or application deployment has been performed. Initial point-in-time SQL exports are staged in private S3; see [database-export-staging-2026-10-03.md](database-export-staging-2026-10-03.md).

## Sanitized AWS app build candidate (2026-10-04)

- Created `build-artifacts/proposalos-production-source.zip` from the current worktree for the AWS API and web image build contexts. SHA-256: `e59b28c8baef609d45ea4f32bc45b646f0c7974a003632442a8747dd2969856d`. The ZIP is 2,607,948 bytes and contains 1,115 source files plus an embedded per-file hash manifest.
- The source tree is based on Git commit `c3a5202f997e70bd9aa7bbc628aff65236864d9b`, but the worktree is dirty; the embedded manifest records each included file's path, size, and SHA-256. This identifies the exact candidate archive without claiming the migration changes belong to a clean Git commit or prove the source of the deployed GCP image.
- `scripts/migration/package-aws-build-context.py` creates the archive while excluding local artifacts and sensitive paths. The root `.dockerignore` was also tightened to omit proposal PDFs, audit outputs, Terraform state, local credentials, Postman collections, and developer-only configuration from Docker contexts. The delivery API route under `app/api/.../artifacts` remains included.
- Archive inspection confirmed the Bedrock provider, S3 routes, Prisma schema, web Dockerfile, and API Dockerfile are present; it found no PDF, Terraform state, environment file, Postman collection, or Pgbouncer userlist. The ZIP integrity check passed. Local Docker is unavailable; the later remote CodeBuild result is recorded below.
- At this checkpoint the archive was local. Later, under the user's explicit AWS root-profile authorization, the sanitized source was uploaded through the private staging build key and built in CodeBuild; no production infrastructure, database import, DNS cutover, or billing setting was changed.

## Production database importer safeguards (2026-10-04)

- The production Terraform root previously built the shared staging importer, which accepted the point-in-time key `proposal_engine.sql`. Split production into `Dockerfile.importer.production` and `scripts/migration/import-production-export.sh`; the staging importer and staging Terraform root are unchanged.
- The production importer now requires a unique key matching `final/proposal_engine-YYYYMMDDTHHMMSSZ.sql`, matching S3 ETag and byte size, AWS account `410432886960`, region `us-east-2`, the `proposalos-production-db` endpoint, an empty `proposal_engine` database, and the production `DATABASE_URL` secret ARN. The Terraform key variable has no stale snapshot default and validates the final-key pattern.
- It restores first, checks public-table and Prisma migration metadata, creates a non-superuser application role, grants DML/sequence access, and writes the production database URL secret last. It does not run automatically; production importer task execution remains a separate cutover action.
- Added `enable_production_app_services=false`; production API and web ECS desired counts remain zero until the import, Prisma migrations, and private qualification are complete. The `$179/month` steady-state model assumes one task per service after enablement.
- Created `build-artifacts/proposalos-production-importer-context.zip` with only the production Dockerfile and guarded loader (plus a hash manifest). SHA-256: `4648ec4cee91bd2918212e7a1a22641de9365a9bf48107a33fc4bbba88f69960`; 3,710 bytes. Both local ZIP integrity checks passed. Neither archive was uploaded, and Docker is unavailable for an image build.
- A read-only S3 lifecycle check confirmed the migration export bucket expires all objects after seven days. The existing `proposal_engine.sql` object is still a point-in-time snapshot and must not be used by the production importer.

## Node 24 app image candidate build (2026-10-04)

- The first remote build emitted an `EBADENGINE` warning: `puppeteer-core@25.12.0` requires Node `>=22.12.0`, while the app Dockerfiles used Node 20. Puppeteer is used by screenshot, accessibility, and PDF paths, so both app Dockerfiles now use `node:24-alpine`. Node 24 is the maintained LTS line selected for the build.
- Repackaged the sanitized context at `build-artifacts/proposalos-production-source.zip`: 2,607,945 bytes, SHA-256 `209336d6e3034adc028a746ebdb7838bd5caf7bfe617454c05b01f05c7dc75b7`. It contains 1,115 source files plus a per-file hash manifest; base Git commit is `c3a5202f997e70bd9aa7bbc628aff65236864d9b`, and the worktree remains dirty.
- CodeBuild `proposalos-staging-app-build:cd6c8d88-2c85-4ae4-a12f-401deb304ab1` completed successfully in 4m53s. Candidate tag `candidate-209336d6` was pushed to staging ECR only: API digest `sha256:51e3148e7573f814d076c5efc59448c63825caba411e30460f504774a17cd33f`; web digest `sha256:ae680b8510dfbf282137e1bfc184db8bdf6bdee958532508092bcf58341634bd`. ECR scans completed with zero findings for both images. The earlier Node 20 candidate tags were deleted after this build.
- At build completion, the staging services were still on `staging-bedrock-738f217b4adc` (API revision 9, web revision 8). The original staging source object was restored as the latest version at `logs/app-build/source-context.zip` (2,773,821 bytes, ETag `32f803472498b576244e5e4c0350dfed`) after CodeBuild completed source download. The uploaded candidate remains a noncurrent version under the bucket's 90-day `logs/` lifecycle.
- No production image was pushed, no production Terraform was applied, and no database import or DNS cutover occurred.

## Staging candidate deployment and HA-preserving production review (2026-10-04)

- Applied the staging Terraform image-tag change for `candidate-209336d6`. The apply replaced API/web task definitions and updated the CodeBuild project tag; it made no production changes. API revision 10 and web revision 9 now run the Node 24 candidate.
- Both staging ECS services reached `COMPLETED` rollout at desired/running 1/1 with zero failed tasks. Both ALB target groups report healthy; `https://aws-stage.claraud.com/` and `/api/health/live` returned HTTP 200.
- Production Terraform defaults RDS to Multi-AZ to preserve the regional HA in the migration brief. A refreshed, read-only plan against the absent production state reports 111 adds, 0 changes, 0 destroys and `multi_az = true`. It was not applied.
- The prior $179/month Single-AZ production estimate becomes a rough $232/month Multi-AZ estimate; the previous $318 padded overlap estimate becomes roughly $371, and the prior $269 itemized floor becomes roughly $323. These rough numbers double the RDS allowance only; confirm actual instance, standby storage, and I/O rates in AWS Pricing Calculator. The account-wide $300 alert is not a cap.
- GCP production remains live and billing-enabled. No final export/import, production service deployment, DNS cutover, or GCP shutdown has occurred.

## Bedrock-only source build and staging rollout (2026-10-04)

- The final staging candidate bundle is SHA-256 `3876ed2b21a7906d2c5eb086d417404fd60803ec61af62ebebadb4d083792166`, 2,598,215 bytes, and contains 1,111 source files plus its per-file manifest. It is based on Git `c3a5202f997e70bd9aa7bbc628aff65236864d9b` with a dirty worktree; the archive digest identifies the built source precisely without claiming a clean commit.
- CodeBuild `proposalos-staging-app-build:13ec255f-cb51-4393-8d72-7cb524cf5384` succeeded. Immutable staging tag `candidate-3876ed2b` points to API `sha256:c30cce165d393e281239b64cb6418575c8d3f2a1a4fa6b5d65190f82d32dd275` and web `sha256:eb886f4c472a78bb90af2ccedf48b8848118260dc5aeb081849cb0d0f1560742`; both ECR scans completed with no reported findings.
- Applied only the staging app image rollout. API revision 12 and web revision 11 are 1/1 with completed ECS rollouts and zero failed tasks; both ALB targets are healthy, and the staging homepage plus `/api/health/live` return HTTP 200.
- Runtime model adapters, model configuration, resilience policy, and active cost accounting use Bedrock Nova only. Google Places/PageSpeed/OAuth remain separate integrations. GCP production remains live; no production AWS apply, database import, DNS cutover, or GCP billing change occurred.

## Production runtime parity checkpoint (2026-10-04)

- The active GCP production `DATABASE_URL` was parsed locally without displaying credentials and resolves to `proposal_engine`. This confirms the populated database identified by the metadata-only export review; its October 3 dump remains a stale point-in-time snapshot.
- The GCP API runs Stripe in live mode. AWS production task definitions now include the current live-mode flag, publishable-key input, Starter price/product IDs, sender email, and default tenant ID. The production CodeBuild project passes the publishable key into both Next.js image builds.
- The required nonsecret runtime values were captured from GCP service configuration in ignored local `infra/aws/proposalos-production/production.auto.tfvars.json`; no production GCP secret payload or tenant rows were copied. AWS-only `WORKER_SECRET` must be generated independently because the current GCP worker references a staging secret.
- The refreshed source archive SHA-256 is `4e7d2232ae7208be363c052d6d0af1c768d8c0c4b129e055ef948aa32014f50c`, 2,598,270 bytes, with 1,111 source files plus manifest. It has not been uploaded or built in production ECR. `terraform validate` succeeds; the refreshed production plan is 110 adds, 0 changes, and 0 destroys. No production resources or DNS were changed.
