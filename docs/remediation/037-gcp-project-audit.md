# GCP Project Audit Report: ProposalOS Project Mixup Investigation

This document presents a comprehensive, read-only audit of GCP project configurations, codebase references, and live resource ownership for the **ProposalOS** platform. The purpose of this audit is to identify, document, and remediate any project mixup risks where configurations or systems point to incorrect projects (`inkless-app`, `blazecrawl-staging`, `ixcc-486621`, or `swinglabs-fund`) instead of the correct production project.

---

## 1. Active CLI / Auth Context Verification

### Summary Matrix

| Property                  | Value                                                               |                     Status                     | Finding / Action Required                                                                                            |
| :------------------------ | :------------------------------------------------------------------ | :--------------------------------------------: | :------------------------------------------------------------------------------------------------------------------- |
| **Active gcloud Account** | `danish@bridgecitysystems.ca`                                       |                    **PASS**                    | Valid developer identity.                                                                                            |
| **gcloud Core Project**   | `proposal-487522`                                                   |                    **PASS**                    | Default CLI target is correct.                                                                                       |
| **ADC Quota Project**     | `inkless-app`                                                       | <span style="color:red">**FAIL (FLAG)**</span> | **CRITICAL**: Quota project in application default credentials points to `inkless-app` instead of `proposal-487522`. |
| **Env Variables**         | `GOOGLE_CLOUD_PROJECT` / `GCLOUD_PROJECT` / `GCP_PROJECT` are unset |                    **PASS**                    | No active local environment overrides.                                                                               |

### Verbatim CLI Outputs

#### gcloud config list

```text
Project 'proposal-487522' lacks an 'environment' tag.
[compute]
region = us-central1
[core]
account = danish@bridgecitysystems.ca
disable_prompts = True
disable_usage_reporting = True
project = proposal-487522
[run]
region = europe-west1

Your active configuration is: [default]
```

#### gcloud config get-value project

```text
proposal-487522
```

#### gcloud auth list

```text
                    Credentialed Accounts
ACTIVE  ACCOUNT
        cursor-vertex-ai@dealpilot-ae.iam.gserviceaccount.com
*       danish@bridgecitysystems.ca
        founder@misprice.app
```

#### Application Default Credentials (ADC) File Check

```bash
cat ~/.config/gcloud/application_default_credentials.json 2>/dev/null | grep -E "quota_project_id|project"
```

Output:

```json
  "quota_project_id": "inkless-app",
```

> [!CAUTION]
> **ADC Quota Project Mixup**: The active Application Default Credentials (ADC) quota project is configured to `inkless-app`. This means local tools and SDK integrations (e.g., Prisma, custom TS scripts) that use default authentication will run operations or charge quotas against the incorrect GCP project if not explicitly overridden.

---

## 2. Codebase & Configuration Scan (Project References)

The codebase was scanned exhaustively to identify project ID references. Unrelated files, `node_modules`, `.next`, and `.git` directories were excluded to ensure high-fidelity results.

### Project References Audit Table

| File Path                                                                                                  |     Line     | Referenced Value                                                             |                     Status                     | Context & Description                                                                                                |
| :--------------------------------------------------------------------------------------------------------- | :----------: | :--------------------------------------------------------------------------- | :--------------------------------------------: | :------------------------------------------------------------------------------------------------------------------- |
| [`.env.local`](file:///Users/danishsethi/VSCODE/ProposalOS/.env.local)                                     |      10      | `postgresql://blazecrawl_staging:...@127.0.0.1:5433/proposal_engine_staging` |   <span style="color:orange">**FLAG**</span>   | Staging connection DSN. References the `blazecrawl_staging` user on a proxy connection.                              |
| [`.env.local`](file:///Users/danishsethi/VSCODE/ProposalOS/.env.local)                                     | 14, 106, 107 | `https://proposal-engine-staging-ouitkhk5xq-uc.a.run.app`                    |                    **PASS**                    | Verified Cloud Run staging endpoint mapping to `proposal-487522`.                                                    |
| [`claraud-web/README.md`](file:///Users/danishsethi/VSCODE/ProposalOS/claraud-web/README.md)               |  83, 86, 90  | `gcr.io/proposal-487522/claraud-web:latest`                                  |                    **PASS**                    | Correct production container registry destination.                                                                   |
| [`claraud-web/deploy.sh`](file:///Users/danishsethi/VSCODE/ProposalOS/claraud-web/deploy.sh)               |      23      | `PROJECT_ID="${PROJECT_ID:-proposal-487522}"`                                |                    **PASS**                    | Correct default fallback project for web deployment.                                                                 |
| [`claraud-web/setup-secrets.sh`](file:///Users/danishsethi/VSCODE/ProposalOS/claraud-web/setup-secrets.sh) |      21      | `PROJECT_ID="${PROJECT_ID:-proposal-487522}"`                                |                    **PASS**                    | Correct default fallback project for secret setup.                                                                   |
| [`scripts/final-audit.ts`](file:///Users/danishsethi/VSCODE/ProposalOS/scripts/final-audit.ts)             |      20      | `'proposal-487522'`                                                          |                    **PASS**                    | Hardcoded production default project ID for diagnostic reports.                                                      |
| [`scripts/migrate-cloud-sql.sh`](file:///Users/danishsethi/VSCODE/ProposalOS/scripts/migrate-cloud-sql.sh) |      13      | `PROJECT_ID="proposal-487522"`                                               |                    **PASS**                    | Correct target project for production migrations.                                                                    |
| [`scripts/setup-cloud-sql.sh`](file:///Users/danishsethi/VSCODE/ProposalOS/scripts/setup-cloud-sql.sh)     |      17      | `PROJECT_ID="${PROJECT_ID:-proposal-487522}"`                                |                    **PASS**                    | Correct default fallback project for Cloud SQL setup.                                                                |
| [`scripts/connect-db.sh`](file:///Users/danishsethi/VSCODE/ProposalOS/scripts/connect-db.sh)               |      6       | `INSTANCE_CONNECTION_NAME="ixcc-486621:us-central1:proposal-engine-db"`      | <span style="color:red">**FAIL (FLAG)**</span> | **HIGH RISK**: Hardcoded database instance proxy points to the legacy development project `ixcc-486621`.             |
| [`terraform/terraform.tfvars`](file:///Users/danishsethi/VSCODE/ProposalOS/terraform/terraform.tfvars)     |      2       | `# Project: swinglabs-fund`                                                  | <span style="color:red">**FAIL (FLAG)**</span> | **HIGH RISK**: Terraform documentation/header points to the wrong project.                                           |
| [`terraform/terraform.tfvars`](file:///Users/danishsethi/VSCODE/ProposalOS/terraform/terraform.tfvars)     |      4       | `project_id  = "swinglabs-fund"`                                             | <span style="color:red">**FAIL (FLAG)**</span> | **CRITICAL RISK**: Terraform will attempt to provision resources in the wrong project (`swinglabs-fund`) by default! |
| [`terraform/providers.tf`](file:///Users/danishsethi/VSCODE/ProposalOS/terraform/providers.tf)             |      39      | `bucket = "swinglabs-fund-terraform-state"`                                  | <span style="color:red">**FAIL (FLAG)**</span> | **CRITICAL RISK**: Terraform state storage is pointed at the incorrect project bucket.                               |
| [`docs/API_KEY_FIXES.md`](file:///Users/danishsethi/VSCODE/ProposalOS/docs/API_KEY_FIXES.md)               |    30, 34    | `652959865775` (Project Number for `ixcc-486621`)                            |   <span style="color:orange">**FLAG**</span>   | Documentation reference to legacy project API key properties.                                                        |

---

## 3. Live Resource Ownership Check

We explicitly audited the target project `proposal-487522` and compared it against the suspect projects (`inkless-app` and `blazecrawl-staging`) to identify where ProposalOS resources physically reside.

### 3.1 Correct Project: `proposal-487522`

- **Cloud Run Services**:
  - `claraud-web`: <span style="color:green">**Active**</span> (Production URL: `https://claraud-web-120416863832.us-central1.run.app`)
  - `proposal-engine`: <span style="color:green">**Active**</span> (Production URL: `https://proposal-engine-120416863832.us-central1.run.app`)
  - `proposal-engine-staging`: <span style="color:green">**Active**</span> (Staging URL: `https://proposal-engine-staging-120416863832.us-central1.run.app`)
- **Cloud SQL Instance**:
  - `proposal-db` (Production, Region: `us-central1`): Confirmed active via production Secret Manager metadata connection mapping (`proposal-487522:us-central1:proposal-db`).
- **Secret Manager Secrets**:
  - Contains **10 production secrets** (e.g., `DATABASE_URL`, `GOOGLE_AI_API_KEY`).
  - Contains **12 staging secrets** prefixed with `proposal-engine-staging-` (e.g., `proposal-engine-staging-database-url`).
- **Service Accounts**:
  - `120416863832-compute@developer.gserviceaccount.com` (Default Compute)
  - `ai-platform-sa@proposal-487522.iam.gserviceaccount.com` (AI Integration)
- **Redis / Cloud Tasks APIs**:
  - **Disabled**. No Redis instances or Cloud Tasks queues exist on this project.

### 3.2 Suspect Project: `inkless-app`

- **Cloud Run Services**:
  - `inkless-api-staging` (Unrelated)
  - `inkless-web-staging` (Unrelated)
  - **Verdict**: **No ProposalOS resources exist here**.
- **Cloud SQL Instance**:
  - `inkless-staging-db` (Unrelated Postgres 16 instance)
  - **Verdict**: **No ProposalOS databases exist here**.
- **Secret Manager Secrets**:
  - `STRIPE_SECRET_KEY`, `database-url`, `redis-url`, `SVIX_WEBHOOK_SECRET` (all unrelated to ProposalOS).
  - **Verdict**: **No ProposalOS secrets exist here**.

### 3.3 Suspect Project: `blazecrawl-staging`

- **Cloud Run Services**:
  - `blazecrawl-api-staging` (Unrelated crawler API)
  - `blazecrawl-crawl-worker-staging` (Unrelated crawler engine)
  - **Verdict**: **No ProposalOS-named services exist here**.
- **Cloud SQL Instances**:
  - `blazecrawl-postgres-staging` (Postgres 16, us-central1-c): <span style="color:orange">**ACTIVE USE**</span>.
  - `blazecrawl-postgres-staging-eu` (Postgres 16, europe-west4-c): (Unrelated)
  - `blazecrawl-postgres-staging-ap` (Postgres 16, asia-southeast1-c): (Unrelated)
  - **Verdict**: **The `blazecrawl-postgres-staging` instance is actively host to the ProposalOS staging database (`proposal_engine_staging`)**. This is an expected cross-project staging sandbox setup, but represents a dependency boundary.
- **Secret Manager Secrets**:
  - `blazecrawl-staging-database-url` (unrelated to ProposalOS).
  - **Verdict**: **No ProposalOS secrets exist here**.

---

## 4. Cross-Project Leak Analysis

### 4.1 Cloud SQL Connection Mixups

- **Production Connection String**:
  - Secret `DATABASE_URL` version 1 payload:
    `postgresql://postgres:REDACTED@localhost/proposal_engine?host=/cloudsql/proposal-487522:us-central1:proposal-db/`
  - **Verdict**: **PASS**. Fully isolated within `proposal-487522`.
- **Staging Connection String**:
  - Secret `proposal-engine-staging-database-url` payload:
    `postgresql://blazecrawl_staging:REDACTED@localhost/proposal_engine_staging?host=/cloudsql/blazecrawl-staging:us-central1:blazecrawl-postgres-staging/`
  - **Verdict**: **FLAG**. Cross-project dependency verified. The staging environment of ProposalOS in `proposal-487522` writes/reads data from a Postgres database hosted on `blazecrawl-staging`. This is a sandboxed staging setup as designed, but represents a dependency that must be documented.

### 4.2 Secret Manager Path Analysis

- Staging and production secrets are correctly provisioned in `proposal-487522` with namespaces properly separated by the `proposal-engine-staging-` prefix for staging.
- No project number leaks are active (verified that project number `120416863832` refers exclusively to the correct project `proposal-487522`).

### 4.3 Container Registries & Image Paths

- Checked `pkg.dev` and `gcr.io` paths.
- All dynamic scripts correctly inject `$PROJECT_ID`.
- `claraud-web/README.md` correctly references `gcr.io/proposal-487522/claraud-web`. No hardcoded references to other container registries exist.

---

## 5. Security & SRE Risk Assessment

### 5.1 Data-Residency & Cross-Tenant Exposure Risk

- **Production Data**: **SAFE**. Production environment connection pool configurations (`DATABASE_URL`) point exclusively to the SQL instance `proposal-db` on project `proposal-487522`. There is zero live production data-residency leak to any other project.
- **Staging Data**: **CROSS-PROJECT SHARED HOSTING**. Staging database operations utilize the `blazecrawl-staging` project resources. If another application on `blazecrawl-staging` gains superuser credentials to Cloud SQL, it could inspect or access ProposalOS staging records.

### 5.2 Operator Error & Configuration Overwrite Risk

- **Terraform Risk**: <span style="color:red">**EXTREMELY HIGH**</span>. Because `terraform.tfvars` defines `project_id = "swinglabs-fund"`, running any `terraform apply` commands locally will attempt to provision/modify resources on `swinglabs-fund`.
- **Local DB Proxy Connection Risk**: <span style="color:red">**HIGH**</span>. Running `./scripts/connect-db.sh` opens a local socket pointing directly to `ixcc-486621` instead of `proposal-487522`. Developers attempting to query production databases locally would be blocked by IAM (or connect to a legacy dev database).

---

## 6. Precise Remediation Plan

> [!IMPORTANT]
> This is a **READ-ONLY** audit. The following remediation plan is listed for **your explicit review and approval**. **No changes have been executed yet.**

### Phase 1: Local CLI & Authentication Environment Fixes

```bash
# 1. Re-authenticate Application Default Credentials to map the correct project quota context
gcloud auth application-default login --quota-project-id=proposal-487522
```

### Phase 2: Configuration & Code Fixes

#### 1. Fix Database Connection Proxy Script

Modify `scripts/connect-db.sh` line 6:

```diff
-INSTANCE_CONNECTION_NAME="ixcc-486621:us-central1:proposal-engine-db"
+INSTANCE_CONNECTION_NAME="proposal-487522:us-central1:proposal-db"
```

#### 2. Fix Terraform Target Project ID

Modify `terraform/terraform.tfvars` lines 2 and 4:

```diff
-# Project: swinglabs-fund
-project_id  = "swinglabs-fund"
+# Project: proposal-487522
+project_id  = "proposal-487522"
```

#### 3. Fix Terraform Backend State Storage Bucket

Modify `terraform/providers.tf` line 39:

```diff
-    bucket = "swinglabs-fund-terraform-state"
+    bucket = "proposal-487522-terraform-state"
```

---

## 7. Deployment Gating Recommendation

### GO / NO-GO Gating Status

| Deployment Target                          |                  Status                  | Rationale & Contingency                                                                                                                                                                                       |
| :----------------------------------------- | :--------------------------------------: | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **GCP Cloud Run Deploy (via gcloud CLI)**  | <span style="color:green">**GO**</span>  | **Safe to proceed**. Deployments specifying `--project=proposal-487522` explicitly (such as `scripts/canary-deploy.sh` or manual CLI commands) bypass active CLI project configurations and are 100% correct. |
| **Infrastructure Changes (via Terraform)** | <span style="color:red">**NO-GO**</span> | **BLOCKED**. Under no circumstances should `terraform apply` be run until Phase 2 modifications (fixing `project_id` and `bucket`) are fully merged and validated.                                            |

---

**Audited By**: Senior SRE/Security Engineer Agent (Antigravity)  
**Date**: May 31, 2026  
**Audit Context ID**: `6cb33a19-cc01-4ede-a15e-4c717df22512`
