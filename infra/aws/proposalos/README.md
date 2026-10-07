# ProposalOS staging infrastructure (AWS)

This is a separate AWS Terraform root with a separate S3 state key from the GCP Terraform state. It provisions the low-footprint staging foundation only: a dedicated two-AZ VPC, public subnets for future internet-facing ECS tasks, private RDS and Redis subnets, an S3 gateway endpoint, private encrypted storage with GCS-aligned lifecycle windows, PostgreSQL 15, TLS Redis, ECR, and an ECS cluster. It creates no public application endpoint and does not change GCP.

The staging DB is single-AZ and protected from deletion. Production must use its own state and an explicitly Multi-AZ RDS configuration, retaining the existing Cloud SQL HA posture.

Run from this directory after the bootstrap S3 backend and `proposalos-migration` AWS profile are ready:

```powershell
terraform init
terraform fmt -check
terraform validate
terraform plan
```

The state stores a randomly generated staging Redis AUTH token. The state bucket is versioned, encrypted, TLS-only, and public-access-blocked; only the scoped ProposalOS provisioning role has state-object access. The importer task role can read only the checksum-pinned `proposal_engine.sql` object and write only the staging `DATABASE_URL`; its execution role can fetch only the staging RDS master secret. The one-shot import creates a non-superuser `app_user` with RLS enforced, restores the SQL, grants application DML access, and stores the generated connection URL in Secrets Manager without logging it. The S3 gateway endpoint also permits the single regional ECR layer bucket required for container image pulls.

No ALB or staging web URL is created until its access restriction and TLS route are established. The importer task has no inbound rules and can reach only HTTPS services plus PostgreSQL; production data remains in a private RDS instance.
