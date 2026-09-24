# System Inventory

## Repository shape

- 1,473 tracked files at freeze.
- `app/`: 249 files; Next.js App Router UI and API routes.
- `lib/`: 553 files; audit modules, graph logic, pipeline, auth, providers, persistence, telemetry.
- `prisma/`: schema plus 26 migration directories/files, including RLS migrations.
- `tests/`: 71 tracked test-area files plus extensive colocated tests.
- `terraform/`: Cloud Run, Cloud SQL, GCS, networking, IAM/secrets, DNS, jobs, and monitoring declarations.
- `claraud-web/`: separate frontend/application surface with its own package lock and provider code; canonical production relationship not proven.
- `packages/shared/`: shared audit manifest/runtime contracts.

## Services and execution surfaces

| Surface | Source evidence | Truth status |
| --- | --- | --- |
| Next.js web/API | `app/`, `components/`, `middleware.ts` | IMPLEMENTED |
| Audit API | `/api/audit`, `/api/v1/audit`, public/client/batch variants | IMPLEMENTED_NOT_INTEGRATED |
| Audit queue | `lib/queue/auditJobQueue.ts`, `auditJobWorker.ts`, worker route | IMPLEMENTED_NOT_INTEGRATED |
| Audit runner | `lib/audit/runner.ts`, 27 registry entries | IMPLEMENTED |
| Diagnosis | `lib/graph/diagnosis-graph.ts` | IMPLEMENTED_NOT_INTEGRATED |
| Proposal | `lib/graph/proposal-graph.ts`, proposal routes/runner | IMPLEMENTED_NOT_INTEGRATED |
| Outreach | Resend/Zoho/provider and multiple pipeline paths | PARTIALLY_IMPLEMENTED |
| Billing | Stripe routes/webhook/reconciliation | PARTIALLY_IMPLEMENTED |
| Fulfillment | delivery graph/engine/task models | MOCKED / EXTERNAL_GATE |
| Retention | graph plus cron routes | PARTIALLY_IMPLEMENTED |
| Learning | pipeline learning/flywheel/prompt promotion | PARTIALLY_IMPLEMENTED |
| Temporal | No dependency or worker source | NOT_IMPLEMENTED |
| LangSmith | `lib/tracing.ts`, package dependency | DEPLOYED_NOT_VERIFIED; local disabled |
| n8n | No verified production workflow boundary found | NOT_EVIDENCED |
| Dify | No verified production integration found | NOT_EVIDENCED |

## API inventory

There are 146 source route files under `app/api/**/route.ts` at freeze, including audit, admin, analytics, billing, client/public/token proposal, cron, outreach, pipeline, tenant, upload, widget, and worker surfaces. The full source route list is in `route-inventory.csv`; route-by-route live verification was not possible.
