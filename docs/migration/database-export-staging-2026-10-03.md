# ProposalOS database export staging

**Captured:** October 3, 2026 (UTC)
**Source project:** `proposal-487522`
**Source instance:** `proposal-db` (PostgreSQL 15, `us-central1`, regional HA, `db-custom-2-4096`, 50 GiB SSD)
**AWS destination:** account `410432886960`, `us-east-2`

## Source state and scope

The live Cloud SQL instance reported `RUNNABLE` with activation policy `ALWAYS` before and after export. It was not stopped or restored. The latest automated backup before export was the successful October 2 snapshot. The instance lists two application databases, `proposalos` and `proposal_engine`, plus the standard `postgres` database. The production services reference a Secret Manager entry named `DATABASE_URL`; its value was not read. Since the active application database could not be identified without that secret or a database query, both named application databases were exported. The `postgres` system database was not exported.

The exports are point-in-time SQL snapshots, not replication or final cutover sync. Production writes may have continued after capture. Only table names, aggregate `COPY` row counts, and Prisma migration metadata were parsed; no customer row values were displayed or assessed, and no schema was changed.

## Metadata-only database identification

The `proposal_engine` export contains 85 public tables, 151 data rows across its `COPY` blocks, and 32 completed Prisma migration records. Its latest recorded migration is `20260530221647_add_grace_period_fields_to_tenant`. The `checkout_attempts` table is present. `proposalos` contains 66 public tables but no copied data rows and no completed Prisma migration records. Given the instance's production labels and the populated migration history, `proposal_engine` is the strong production import candidate; the `DATABASE_URL` secret value remains unread, so this is not direct proof of the live application's selected database.

The stored Prisma checksums for the six SQL migration files that differ between the API archive and candidate commit `c0bb56d890b0c59cff42feaa45530bd24126c945` match the candidate files, not the archive files. This resolves which migration SQL variant is reflected in the production database. The Stripe runtime file difference and exact Cloud Build image-to-commit provenance remain unresolved.

## Export and transfer evidence

| Database          | GCP export operation                                                            |     GCS generation |            Size | MD5                                | SHA-256                                                            |
| ----------------- | ------------------------------------------------------------------------------- | -----------------: | --------------: | ---------------------------------- | ------------------------------------------------------------------ |
| `proposalos`      | `4241a25f-8d6b-49b8-b9a2-f84e00000032` (DONE, 2026-10-03 14:03:26–14:03:36 UTC) | `1791036207246225` |   121,724 bytes | `6b8e09504d985d6394af0f936ad3eec2` | `21aabcbbb8257f8994cb2b23b427fa9b78e94de9675884677fbb1bb112c4d966` |
| `proposal_engine` | `23ff764a-e3ab-431b-93d0-c35500000032` (DONE, 2026-10-03 14:03:46–14:03:57 UTC) | `1791036227501567` | 1,466,310 bytes | `b2b5e74b01b1ee783a6d17c9d939b016` | `fad46f3dcf14fe762f56d2ed8599d4690c5e19d6932f6bb19d5c4555f2b0653d` |

The GCS staging bucket `proposal-487522-migration-export-20261003` was in `us-central1`, used uniform bucket-level access and public access prevention, and had a three-day object-expiration rule. Cloud SQL received `roles/storage.objectAdmin` on that bucket only. After transfer verification, both GCS objects and the dedicated bucket (including its bucket-scoped IAM grant) were deleted.

The data streamed directly from GCS to `s3://proposalos-migration-410432886960-20261003/` using the non-root `dealpilot-sso` IAM Identity Center session. No database dump was written to the local filesystem. The S3 bucket is in `us-east-2`, has all four public-access-block settings enabled, Bucket Owner Enforced ownership, SSE-S3 (`AES256`) default encryption, and a seven-day object-expiration rule. Both S3 object sizes match the streamed byte counts, and each S3 ETag matches the computed MD5.

## Remaining gates

- Identify which application database and Prisma migration state match the production app before import; do not assume both need to become independent AWS databases.
- Do not import this customer-data snapshot into shared staging or use it for customer-data tests. At final cutover, import a fresh write-paused export only into the dedicated production RDS target while public ingress is disabled; validate schema and Prisma migration metadata plus approved aggregate counts without inspecting tenant row values.
- Preserve the source database and backup until final sync, acceptance, and the rollback window are complete.
- The GCP source database remains `RUNNABLE`/`ALWAYS`; its previously checked compute list rate is about `$0.2876/hour` (about `$210` per 730-hour month), before storage, backups, network, and other active GCP resources.
- The temporary AWS S3 objects expire after seven days unless imported or removed earlier. A live bucket lifecycle check on October 4 confirmed this rule is enabled for all prefixes. They are staging artifacts, not a durable backup. The production importer now rejects the existing `proposal_engine.sql` point-in-time key and requires a separately named final write-paused export under `final/`.
