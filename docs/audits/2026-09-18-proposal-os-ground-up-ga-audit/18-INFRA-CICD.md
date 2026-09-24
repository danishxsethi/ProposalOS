# Infrastructure / CI/CD

## Observed

- Docker multi-stage image uses Node 20 Alpine, Prisma generate, Next standalone output, Chromium, non-root runtime, port 8080.
- Cloud Build validates env, builds/pushes commit and mutable latest tags, deploys Cloud Run, and has a staging smoke step in source.
- Terraform declares Cloud Run, Cloud SQL, GCS, VPC, Cloud Armor, secrets, DNS, jobs, and monitoring.
- GitHub workflows include CI/test and secret scan files.

## Gaps

- Current GCP account cannot refresh non-interactively; no image digest, registry, service revision, traffic, IAM, secret versions, or applied Terraform state was observed.
- Local `deploy.sh` can build/push/deploy outside a reviewed CI provenance chain.
- `npm run typecheck` is documented but absent; lint fails massively.
- Build succeeds but emits local auth URL, Redis disabled, LangSmith disabled, and middleware deprecation warnings.
- Migration deployment/rollback/smoke and immutable artifact attestation were not proven.

**State:** `DEPLOYED_NOT_VERIFIED`.
