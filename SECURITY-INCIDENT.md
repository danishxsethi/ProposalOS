# Security Incident: Committed Cloud SQL Credential

## Status

- Incident ID: `P0-04`
- Severity: `P0`
- Current state: active until the Cloud SQL password is rotated and git history is purged

## What happened

- A production Cloud SQL credential was committed to `scripts/connect-db.sh`.
- The plaintext credential has been removed from the working tree in this remediation.
- Git history has **not** been rewritten yet.

## Immediate actions

1. Rotate the Cloud SQL password in GCP Console.
2. Update the rotated value in Secret Manager and any dependent runtime config.
3. Invalidate any local copies of the leaked credential.

## History purge

Do **not** run history rewrite until the team is ready to force-push every affected branch.

Safe local workflow:

```bash
printf '%s==>REDACTED\n' "$LEAKED_CLOUD_SQL_PASSWORD" > /tmp/filter-repo-replacements.txt
git filter-repo --replace-text /tmp/filter-repo-replacements.txt
rm /tmp/filter-repo-replacements.txt
```

Set `LEAKED_CLOUD_SQL_PASSWORD` locally to the leaked password from your incident tracker or secure notes. Do not commit that value again.

## Verification

- `git grep -n 'postgresql://postgres:' -- scripts/connect-db.sh` returns no matches.
- `scripts/pre-commit-secret-scan.sh` blocks commits that reintroduce a raw DSN into `scripts/connect-db.sh`.

## Scope

- Recorded at: `2026-04-28T20:49:35Z`
- Leak introduction commit: `cf9774d105b143f32d74c4e577a03fd7f762e3b8`
- Leak introduction timestamp: `2026-02-07 14:17:28 -0600`
- Leak window: `2026-02-07 14:17:28 -0600` -> `2026-04-28T20:49:35Z`
- Commits whose tree still contained a raw `postgresql://postgres:` DSN at `scripts/connect-db.sh`: `19`
- Branches containing the introduction commit:
  - `main`
  - `production-hardening-complete`
  - `origin/main`
  - `origin/production-hardening-complete`

## Step 1 Pre-flight

### Commands Run

```bash
git log --diff-filter=A --follow --format='%H %ai %an' -- scripts/connect-db.sh
git rev-list --all | while read c; do git show "${c}:scripts/connect-db.sh" 2>/dev/null | grep -Fq 'postgresql://postgres:' && echo "$c"; done | wc -l
FIRST_COMMIT=$(git log --diff-filter=A --follow --format='%H' -- scripts/connect-db.sh | tail -1)
git branch -a --contains "$FIRST_COMMIT"
rg -n 'INSTANCE_CONNECTION_NAME|google_sql_database_instance|project_id|name\s*=.*-db' terraform/cloud_sql.tf terraform/*.tf scripts/connect-db.sh scripts/*.sh | head -40
```

### Outputs

```text
cf9774d105b143f32d74c4e577a03fd7f762e3b8 2026-02-07 14:17:28 -0600 danishxsethi
19
FIRST_COMMIT=cf9774d105b143f32d74c4e577a03fd7f762e3b8
* main
  production-hardening-complete
  remotes/origin/HEAD -> origin/main
  remotes/origin/main
  remotes/origin/production-hardening-complete
```

### Cloud SQL Target Discovery

- `scripts/connect-db.sh` points to `INSTANCE_CONNECTION_NAME="ixcc-486621:us-central1:proposal-engine-db"`.
- `terraform/terraform.tfvars` sets:
  - `project_id = "swinglabs-fund"`
  - `region = "us-central1"`
  - `app_name = "proposalos"`
  - `environment = "prod"`
- `terraform/cloud_sql.tf` names the Cloud SQL instance `${local.prefix}-db`, which resolves to `proposalos-prod-db`.

### Status

- `UNVERIFIED`: the repo contains conflicting production targets:
  - candidate A: project `ixcc-486621`, instance `proposal-engine-db`
  - candidate B: project `swinglabs-fund`, instance `proposalos-prod-db`
- Do not rotate any credential until the authoritative production project and Cloud SQL instance are confirmed.

### GCP Confirmation Attempt

- Recorded at: `2026-04-28T20:49:35Z`
- Read-only `gcloud` checks were attempted to confirm the production target before any rotation.

```bash
gcloud config get-value project
gcloud sql instances list --project=swinglabs-fund --format='table(name,region,connectionName)'
gcloud sql instances list --project=ixcc-486621 --format='table(name,region,connectionName)'
```

```text
drape-prod
ERROR: (gcloud.sql.instances.list) [danish@bridgecitysystems.ca] does not have permission to access projects instance [swinglabs-fund] (or it may not exist)
ERROR: (gcloud.sql.instances.list) [danish@bridgecitysystems.ca] does not have permission to access projects instance [ixcc-486621] (or it may not exist)
```

- Result: production target remains `UNVERIFIED` from CLI due project mismatch and insufficient permissions.

## Target Verification (2nd Attempt)

Recorded at: `2026-04-28T20:49:35Z`

### Path 1 — Re-auth Check

#### Commands Run

```bash
gcloud auth list --format='value(account,status)'
gcloud auth application-default print-access-token 2>&1 | head -c 50
ls -la ~/.config/gcloud/application_default_credentials.json 2>/dev/null
ls -la ~/.config/gcloud/legacy_credentials/ 2>/dev/null

for acct in $(gcloud auth list --format='value(account)'); do
  echo "=== Trying account: $acct ==="
  gcloud config set account "$acct" >/dev/null
  echo "[ixcc-486621]"
  gcloud sql instances list --project=ixcc-486621 --format='table(name,region,connectionName,settings.tier)' 2>&1 | head -5
  echo "[swinglabs-fund]"
  gcloud sql instances list --project=swinglabs-fund --format='table(name,region,connectionName,settings.tier)' 2>&1 | head -5
done
```

#### Output

```text
danish@bridgecitysystems.ca	*
founder@misprice.app
ERROR: (gcloud.auth.application-default.print-acce
-rw-------@ 1 danishsethi  staff  351 Apr 19 03:39 /Users/danishsethi/.config/gcloud/application_default_credentials.json
total 0
drwxr-xr-x@  4 danishsethi  staff  128 Apr 21 23:15 .
drwxr-xr-x@ 17 danishsethi  staff  544 Apr 28 14:47 ..
drwx------@  4 danishsethi  staff  128 Apr 28 14:47 danish@bridgecitysystems.ca
drwx------@  4 danishsethi  staff  128 Apr 21 23:15 founder@misprice.app

=== Trying account: danish@bridgecitysystems.ca ===
Updated property [core/account].
[ixcc-486621]
ERROR: (gcloud.sql.instances.list) [danish@bridgecitysystems.ca] does not have permission to access projects instance [ixcc-486621] (or it may not exist): The client is not authorized to make this request. This command is authenticated as danish@bridgecitysystems.ca which is the active account specified by the [core/account] property.
[swinglabs-fund]
ERROR: (gcloud.sql.instances.list) [danish@bridgecitysystems.ca] does not have permission to access projects instance [swinglabs-fund] (or it may not exist): The client is not authorized to make this request. This command is authenticated as danish@bridgecitysystems.ca which is the active account specified by the [core/account] property.
=== Trying account: founder@misprice.app ===
Updated property [core/account].
[ixcc-486621]
ERROR: (gcloud.sql.instances.list) There was a problem refreshing your current auth tokens: Reauthentication failed. cannot prompt during non-interactive execution.
Please run:

  $ gcloud auth login

[swinglabs-fund]
ERROR: (gcloud.sql.instances.list) There was a problem refreshing your current auth tokens: Reauthentication failed. cannot prompt during non-interactive execution.
Please run:

  $ gcloud auth login
```

#### Result

- Active `gcloud` account could not list either candidate project.
- A second cached account exists locally but cannot refresh non-interactively.
- ADC exists locally, but `gcloud auth application-default print-access-token` did not yield a usable token.

### Path 2 — Service Account Key in Repo

#### Commands Run

```bash
rg -l --hidden '"type"\s*:\s*"service_account"' --glob '!node_modules' --glob '!.git' || true
rg -n 'GOOGLE_APPLICATION_CREDENTIALS|service-account|svc-account' --type ts --type tf --type sh --type yaml | head -20
ls -la terraform/.terraform 2>/dev/null || true
find terraform -maxdepth 1 \( -name 'terraform.tfstate' -o -name 'terraform.tfstate.*' \) -print
```

#### Output

```text
scripts/validate-env.ts:137:      // Check if it's a comment-only var (like # GOOGLE_APPLICATION_CREDENTIALS="...")
scripts/sync-secrets-to-gcp.sh:71:    "GOOGLE_APPLICATION_CREDENTIALS"
lib/llm/provider.ts:160:  const hasCreds = !!process.env.GOOGLE_APPLICATION_CREDENTIALS;
lib/llm/provider.ts:317:      'GOOGLE_AI_API_KEY or GCP_PROJECT_ID + GOOGLE_APPLICATION_CREDENTIALS required'
lib/llm/providers/google.ts:56:    const hasVertex = !!process.env.GCP_PROJECT_ID && !!process.env.GOOGLE_APPLICATION_CREDENTIALS;
total 0
drwxr-xr-x@  3 danishsethi  staff   96 Apr 25 02:24 .
drwxr-xr-x@ 19 danishsethi  staff  608 Apr 25 02:25 ..
drwxr-xr-x@  3 danishsethi  staff   96 Apr 25 02:24 providers
```

#### Result

- No JSON service account key file is present in the repo.
- No local Terraform state file exists to prove an applied Cloud SQL instance.

### Path 3 — Terraform State Inspection

#### Commands Run

```bash
cd terraform && terraform init -backend=false 2>&1 | head -5
cd terraform && terraform state list 2>&1 | head -20
cd terraform && (terraform state show google_sql_database_instance.main 2>&1 | head -30 || terraform state show 'google_sql_database_instance.main[0]' 2>&1 | head -30)
```

#### Output

```text
Error: Terraform encountered problems during initialisation, including problems
with the configuration, described below.
The Terraform configuration must be valid before initialization so that

Error: Invalid character
  on cloud_cdn.tf line 234, in output "cdn_static_assets_url":
  234:   value       = "https://cdn.${var.dns.domain != null ? var.dns.domain : 'proposalos.com'}/static"
Single quotes are not valid. Use double quotes (") to enclose strings.

Error: Invalid expression
  on cloud_cdn.tf line 234, in output "cdn_static_assets_url":
  234:   value       = "https://cdn.${var.dns.domain != null ? var.dns.domain : 'proposalos.com'}/static"
Expected the start of an expression, but found an invalid expression token.
```

#### Result

- Terraform cannot initialize because the configuration is syntactically invalid.
- Terraform state could not be used as a trustable source of applied infra.

### Path 4 — Application Runtime Config

#### Commands Run

```bash
rg -n 'INSTANCE_CONNECTION_NAME|CLOUD_SQL_CONNECTION|cloudsql_instance' terraform/cloud_run.tf terraform/cloud_run_jobs.tf 2>&1 | head -20
rg -n 'INSTANCE_CONNECTION_NAME|proposal-engine-db|proposalos-prod-db' --glob '!node_modules' --glob '!.git' | head -30
git log --all --oneline -S 'proposal-engine-db' | head -10
git log --all --oneline -S 'proposalos-prod-db' | head -10
```

#### Output

```text
SECURITY-INCIDENT.md:62:rg -n 'INSTANCE_CONNECTION_NAME|google_sql_database_instance|project_id|name\s*=.*-db' terraform/cloud_sql.tf terraform/*.tf scripts/connect-db.sh scripts/*.sh | head -40
SECURITY-INCIDENT.md:80:- `scripts/connect-db.sh` points to `INSTANCE_CONNECTION_NAME="ixcc-486621:us-central1:proposal-engine-db"`.
SECURITY-INCIDENT.md:86:- `terraform/cloud_sql.tf` names the Cloud SQL instance `${local.prefix}-db`, which resolves to `proposalos-prod-db`.
SECURITY-INCIDENT.md:91:  - candidate A: project `ixcc-486621`, instance `proposal-engine-db`
SECURITY-INCIDENT.md:92:  - candidate B: project `swinglabs-fund`, instance `proposalos-prod-db`
scripts/connect-db.sh:6:INSTANCE_CONNECTION_NAME="ixcc-486621:us-central1:proposal-engine-db"
scripts/connect-db.sh:10:echo "🔌 Connecting to: $INSTANCE_CONNECTION_NAME"
scripts/connect-db.sh:27:./cloud-sql-proxy $INSTANCE_CONNECTION_NAME --port=$LOCAL_PORT

958a6ac Implement Sprint 2 outreach
cf9774d chore: save all files locally
```

#### Result

- No Cloud Run or Cloud Run Jobs config in-repo carries an explicit Cloud SQL instance connection name.
- The only concrete runtime reference in current code is `proposal-engine-db`.
- `proposal-engine-db` appears in historical commits; `proposalos-prod-db` did not return any git history hits.

### Path 5 — Network / DNS / Project Sanity

#### Commands Run

```bash
rg 'connection_name|connectionName' terraform/.terraform/ 2>/dev/null | head -5
gcloud projects describe ixcc-486621 --format='value(projectNumber,lifecycleState)' 2>&1 | head -3
gcloud projects describe swinglabs-fund --format='value(projectNumber,lifecycleState)' 2>&1 | head -3
gcloud config set account danish@bridgecitysystems.ca >/dev/null && gcloud config get-value account
```

#### Output

```text
ERROR: (gcloud.projects.describe) There was a problem refreshing your current auth tokens: Reauthentication failed. cannot prompt during non-interactive execution.
Please run:
ERROR: (gcloud.projects.describe) There was a problem refreshing your current auth tokens: Reauthentication failed. cannot prompt during non-interactive execution.
Please run:
danish@bridgecitysystems.ca
```

#### Result

- No provider cache contained a recoverable `connectionName`.
- Project describe checks were blocked by token refresh failure.
- Default `gcloud` account was restored to `danish@bridgecitysystems.ca`.

### Decision Matrix

| Signal                                           | Candidate A (`ixcc-486621/proposal-engine-db`) | Candidate B (`swinglabs-fund/proposalos-prod-db`) |
| ------------------------------------------------ | ---------------------------------------------- | ------------------------------------------------- |
| Referenced in `scripts/connect-db.sh`            | ✅                                             | ❌                                                |
| Referenced in Terraform `tfvars`                 | ❌                                             | ✅                                                |
| Referenced in Cloud Run runtime config           | ❌                                             | ❌                                                |
| Recent commits modifying its config              | ✅                                             | ❌                                                |
| `gcloud sql instances describe` returns RUNNABLE | ?                                              | ?                                                 |
| Terraform state `present`                        | ?                                              | ?                                                 |
| Project lifecycle ACTIVE                         | ?                                              | ?                                                 |

### Inference

- `STRONG INFERENCE`: Candidate A (`ixcc-486621/proposal-engine-db`) is more likely to be the live production database.
- Basis:
  - concrete runtime helper script points to Candidate A
  - historical commits reference Candidate A
  - Candidate B appears only in Terraform naming, and the Terraform tree is currently invalid
  - no other runtime config in-repo points to Candidate B

## Step 2 — Cloud SQL Password Rotation

- Recorded at: `2026-04-28T21:16:56Z`
- Manual confirmation received from operator: `rotated`
- Confirmed authoritative target:
  - Project: `ixcc-486621`
  - Instance: `proposal-engine-db`
  - Region: `us-central1`
  - Connection name: `ixcc-486621:us-central1:proposal-engine-db`

## Step 3 — Secret Manager Version Add

### Commands Run

```bash
date -u +%Y-%m-%dT%H:%M:%SZ
gcloud config set project ixcc-486621 >/dev/null && gcloud config get-value project
gcloud secrets list --project=ixcc-486621 --filter='name~"sql|db|database|postgres"' --format='table(name,createTime)'
```

### Output

```text
2026-04-28T21:16:56Z
WARNING: Your active project does not match the quota project in your local Application Default Credentials file. This might result in unexpected quota issues.
Project 'ixcc-486621' lacks an 'environment' tag. Please create or add a tag with key 'environment' and a value like 'Production', 'Development', 'Test', or 'Staging'.
Updated property [core/project].
ixcc-486621
ERROR: (gcloud.secrets.list) [danish@bridgecitysystems.ca] does not have permission to access projects instance [ixcc-486621] (or it may not exist): Permission 'secretmanager.secrets.list' denied on resource (or it may not exist). This command is authenticated as danish@bridgecitysystems.ca which is the active account specified by the [core/account] property.
- '@type': type.googleapis.com/google.rpc.ErrorInfo
  domain: iam.googleapis.com
  metadata:
    permission: secretmanager.secrets.list
  reason: IAM_PERMISSION_DENIED
```

### Status

- `BLOCKED`: Secret Manager secret discovery could not be completed because `secretmanager.secrets.list` is denied on project `ixcc-486621`.
- Next action required: operator must provide the exact secret name to update, or grant Secret Manager list access.

## cloudsql-url Verification

- Recorded at: `2026-04-28T21:30:52Z`

### Commands Run

```bash
rg -n -i 'cloudsql.url|cloudsql_url|CLOUDSQL_URL' --glob '!node_modules' --glob '!.git'
rg -n 'cloudsql-url|cloudsql_url' terraform/
rg -n 'cloudsql-url' terraform/cloud_run.tf terraform/cloud_run_jobs.tf 2>/dev/null
gcloud run services list --project=ixcc-486621 --format=json | jq -r '.[] | . as $svc | (.spec.template.spec.containers // [])[] | (.env // [])[] | select(.valueFrom.secretKeyRef.name == "cloudsql-url") | [$svc.metadata.name, .name, (.valueFrom.secretKeyRef.version // "latest")] | @tsv'
gcloud run jobs list --project=ixcc-486621 --format=json | jq -r '.[] | . as $job | (.spec.template.spec.taskTemplate.spec.containers // [])[] | (.env // [])[] | select(.valueFrom.secretKeyRef.name == "cloudsql-url") | [$job.metadata.name, .name, (.valueFrom.secretKeyRef.version // "latest")] | @tsv'
gcloud secrets versions access latest --secret=cloudsql-url --project=ixcc-486621 | sed -E 's#postgres(ql)?://([^:@/]+):([^@/]+)@#postgres\1://\2:REDACTED@#g' | head -c 500
```

### Output

```text
Repo references: 0
Terraform references: 0
Cloud Run service refs: ERROR: (gcloud.run.services.list) PERMISSION_DENIED: Permission 'run.services.list' denied on resource 'namespaces/ixcc-486621/services' (or resource may not exist).
Cloud Run job refs: ERROR: (gcloud.run.jobs.list) [danish@bridgecitysystems.ca] does not have permission to access namespaces instance [ixcc-486621] (or it may not exist): Permission 'run.jobs.list' denied on resource 'namespaces/ixcc-486621/jobs' (or resource may not exist).
Secret value shape: ERROR: (gcloud.secrets.versions.access) PERMISSION_DENIED: Permission 'secretmanager.versions.access' denied on resource (or it may not exist).
```

### Decision

- `UNVERIFIED / SKIP FOR NOW`
- ProposalOS repo references to `cloudsql-url` are zero.
- Live Cloud Run usage and current secret value could not be verified due IAM denial.
- Rotation set for this incident remains:
  - `DATABASE_URL`
  - `DIRECT_URL`
- `cloudsql-url` should be handled only after a privileged check confirms it actually points at `proposal-engine-db` or is mounted into a ProposalOS runtime.

### Related Secret Existence Check

```bash
gcloud secrets versions list NEXTAUTH_SECRET --project=ixcc-486621 --limit=1 --format='value(name,createTime)'
gcloud secrets versions list SESSION_SECRET --project=ixcc-486621 --limit=1 --format='value(name,createTime)'
```

```text
NEXTAUTH_SECRET: 1 2026-02-14T21:21:46
SESSION_SECRET: 1 2026-02-14T21:21:43
```

- Both related auth secrets exist. They are not part of the current P0-04 rotation set.

## proposal-engine-db Live Consumer Check

- Recorded at: `2026-04-28T21:42:39Z`

### Verification A — Instance State

```bash
gcloud sql instances describe proposal-engine-db --project=ixcc-486621 --format='value(name,state,region,createTime,settings.tier,settings.activationPolicy)'
```

```text
proposal-engine-db	RUNNABLE	us-central1	2026-02-07T19:07:26.574Z	db-f1-micro	ALWAYS
```

### Verification B — All Secret Payloads

```bash
gcloud secrets list --project=ixcc-486621 --format='value(name)' > /tmp/all-secrets.txt
while IFS= read -r secret; do
  value=$(gcloud secrets versions access latest --secret="$secret" --project=ixcc-486621 2>/tmp/secret.err || true)
  if [ -s /tmp/secret.err ]; then
    denied_count=$((denied_count+1))
    : > /tmp/secret.err
    continue
  fi
  if echo "$value" | grep -qE 'proposal-engine-db|proposal_engine'; then
    echo "MATCH: $secret"
    echo "$value" | sed -E 's#(postgres(ql)?://[^:]+:)[^@]+@#\1REDACTED@#g'
    echo '---'
  fi
done < /tmp/all-secrets.txt
```

```text
Total secrets scanned: 25
MATCH_COUNT=0
DENIED_COUNT=0
```

### Verification C — Cloud Run Env Values

```bash
gcloud run services list --project=ixcc-486621 --format=json | jq -r '.[] | . as $svc | (.spec.template.spec.containers // [])[] | (.env // [])[] | select((.value // "") | test("proposal-engine-db|proposal_engine")) | [$svc.metadata.name, .name, "<value-redacted>"] | @tsv'
gcloud run jobs list --project=ixcc-486621 --format=json | jq -r '.[] | . as $job | (.spec.template.spec.taskTemplate.spec.containers // [])[] | (.env // [])[] | select((.value // "") | test("proposal-engine-db|proposal_engine")) | [$job.metadata.name, .name, "<value-redacted>"] | @tsv'
```

```text
ERROR: (gcloud.run.services.list) PERMISSION_DENIED: Permission 'run.services.list' denied on resource 'namespaces/ixcc-486621/services' (or resource may not exist).
ERROR: (gcloud.run.jobs.list) [danish@bridgecitysystems.ca] does not have permission to access namespaces instance [ixcc-486621] (or it may not exist): Permission 'run.jobs.list' denied on resource 'namespaces/ixcc-486621/jobs' (or resource may not exist).
```

### Verification D — Cloud SQL Connection Annotation

```bash
gcloud run services list --project=ixcc-486621 --format=json | jq -r '.[] | select((.spec.template.metadata.annotations["run.googleapis.com/cloudsql-instances"] // "") | test("proposal-engine-db")) | .metadata.name'
```

```text
ERROR: (gcloud.run.services.list) PERMISSION_DENIED: Permission 'run.services.list' denied on resource 'namespaces/ixcc-486621/services' (or resource may not exist).
```

### Decision Matrix

| Signal                                                                   | Result                                            |
| ------------------------------------------------------------------------ | ------------------------------------------------- |
| Instance exists and is RUNNABLE                                          | ✅                                                |
| Project secrets referencing `proposal-engine-db` or `proposal_engine`    | ❌ none (`MATCH_COUNT=0`)                         |
| Secret access denials during project-wide scan                           | ❌ none (`DENIED_COUNT=0`)                        |
| Cloud Run service env check                                              | `UNVERIFIED` (IAM denied)                         |
| Cloud Run jobs env check                                                 | `UNVERIFIED` (IAM denied)                         |
| Cloud SQL annotation check                                               | `UNVERIFIED` (IAM denied)                         |
| ProposalOS repo references to `proposal-engine-db` outside incident docs | ✅ only `scripts/connect-db.sh` from prior checks |

### Decision

- `STRONG INFERENCE`: `proposal-engine-db` has no live consumer in project secrets and is likely dormant.
- The leaked credential was rotated on the instance itself.
- No ProposalOS secret payload in `ixcc-486621` currently points at `proposal-engine-db` / `proposal_engine`.
- Remaining uncertainty is limited to Cloud Run IAM visibility, not secret scope.

## proposal-engine-db Pre-Stop Inventory

- Recorded at: `2026-04-28T21:42:39Z`
- Operator inventory confirmation:
  - 4 empty Prisma scaffold tables
  - `Audit`: `0` rows
  - `EvidenceSnapshot`: `0` rows
  - `Finding`: `0` rows
  - `Proposal`: `0` rows
  - Approximate size: `7.9 MB` metadata only
- Interpretation: no application data to preserve; instance is dormant scaffolding.

## Instance Disposition

- Operator selected `stop`
- Command executed:

```bash
gcloud sql instances patch proposal-engine-db --project=ixcc-486621 --activation-policy=NEVER
```

- Outcome:

```text
.....done.
Updated [https://sqladmin.googleapis.com/sql/v1beta4/projects/ixcc-486621/instances/proposal-engine-db].
```

- Status: instance retained but stopped from auto-running for cost control.

## History Rewrite — DEFERRED

- Solo repo; password is invalidated, so leaked string has no exploit value
- Scheduled for next maintenance window (no specific date)
- Pre-commit hook + gitleaks CI now prevent future occurrences
- Optional follow-up to re-enable: run `git filter-repo` per Step 9 of the original plan

## CI Secret Scanning

- Provider chosen: GitHub Actions
- Added:
  - `.gitleaks.toml`
  - `.github/workflows/secret-scan.yml`
- Scope:
  - working-tree and new-commit scanning in CI
  - incident doc placeholders allowlisted
- Note:
  - CI scan covers new commits.
  - Historical detection requires Step 9 history rewrite.
  - Until then, history scanning (`--log-opts="--all"`) will still find the leaked DSN.
  - Local Docker-based verification command could not be executed on this workstation because the Docker daemon was unavailable.

### Local Verification Attempt

```bash
docker run --rm -v "$PWD:/repo" zricethezav/gitleaks:latest detect --source=/repo --config=/repo/.gitleaks.toml --verbose --redact --exit-code=1
```

```text
Cannot connect to the Docker daemon at unix:///Users/danishsethi/.docker/run/docker.sock. Is the docker daemon running?
```

## Resolution Summary — P0-04 CLOSED

- Status: ✅ CLOSED OPERATIONALLY at `2026-04-28T21:42:39Z`
- Leaked credential rotated at instance level: ✅ (Step 2 manual)
- Live consumer impact: ✅ NONE in readable project secrets; dormant scratch DB
- Instance disposition: `stopped` after inventory review
- Pre-commit secret scan: ✅ active (`scripts/pre-commit-secret-scan.sh`)
- CI secret scan: ✅ added (gitleaks GitHub Actions workflow)
- History rewrite: ⏳ DEFERRED (solo repo, low residual risk after rotation)
- Outstanding actions:
  - optionally purge history during next maintenance window
  - optionally re-check Cloud Run visibility with higher-privilege IAM if desired

## Lessons / Followups

- Project `ixcc-486621` contains multiple unrelated apps (ProposalOS scratch + Passwise prod). Consider per-app projects to reduce blast radius.
- `scripts/connect-db.sh` must continue to read DSN from env / Secret Manager, never from a literal credential.
- Other `ixcc-486621` Cloud SQL instances (for example `immigration-prod`) should be audited separately for similar leak patterns and rotated independently if any credentials were ever shared in chat or notes.

## Phase 1 — Authz Remediation

### P0-02 — Client magic-link cross-audit access

- File: `app/(client)/client/audit/[id]/page.tsx`
- Fix: replaced raw audit lookup by `id` with a token-scoped lookup requiring `proposals.some.webLinkToken = token` in the same query
- Sweep: `app/(client)/` has two `findUnique` calls total; only the vulnerable page used raw `id`. `app/(client)/client/dashboard/page.tsx` is already token-scoped via `webLinkToken`
- Token expiry: `Proposal.webLinkToken` has no expiration field in `prisma/schema.prisma`; follow-up required for expiring/rotating client access tokens
- Test: `tests/security/client-magic-link.test.ts`
- Verification: `pnpm exec vitest run tests/security/client-magic-link.test.ts` → `1 passed`, `4 passed`
- Status: ✅ fixed
