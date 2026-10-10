# ProposalOS AWS acceptance ledger

**Evidence snapshot:** 2026-10-10 00:25 UTC — updated 2026-10-10 06:05 UTC (local joined journey; no AWS/GCP changes)
**Latest completed CI source:** PR #6 report-only head d9e9eed8abfce5b432657536aee5f30921ab64aa; code/test head 627fe1db61643cb86d8f8cc7c2db22164095c47e
**Execution branch:** `execution/glm53-core-journey-20261009` (local joined-journey qualification; not deployed anywhere)
**Source verdict:** CLEAN_SOURCE_RC_PUBLISHED
**Runtime acceptance:** BLOCKED
**No AWS or GCP changes were made for this update.**

## Last verified runtime readback

The previous read-only inventory in us-east-2 found production ECS API and web services at desired/running 1/1. This session did not repeat the live infrastructure read.

| Runtime | Previously observed identity                                                                                  | Provenance                                    |
| ------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| API     | ECR tag production-20261006-1; digest sha256:1065d5f2ec153b20f22c5410ee30a6c2d7a1f813a15d4541fb244b9ddf29a5f9 | DEPLOY_COMMIT and task-definition tags absent |
| Web     | ECR tag production-20261006-1; digest sha256:4ece21bead608148a7a5a3e6e8f136ef883d175144bb79dc476a14f8fb405a65 | DEPLOY_COMMIT and task-definition tags absent |

Those images cannot be attributed to a reviewed Git SHA. They were not replaced. The existing RDS, Redis, and five-minute audit-sweep scheduler were observed active in the prior inventory; cost, scheduler behavior, tenant isolation, and restore were not qualified. No live runtime verification was done against PR #6.

## GitHub OIDC and release path

The Terraform source in infra/aws/proposalos-production/github-actions.tf restricts the audience to sts.amazonaws.com and expects the transferred repository subject:

repo:Danish-Sethi@324834111/ProposalOS@1158247398:ref:refs/heads/main

The prior read-only AWS IAM readback showed the deployed production role still trusted the two old-owner subjects. Source and deployed trust therefore differ. No IAM update was applied. The production workflow is workflow_dispatch-only, requires main and explicit production confirmation, and was not run.

Promotion still requires owner-reviewed IAM trust correction, normal CI on the exact release SHA, a SHA-labelled build with immutable ECR digests, explicit deployment approval, post-deploy digest/health verification, and a tested rollback path. PR #6 is a draft review branch and has not been deployed.

## CI at this source snapshot

GitHub run 38008270296 on report-only head d9e9eed8abfce5b432657536aee5f30921ab64aa (code/test changes from 627fe1db61643cb86d8f8cc7c2db22164095c47e):

- Claraud web build: PASS, job 114082033466.
- Typecheck, root lint, Prisma schema validation, disposable Postgres/PgBouncer startup with authenticated app_user preflight, and empty-database migration replay: PASS, job 114082033379.
- Deterministic suite: PASS, 278 test files and 2,847 tests passed, including the disposable RLS and queue tests; job 114082033379.
- Full dependency advisory policy: FAIL, job 114082033211. Production tree had 0 HIGH/CRITICAL; full tree had 12 HIGH, 2 moderate, and 1 low findings, concentrated in GHSA-vfj7-8cjw-p6xm and GHSA-c475-qrg2-pj4r. No exception or threshold reduction was applied.
- Gitleaks push run 38008265022 and PR run 38008270263: PASS.

## Acceptance ledger

| Gate                           | State   | Remaining evidence                                                                                            |
| ------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------- |
| Candidate source publication   | PASS    | Draft PR #6; not merged                                                                                       |
| Required CI                    | BLOCKED | Test, migration, RLS, Claraud build, and Gitleaks pass; full dependency advisory policy remains red           |
| Clean-SHA image provenance     | BLOCKED | Build and immutable ECR digest from reviewed approved SHA                                                     |
| DB parity and tenant isolation | BLOCKED | Disposable migration/RLS/queue tests pass; production DB parity and private/signed S3 paths remain unverified |
| Signed/private S3 delivery     | BLOCKED | Authenticated test-tenant read/write verification                                                             |
| Browser and outbound egress    | BLOCKED | Chromium interception, DNS rebinding, redirect/private/metadata blocking, bounded egress                      |
| Worker/scheduler authority     | BLOCKED | Safe read-only task behavior review, ownership/idempotency evidence, schedule approval                        |
| Bedrock quality                | BLOCKED | Authorized evidence-backed audit cohort, human QA, latency and cost                                           |
| Rollback and recovery          | PARTIAL | Backups observed; restore and rollback not exercised                                                          |
| GCP retirement                 | BLOCKED | Recovery window and dependent services not requalified                                                        |

The prior GCP readback found billing disabled and zero Cloud Build triggers for project proposal-487522. Neither was changed, and GCP was not retired. Three already-public proposal-share tokens remain UNKNOWN / OWNER_ACTION_REQUIRED; GitHub alert #11 remains unresolved. Those issues require separate owner action before pilot acceptance.

The CI-only PgBouncer correction is qualified by runs 38006971578 and 38008270296: authenticated app_user readiness and all disposable database/RLS tests passed. This did not query or mutate production or AWS databases. Overall CI remains blocked by the separate dependency policy.

## Owner-controlled steps before promotion

1. Resolve the full-tree dependency policy with a compatible fix or an exact, explicitly approved, review-dated exception.
2. Close historical token and Google-key exposure decisions using the canonical revocation/credential process; do not test exposed URLs.
3. Review and apply the minimal main-only OIDC trust correction; then conduct a no-deploy, redacted OIDC verification.
4. Accept required CI on the exact reviewed SHA and approve a production release separately.
5. Verify runtime digest, source SHA, data/storage/tenant behavior, schedule authority, and rollback before treating AWS as accepted.
6. Keep GCP recovery available until the agreed rollback window closes; do not retire it as part of this source task.

---

## Append — local runtime qualification relevant to AWS acceptance (2026-10-10, execution branch, no cloud mutations)

1. **Joined product journey verified locally** (`CONTROLLED_JOINED_JOURNEY_VERIFIED`): real server + real worker + RLS-enforced `app_user` database role + real SSRF-validated collection + real proposal delivery (secure view + PDF). This closes the largest unknown in "Worker/scheduler authority" and "DB parity" pre-work: the application actually completes audit-to-proposal under the tenant/RLS model on a migrated database.

2. **Two RLS-transition defects with direct production impact were found and fixed** on the execution branch:
   - `pe_live_*` API-key auth fails under the RLS-enforced role (auth resolution now runs under explicit `runWithTenantBypass`). Any AWS deployment that moves the app connection to the RLS-enforced role would have broken all API-key traffic.
   - Public proposal token delivery was structurally impossible (fingerprint/binding verifier hashed a different finding set than the compiler). This would have blocked every customer-facing proposal link in production.

3. **Implication for the promotion path:** before any AWS image built from this branch family is promoted, re-run required CI on the exact SHA (the full-tree dependency policy remains red and still blocks acceptance), then exercise the same runtime checks against the AWS environment: authenticated private S3 delivery, browser egress isolation, worker/scheduler ownership, and Bedrock quality (still BLOCKED pending authorization). No AWS or GCP change, deployment, or credential use occurred in this work; production still serves the October 6 images without clean-SHA provenance.

---

## Append 2 — Wave 2 (2026-10-10): OIDC trust verified against GitHub's documented format; deployment-policy regression fixed; M2 authorization blocker recorded

### The Wave-1 Terraform change was wrong on both counts — now fixed

Independent review (and this session's verification against GitHub's current OIDC reference) confirmed:

1. **The trust subject was correct before my Wave-1 change.** GitHub documents the immutable subject format for repositories created/transferred after 2026-07-15 as `repo:OWNER@OWNER-ID/REPO@REPO-ID:ref:refs/heads/BRANCH`, and states "Repository renames and transfers after July 15, 2026 also move to the immutable subject format." The transferred repository's subject is exactly `repo:Danish-Sethi@324834111/ProposalOS@1158247398:ref:refs/heads/main`. The Wave-1 claim that this shape "is never issued" was incorrect; the added `repository_id` condition keys do not compensate for a mismatched `sub`.
2. **The full `aws_iam_role_policy.github_actions_production_deploy` resource was accidentally deleted** by the full-file rewrite (scoped ECR publish, ECS deploy, RDS metadata, logs, task/execution-role PassRole).

**Resolution:** `github-actions.tf` restored **byte-identical to the reviewed PR #6 version** (SHA-256 `f2736d19…`); `terraform fmt -check` and `terraform validate` both pass. New regression suite `tests/security/oidc-trust-policy.test.ts` enforces: exact immutable subject, `sts.amazonaws.com` audience, StringEquals (no wildcards/StringLike), main-branch restriction, deployment-policy presence with least-privilege anchors, no wildcard resources beyond the AWS-required ECR authorization token, and a content-hash tripwire so ANY future change to this file fails tests until consciously reviewed. A PR comment records the correction. No Terraform applied; live IAM untouched.

### Live IAM readback — still blocked

Both audit profiles remain unable to read IAM (`iam:GetRole` on `ProposalOSGitHubActionsProductionDeploy` and `iam:GetOpenIDConnectProvider` are denied), so the live trust still cannot be re-verified from this VM. Minimal read grants required (owner action): the two actions above on the named role/provider. ECS readback this wave re-confirmed production still runs the October 6 images (`production-20261006-1`) with no SHA provenance — unchanged, untouched.

### M2 (real Bedrock inference) authorization blocker

Verified empirically: the only active audit identity is denied `bedrock:ListFoundationModels`; the VM's `AWS_BEARER_TOKEN_BEDROCK` is a Toolkit-scope bearer token that cannot sign SigV4 Converse requests; the only identity holding `bedrock:InvokeModel`/`InvokeModelWithResponseStream` scoped to the approved Nova models (`amazon.nova-micro-v1:0`, `amazon.nova-2-lite-v1:0`, us-east-1/2/west-2) is the production ECS task role, unreachable from this VM. **Required owner action:** a nonproduction identity with least-privilege invoke on those two models in us-east-2, exposed to the VM, with an approved experimental spend ceiling (suggested USD $5; enforced fail-closed by the new application-side `LLM_BUDGET_MAX_CENTS` ceiling). The harness real-inference mode is implemented and preflight-verified; one command executes M2 once granted.
