# =============================================================================
# Terraform Outputs
# =============================================================================
# Centralized outputs for all provisioned resources
# =============================================================================

# -----------------------------------------------------------------------------
# Project Configuration
# -----------------------------------------------------------------------------

output "project_id" {
  description = "GCP Project ID"
  value       = var.project_id
}

output "region" {
  description = "GCP Region"
  value       = var.region
}

output "environment" {
  description = "Environment name"
  value       = var.environment
}

# -----------------------------------------------------------------------------
# Cloud Run Services
# -----------------------------------------------------------------------------

output "api_service_url" {
  description = "Cloud Run API service URL"
  value       = google_cloud_run_v2_service.api.uri
}

output "frontend_service_url" {
  description = "Cloud Run frontend service URL"
  value       = google_cloud_run_v2_service.frontend.uri
}

output "audit_worker_url" {
  description = "Cloud Run audit worker service URL"
  value       = google_cloud_run_v2_service.audit_worker.uri
}

output "outreach_worker_url" {
  description = "Cloud Run outreach worker service URL"
  value       = google_cloud_run_v2_service.outreach_worker.uri
}

output "all_cloud_run_urls" {
  description = "All Cloud Run service URLs"
  value = {
    api              = google_cloud_run_v2_service.api.uri
    frontend         = google_cloud_run_v2_service.frontend.uri
    audit_worker     = google_cloud_run_v2_service.audit_worker.uri
    outreach_worker  = google_cloud_run_v2_service.outreach_worker.uri
  }
}

# -----------------------------------------------------------------------------
# Cloud SQL Database
# -----------------------------------------------------------------------------

output "database_instance_name" {
  description = "Cloud SQL instance name"
  value       = google_sql_database_instance.main.name
}

output "database_connection_name" {
  description = "Cloud SQL connection name"
  value       = google_sql_database_instance.main.connection_name
}

output "database_name" {
  description = "Database name"
  value       = google_sql_database.main.name
}

output "database_private_ip" {
  description = "Cloud SQL private IP address"
  value       = google_sql_database_instance.main.private_ip_address
  sensitive   = true
}

output "database_url_template" {
  description = "DATABASE_URL connection string template"
  value       = "postgresql://app_user:PASSWORD@/${google_sql_database.main.name}?host=/cloudsql/${google_sql_database_instance.main.connection_name}"
  sensitive   = true
}

# -----------------------------------------------------------------------------
# GCS Buckets
# -----------------------------------------------------------------------------

output "bucket_proposals" {
  description = "GCS bucket for proposal PDFs"
  value       = google_storage_bucket.proposals.name
}

output "bucket_audit_snapshots" {
  description = "GCS bucket for audit snapshots"
  value       = google_storage_bucket.audit_snapshots.name
}

output "bucket_outreach_assets" {
  description = "GCS bucket for outreach assets"
  value       = google_storage_bucket.outreach_assets.name
}

output "bucket_logs" {
  description = "GCS bucket for access logs"
  value       = google_storage_bucket.logs.name
}

output "bucket_terraform_state" {
  description = "GCS bucket for Terraform state"
  value       = google_storage_bucket.terraform_state.name
}

output "all_bucket_urls" {
  description = "All GCS bucket URLs"
  value = {
    proposals       = "gs://${google_storage_bucket.proposals.name}"
    audit_snapshots = "gs://${google_storage_bucket.audit_snapshots.name}"
    outreach_assets = "gs://${google_storage_bucket.outreach_assets.name}"
    logs            = "gs://${google_storage_bucket.logs.name}"
    terraform_state = "gs://${google_storage_bucket.terraform_state.name}"
  }
}

# -----------------------------------------------------------------------------
# VPC Network
# -----------------------------------------------------------------------------

output "vpc_name" {
  description = "VPC network name"
  value       = google_compute_network.main.name
}

output "vpc_self_link" {
  description = "VPC network self link"
  value       = google_compute_network.main.self_link
}

output "subnet_name" {
  description = "Subnet name"
  value       = google_compute_subnetwork.main.name
}

output "vpc_connector_id" {
  description = "Serverless VPC Access connector ID"
  value       = google_vpc_access_connector.cloud_run.id
}

# -----------------------------------------------------------------------------
# Service Accounts
# -----------------------------------------------------------------------------

output "api_service_account_email" {
  description = "Cloud Run API service account email"
  value       = google_service_account.cloud_run_api.email
}

output "frontend_service_account_email" {
  description = "Cloud Run frontend service account email"
  value       = google_service_account.cloud_run_frontend.email
}

# -----------------------------------------------------------------------------
# Secret Manager
# -----------------------------------------------------------------------------

output "secret_manager_required_secrets" {
  description = "List of required secrets"
  value       = local.required_secrets
}

output "secret_manager_optional_secrets" {
  description = "List of optional secrets"
  value       = local.optional_secrets
}

# -----------------------------------------------------------------------------
# Cloud Armor WAF
# -----------------------------------------------------------------------------

output "cloud_armor_policy_name" {
  description = "Cloud Armor security policy name"
  value       = google_compute_security_policy.main.name
}

output "cloud_armor_rules_count" {
  description = "Number of WAF rules"
  value       = length(google_compute_security_policy.main.rule) + 4  # +4 for additional rules
}

# -----------------------------------------------------------------------------
# Monitoring
# -----------------------------------------------------------------------------

output "uptime_check_api_url" {
  description = "API uptime check target URL"
  value       = trimprefix(google_cloud_run_v2_service.api.uri, "https://")
}

output "uptime_check_frontend_url" {
  description = "Frontend uptime check target URL"
  value       = trimprefix(google_cloud_run_v2_service.frontend.uri, "https://")
}

# -----------------------------------------------------------------------------
# Resource Summary (for billing/cost tracking)
# -----------------------------------------------------------------------------

output "resource_summary" {
  description = "Summary of all provisioned resources"
  value = {
    cloud_run_services = [
      google_cloud_run_v2_service.api.name,
      google_cloud_run_v2_service.frontend.name,
      google_cloud_run_v2_service.audit_worker.name,
      google_cloud_run_v2_service.outreach_worker.name,
    ]
    cloud_sql_instances = [google_sql_database_instance.main.name]
    gcs_buckets = [
      google_storage_bucket.proposals.name,
      google_storage_bucket.audit_snapshots.name,
      google_storage_bucket.outreach_assets.name,
      google_storage_bucket.logs.name,
      google_storage_bucket.terraform_state.name,
    ]
    vpc_networks = [google_compute_network.main.name]
    service_accounts = [
      google_service_account.cloud_run_api.email,
      google_service_account.cloud_run_frontend.email,
    ]
    secrets = length(local.required_secrets) + length(local.optional_secrets)
    waf_rules = length(google_compute_security_policy.main.rule) + 4
  }
}

# -----------------------------------------------------------------------------
# Cost Allocation Labels
# -----------------------------------------------------------------------------

output "cost_allocation_labels" {
  description = "Cost allocation labels applied to all resources"
  value       = var.cost_allocation_labels
}

# -----------------------------------------------------------------------------
# Deployment Instructions
# -----------------------------------------------------------------------------

output "deployment_instructions" {
  description = "Next steps for deployment"
  value = {
    "1_update_cloud_build" = "Update cloudbuild.yaml to use Artifact Registry: ${google_artifact_registry_repository.containers.id}"
    "2_set_environment_vars" = "Set Cloud Run environment variables using the outputs above"
    "3_configure_dns" = "Configure DNS records to point to Cloud Run URLs"
    "4_setup_email_domain" = "Configure SPF/DKIM/DMARC for email sending domain"
    "5_rotate_secrets" = "Rotate all generated secrets with production values"
    "6_enable_monitoring" = "Configure notification channels for monitoring alerts"
  }
}