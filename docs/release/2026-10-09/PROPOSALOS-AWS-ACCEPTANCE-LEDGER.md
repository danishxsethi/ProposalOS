# ProposalOS AWS acceptance ledger

**Authoritative progress ledger — 2026-10-09**<br>
**Source under review:** `75f1c5dcf412b5b37339dd438fda9d5db809e7c3` (local branch `codex/final-ci-qualification`)<br>
**Current technical verdict:** `SOURCE_RC_BLOCKED`<br>
**Current commercial verdict:** `DEMO_NOT_READY`

## Live AWS readback

Read-only inventory in `us-east-2` confirms the existing production services are active: API service desired/running `1/1` on task definition `proposalos-production-api:3`; web service desired/running `1/1` on `proposalos-production-web:2`.

| Runtime | Current identity | Source provenance |
|---|---|---|
| API | ECR tag `production-20261006-1`, digest `sha256:1065d5f2ec153b20f22c5410ee30a6c2d7a1f813a15d4541fb244b9ddf29a5f9` | `DEPLOY_COMMIT` absent; task-definition tags absent |
| Web | ECR tag `production-20261006-1`, digest `sha256:4ece21bead608148a7a5a3e6e8f136ef883d175144bb79dc476a14f8fb405a65` | `DEPLOY_COMMIT` absent; task-definition tags absent |

The existing deployment cannot be attributed to a reviewed Git commit. The ECR digests above identify the currently referenced images only.

- RDS is available on PostgreSQL 15.19, private, encrypted, Multi-AZ, deletion-protected, with seven days of backups. A restore was not tested.
- Redis is available as `cache.t4g.micro`, with transit and at-rest encryption enabled. Tenant/queue runtime qualification was not performed.
- Scheduler `proposalos-production-audit-sweep` is **enabled** at `rate(5 minutes)` and targets the production ECS cluster using `ProposalOSProductionAuditSweepScheduler`. Its target input was deliberately not read; task behavior and spend were not validated.
- The two inspected CodeBuild projects use S3 source archives. This does not establish source provenance for the currently serving ECS images.
- Recurring AWS cost was not measured. Production compute, Multi-AZ RDS, Redis, and the five-minute scheduler remain live; this is not an idle or zero-cost posture.

## Source-to-production identity

The corrected Terraform source in `infra/aws/proposalos-production/github-actions.tf` allows only audience `sts.amazonaws.com` and subject `repo:Danish-Sethi@324834111/ProposalOS@1158247398:ref:refs/heads/main`. The repository API confirms owner ID `324834111` and repository ID `1158247398`. GitHub’s [OIDC documentation](https://docs.github.com/en/actions/reference/security/oidc) describes the immutable owner/repository subject form for transferred repositories.

The deployed role `ProposalOSGitHubActionsProductionDeploy` still trusts only the two old-owner subjects (`danishxsethi/ProposalOS` and `danishxsethi@92055628/ProposalOS@1158247398`), with the audience restriction intact. There is no wildcard subject. Source and deployed trust differ; the old owner identity remains in the live trust policy. No IAM policy was applied.

The production workflow is `workflow_dispatch` only. Its deploy job requires `refs/heads/main` and an explicit `confirm_production=true`; a feature-branch push or pull request cannot deploy. The workflow builds SHA-tagged images with the Git revision label, resolves immutable digests, migrates before service rollout, and verifies task digests and `/api/health` version. It has not run for this candidate. Its live IAM trust must be corrected by an owner-approved operation before any production promotion.

## GitHub and GCP controls

- Repository is public under `Danish-Sethi`; repo ID `1158247398`, organization ID `324834111`.
- GitHub Actions default workflow permissions are read-only. No branch protection, ruleset, or deployment environment was found; release approval governance is a gap.
- Test Suite runs for pull requests and uses Node 24, a dependency advisory gate, typecheck/lint, Prisma, Docker PostgreSQL/PgBouncer replay, deterministic tests, and a Claraud build.
- Exact candidate checks are absent because the source commit was not published. Existing PR #5 checks failed on October 8: Test Suite and Claraud build run `37811073144`; Gitleaks runs `37811046946` and `37811073142`.
- Google Cloud Build trigger inventory for project `proposal-487522` returned zero triggers. Project billing readback returned `false`. No GCP build was activated or disabled. GCP recovery resources and retirement state were not inventoried here.

## Source and runtime qualification

| Gate | Status | Evidence still required |
|---|---|---|
| Reviewed source SHA and CI | BLOCKED | Resolve unpublished token-shaped literals, publish clean review history, and pass checks on exact candidate SHA |
| Image provenance | BLOCKED | Build SHA and immutable digests from reviewed commit; prove runtime task definitions reference them |
| Database/RLS | BLOCKED | Disposable empty replay, schema drift, cross-tenant denial, transaction context, queue and recovery tests |
| S3/private delivery | BLOCKED | Verify signed/private read and write behavior with test tenant data |
| Browser/egress security | BLOCKED | Chromium interception, DNS rebinding/redirect/private-network controls, and egress boundary tests |
| Scheduler and worker authority | BLOCKED | Read-only target review without sensitive input, job ownership/idempotency evidence, explicit schedule approval |
| Bedrock proposal quality | BLOCKED | Real authorized audit cohort, grounded evidence, degraded behavior, human quality score, latency and cost |
| Rollback/recovery | PARTIAL | Backup configuration observed; restore, rollback, and GCP recovery window not exercised |

All six paid-pilot gates remain blocked: release/runtime/tenant integrity; unsafe public/outbound containment; a genuinely trustworthy proposal; agreement/payment; fulfillment/verification; repeatable proof in one vertical. The unsafe Claraud routes are closed in source but the serving release is older. Three historical share links remain unknown and GitHub alert #11 remains open.

## Promotion conditions

1. Resolve the local-history publication blocker without rewriting preserved history or exposing unverified bearer-like values.
2. Obtain green required CI on one exact reviewed SHA, including disposable database and security tests.
3. Owner-review and apply the exact main-only OIDC trust update; verify via a no-deploy OIDC test that does not print a JWT.
4. Review migrations and artifacts, record image digests, approve the manual production release, verify health and runtime SHA, and keep a tested rollback path.
5. Contain historical share links only after a super-admin dry run maps the fingerprints to the exact records and the owner separately approves revocation.
6. Requalify actual AWS runtime data parity, private storage, tenant isolation, schedule behavior, browser egress, and recovery before a paid pilot.

No AWS/GCP resource, IAM trust, database, schedule, production image, or customer record was changed in this session.
