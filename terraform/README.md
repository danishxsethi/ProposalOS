# ProposalOS Infrastructure (Terraform)

This directory contains the complete Infrastructure as Code (IaC) configuration for ProposalOS on Google Cloud Platform.

## Overview

### Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         GCP Project                                  │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                        VPC Network                           │    │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐ │    │
│  │  │  Cloud Run API  │  │ Cloud Run Web   │  │  Cloud SQL  │ │    │
│  │  │  (min: 1, max:50)│  │ (min: 1, max:20)│  │  (HA, SSL)  │ │    │
│  │  └────────┬────────┘  └────────┬────────┘  └──────┬──────┘ │    │
│  │           │                    │                   │        │    │
│  │  ┌────────┴────────────────────┴───────────────────┴────────┤    │
│  │  │              Serverless VPC Connector                     │    │
│  │  └───────────────────────────────────────────────────────────┘    │
│  │                                                                    │
│  │  ┌─────────────────────────────────────────────────────────┐     │
│  │  │              Cloud Armor WAF                            │     │
│  │  │  - DDoS Protection (Layer 7)                            │     │
│  │  │  - OWASP Core Rule Set                                  │     │
│  │  │  - Rate Limiting (1000 req/s)                           │     │
│  │  └─────────────────────────────────────────────────────────┘     │
│  │                                                                    │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐                 │
│  │  │  Secret    │  │   GCS      │  │  Cloud     │                 │
│  │  │  Manager   │  │  Buckets   │  │  Monitoring│                 │
│  │  └────────────┘  └────────────┘  └────────────┘                 │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

### Resources Provisioned

| Resource               | Count | Description                                              |
| ---------------------- | ----- | -------------------------------------------------------- |
| Cloud Run Services     | 4     | API, Frontend, Audit Worker, Outreach Worker             |
| Cloud SQL Instance     | 1     | PostgreSQL with HA, backups, private IP                  |
| GCS Buckets            | 5     | Proposals, Audit Snapshots, Outreach Assets, Logs, State |
| VPC Network            | 1     | Private network with subnets                             |
| Service Accounts       | 2     | API and Frontend service accounts                        |
| Secret Manager Secrets | 13    | All application secrets                                  |
| Cloud Armor Rules      | 15+   | WAF rules for security                                   |

## Prerequisites

1. **Terraform** >= 1.6.0
2. **gcloud CLI** installed and authenticated
3. **GCP Project** with billing enabled
4. **Required APIs** (will be enabled automatically):
   - Cloud Run API
   - Cloud SQL Admin API
   - Cloud Storage API
   - Secret Manager API
   - Compute Engine API
   - VPC Access API
   - Cloud Build API
   - Artifact Registry API

## Quick Start

### 1. Initialize Terraform

```bash
cd terraform/
terraform init
```

### 2. Configure Variables

Copy the example variables file and fill in your values:

```bash
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars` with your project details:

```hcl
project_id  = "your-gcp-project-id"
region      = "us-central1"
```

### 3. Plan and Apply

```bash
# Preview changes
terraform plan -out=tfplan

# Apply infrastructure
terraform apply tfplan
```

## Directory Structure

```
terraform/
├── providers.tf              # Provider configuration
├── variables.tf              # Variable definitions
├── main.tf                   # VPC, networking, service accounts
├── cloud_sql.tf              # Cloud SQL database configuration
├── gcs_buckets.tf            # GCS bucket configuration
├── cloud_run.tf              # Cloud Run services configuration
├── secret_manager.tf         # Secret Manager configuration
├── cloud_armor.tf            # Cloud Armor WAF configuration
├── outputs.tf                # Output values
├── terraform.tfvars.example  # Example variables (safe to commit)
├── terraform.tfvars          # Actual variables (DO NOT COMMIT)
└── README.md                 # This file
```

## State Management

### Remote State (Recommended)

For production, use GCS backend for state storage:

```bash
# Create state bucket
gsutil mb -p $PROJECT_ID gs://$PROJECT_ID-terraform-state

# Enable versioning
gsutil versioning set on gs://$PROJECT_ID-terraform-state

# Initialize with backend
terraform init -backend-config="bucket=$PROJECT_ID-terraform-state" \
               -backend-config="prefix=terraform/state"
```

## Outputs

After applying, Terraform will output important values:

```bash
terraform output
```

Key outputs:

- `api_service_url` - Cloud Run API URL
- `frontend_service_url` - Cloud Run Frontend URL
- `database_connection_name` - Cloud SQL connection name
- `all_bucket_urls` - All GCS bucket URLs
- `resource_summary` - Summary of all resources

## Updating Cloud Build

Update `cloudbuild.yaml` to use the new Artifact Registry:

```yaml
steps:
  - name: 'gcr.io/cloud-builders/docker'
    args:
      [
        'build',
        '-t',
        '${_REGION}-docker.pkg.dev/$PROJECT_ID/proposalos-containers/proposal-engine:${_COMMIT_SHA}',
        '.',
      ]
```

## Secret Rotation

Secrets are configured with 90-day rotation. To rotate manually:

```bash
# Rotate a specific secret
gcloud secrets versions add DATABASE_URL --data-file=- <<EOF
new-database-url
EOF

# Trigger Cloud Run redeploy to pick up new secret
gcloud run services update proposalos-api \
  --region=us-central1 \
  --update-secrets=DATABASE_URL=DATABASE_URL:latest
```

## Monitoring

### Uptime Checks

- API: `/api/health` endpoint
- Frontend: `/` endpoint

### Alerts Configured

| Alert               | Threshold       | Description             |
| ------------------- | --------------- | ----------------------- |
| Cloud SQL High CPU  | > 80% for 5 min | Database needs scaling  |
| Cloud SQL Low Disk  | < 20% remaining | Disk space running low  |
| API High Latency    | P95 > 2s        | Performance degradation |
| API High Error Rate | > 5% for 5 min  | Application errors      |
| WAF High Block Rate | > 100/min       | Potential attack        |
| DDoS Detection      | > 10000 req/min | Traffic spike           |

## Cost Estimation

| Resource                         | Monthly Cost (USD)  |
| -------------------------------- | ------------------- |
| Cloud Run API (min: 1)           | ~$50-100            |
| Cloud Run Frontend (min: 1)      | ~$30-60             |
| Cloud SQL (db-custom-2-4096, HA) | ~$150-200           |
| GCS Buckets (storage)            | ~$5-10              |
| Cloud Armor                      | ~$25-50             |
| Monitoring                       | ~$10-20             |
| **Total**                        | **~$270-440/month** |

## Disaster Recovery

### Backup Strategy

- **Cloud SQL**: Daily automated backups + PITR (7-day retention)
- **GCS**: Versioning enabled, lifecycle policies for archival
- **Terraform State**: Versioned in GCS

### Restore Procedures

1. **Database Restore**:

   ```bash
   gcloud sql instances clone proposalos-db proposalos-db-restore \
     --point-in-time 2024-03-15T14:30:00Z
   ```

2. **Infrastructure Restore**:
   ```bash
   terraform apply  # Re-apply to recreate resources
   ```

## Security

### Access Controls

- Service accounts follow principle of least privilege
- Secrets accessible only by Cloud Run API service account
- Private IP for Cloud SQL (no public exposure)
- Cloud Armor WAF blocks malicious traffic

### Compliance

- All resources tagged with cost allocation labels
- Audit logging enabled for all operations
- SSL/TLS enforced for all connections
- HSTS enabled for HTTPS

## Troubleshooting

### Common Issues

1. **Permission Denied**:

   ```bash
   gcloud auth application-default login
   ```

2. **API Not Enabled**:

   ```bash
   gcloud services enable SERVICE_NAME --project=$PROJECT_ID
   ```

3. **VPC Peering Failed**:
   - Ensure `servicenetworking.googleapis.com` is enabled
   - Check CIDR range doesn't overlap

### Getting Help

```bash
# View Terraform logs
export TF_LOG=DEBUG
terraform plan

# View Cloud Run logs
gcloud logging read "resource.type=cloud_run_revision" --limit=50
```

## Cleanup

To destroy all resources:

```bash
terraform destroy
```

**Warning**: This will delete all resources including the database. Ensure backups are taken first.

## Version History

| Version | Date       | Changes         |
| ------- | ---------- | --------------- |
| 1.0.0   | 2026-03-22 | Initial release |
