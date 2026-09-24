# Data / Persistence

The Prisma schema is large and includes Tenant, User, ApiKey, Audit, AuditJob, Finding, EvidenceSnapshot, Proposal, views/events, outreach, payment/project, pipeline, retention, learning, and audit-trail concepts. Migrations include tenant columns, composite indexes, check constraints, RLS enablement/bypass policies, queue lease fields, and lifecycle controls.

Observed limitations:

- `prisma validate` passes, but `prisma format --check` fails.
- Live migration state/schema drift was not observed.
- Runtime Finding score/type contracts disagree with Prisma integer/enum fields.
- Evidence raw JSON has no runtime provenance/redaction schema.
- Backup/restore is described by Terraform/docs but no isolated restore was demonstrated.
- Some source paths use global services or optional tenant parameters for learning/reconciliation; live RLS compatibility is unknown.

**State:** `WORKING_WITH_LIMITATIONS`.

**Closure:** replay migrations on empty and representative staging DB, compare live introspection to exact release schema, run two-tenant RLS/IDOR tests, prove PITR/object restore, and make evidence/finding writes transactional or explicitly state the durable failure.
