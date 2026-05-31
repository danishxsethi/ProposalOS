# =============================================================================
# Cloud Run Jobs for Batch Processing
# =============================================================================
# Phase Y: Cost optimization through batch processing
# Cloud Run Jobs are 50% cheaper than regular Cloud Run for batch workloads
# 
# Use cases:
# - Batch audit processing
# - Scheduled report generation
# - Bulk outreach email generation
# - Data export/ETL jobs
# =============================================================================

# -----------------------------------------------------------------------------
# Batch Audit Processing Job
# -----------------------------------------------------------------------------

resource "google_cloud_run_v2_job" "batch_audit" {
  name     = "${local.prefix}-batch-audit-job"
  location = var.region
  project  = var.project_id

  # Labels
  labels = local.common_labels

  # Job configuration
  template {
    parallelism  = 10  # Process 10 audits in parallel
    
    template {
      max_retries  = 2
      timeout      = "3600s"  # 1 hour timeout for batch jobs
      service_account = google_service_account.cloud_run_api.email
      
      containers {
        image = "us-central1-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.containers.repository_id}/proposal-engine:latest"
        
        # Resource allocation (smaller than regular Cloud Run for cost savings)
        resources {
          limits = {
            cpu    = "1"
            memory = "1Gi"
          }
        }

        # Environment variables
        env {
          name  = "NODE_ENV"
          value = "production"
        }

        env {
          name  = "JOB_MODE"
          value = "batch_audit"
        }

        env {
          name  = "GCP_PROJECT_ID"
          value = var.project_id
        }

        env {
          name  = "GCP_REGION"
          value = var.region
        }

        # Secrets
        env {
          name = "DATABASE_URL"
          value_source {
            secret_key_ref {
              secret  = "DATABASE_URL"
              version = "latest"
            }
          }
        }

        env {
          name = "GOOGLE_AI_API_KEY"
          value_source {
            secret_key_ref {
              secret  = "GOOGLE_AI_API_KEY"
              version = "latest"
            }
          }
        }

        env {
          name = "GOOGLE_PAGESPEED_API_KEY"
          value_source {
            secret_key_ref {
              secret  = "GOOGLE_PAGESPEED_API_KEY"
              version = "latest"
            }
          }
        }

        env {
          name = "GOOGLE_PLACES_API_KEY"
          value_source {
            secret_key_ref {
              secret  = "GOOGLE_PLACES_API_KEY"
              version = "latest"
            }
          }
        }

        env {
          name = "SERP_API_KEY"
          value_source {
            secret_key_ref {
              secret  = "SERP_API_KEY"
              version = "latest"
            }
          }
        }
      }

      # VPC Access for database
      vpc_access {
        connector = google_vpc_access_connector.cloud_run.id
        egress    = "PRIVATE_RANGES_ONLY"
      }
    }
  }
}

# -----------------------------------------------------------------------------
# Outreach Email Generation Job
# -----------------------------------------------------------------------------

resource "google_cloud_run_v2_job" "batch_outreach" {
  name     = "${local.prefix}-batch-outreach-job"
  location = var.region
  project  = var.project_id

  labels = local.common_labels

  template {
    parallelism  = 20  # Process 20 emails in parallel
    
    template {
      max_retries  = 3
      timeout      = "1800s"  # 30 minutes
      service_account = google_service_account.cloud_run_api.email
      
      containers {
        image = "us-central1-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.containers.repository_id}/proposal-engine:latest"
        
        resources {
          limits = {
            cpu    = "1"
            memory = "512Mi"
          }
        }

        env {
          name  = "NODE_ENV"
          value = "production"
        }

        env {
          name  = "JOB_MODE"
          value = "batch_outreach"
        }

        env {
          name = "DATABASE_URL"
          value_source {
            secret_key_ref {
              secret  = "DATABASE_URL"
              version = "latest"
            }
          }
        }

        env {
          name = "RESEND_API_KEY"
          value_source {
            secret_key_ref {
              secret  = "RESEND_API_KEY"
              version = "latest"
            }
          }
        }

        env {
          name = "GOOGLE_AI_API_KEY"
          value_source {
            secret_key_ref {
              secret  = "GOOGLE_AI_API_KEY"
              version = "latest"
            }
          }
        }
      }

      vpc_access {
        connector = google_vpc_access_connector.cloud_run.id
        egress    = "PRIVATE_RANGES_ONLY"
      }
    }
  }
}

# -----------------------------------------------------------------------------
# Report Generation Job
# -----------------------------------------------------------------------------

resource "google_cloud_run_v2_job" "batch_reports" {
  name     = "${local.prefix}-batch-reports-job"
  location = var.region
  project  = var.project_id

  labels = local.common_labels

  template {
    parallelism  = 5  # PDF generation is resource intensive
    
    template {
      max_retries  = 2
      timeout      = "1800s"  # 30 minutes
      service_account = google_service_account.cloud_run_api.email
      
      containers {
        image = "us-central1-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.containers.repository_id}/proposal-engine:latest"
        
        resources {
          limits = {
            cpu    = "2"  # More CPU for PDF generation
            memory = "2Gi"
          }
        }

        env {
          name  = "NODE_ENV"
          value = "production"
        }

        env {
          name  = "JOB_MODE"
          value = "batch_reports"
        }

        env {
          name = "DATABASE_URL"
          value_source {
            secret_key_ref {
              secret  = "DATABASE_URL"
              version = "latest"
            }
          }
        }

        env {
          name = "GCS_BUCKET_NAME"
          value = google_storage_bucket.proposals.name
        }
      }

      vpc_access {
        connector = google_vpc_access_connector.cloud_run.id
        egress    = "PRIVATE_RANGES_ONLY"
      }
    }
  }
}

# -----------------------------------------------------------------------------
# Data Export/ETL Job
# -----------------------------------------------------------------------------

resource "google_cloud_run_v2_job" "batch_export" {
  name     = "${local.prefix}-batch-export-job"
  location = var.region
  project  = var.project_id

  labels = local.common_labels

  template {
    parallelism  = 5
    
    template {
      max_retries  = 3
      timeout      = "3600s"  # 1 hour for large exports
      service_account = google_service_account.cloud_run_api.email
      
      containers {
        image = "us-central1-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.containers.repository_id}/proposal-engine:latest"
        
        resources {
          limits = {
            cpu    = "2"
            memory = "4Gi"  # More memory for data processing
          }
        }

        env {
          name  = "NODE_ENV"
          value = "production"
        }

        env {
          name  = "JOB_MODE"
          value = "batch_export"
        }

        env {
          name = "DATABASE_URL"
          value_source {
            secret_key_ref {
              secret  = "DATABASE_URL"
              version = "latest"
            }
          }
        }

        env {
          name = "GCS_BUCKET_NAME"
          value = google_storage_bucket.audit_snapshots.name
        }
      }

      vpc_access {
        connector = google_vpc_access_connector.cloud_run.id
        egress    = "PRIVATE_RANGES_ONLY"
      }
    }
  }
}

# -----------------------------------------------------------------------------
# IAM: Allow Cloud Run Jobs to be invoked
# -----------------------------------------------------------------------------

resource "google_cloud_run_v2_job_iam_member" "batch_audit_invoker" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_job.batch_audit.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.cloud_run_api.email}"
}

resource "google_cloud_run_v2_job_iam_member" "batch_outreach_invoker" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_job.batch_outreach.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.cloud_run_api.email}"
}

resource "google_cloud_run_v2_job_iam_member" "batch_reports_invoker" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_job.batch_reports.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.cloud_run_api.email}"
}

resource "google_cloud_run_v2_job_iam_member" "batch_export_invoker" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_job.batch_export.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.cloud_run_api.email}"
}

# -----------------------------------------------------------------------------
# Outputs
# -----------------------------------------------------------------------------

output "cloud_run_jobs" {
  description = "Cloud Run Job names"
  value = {
    batch_audit   = google_cloud_run_v2_job.batch_audit.name
    batch_outreach = google_cloud_run_v2_job.batch_outreach.name
    batch_reports = google_cloud_run_v2_job.batch_reports.name
    batch_export  = google_cloud_run_v2_job.batch_export.name
  }
}

output "cloud_run_jobs_invocation" {
  description = "Example gcloud commands to invoke jobs"
  value = {
    batch_audit   = "gcloud run jobs execute ${google_cloud_run_v2_job.batch_audit.name} --region ${var.region} --project ${var.project_id}"
    batch_outreach = "gcloud run jobs execute ${google_cloud_run_v2_job.batch_outreach.name} --region ${var.region} --project ${var.project_id}"
    batch_reports = "gcloud run jobs execute ${google_cloud_run_v2_job.batch_reports.name} --region ${var.region} --project ${var.project_id}"
    batch_export  = "gcloud run jobs execute ${google_cloud_run_v2_job.batch_export.name} --region ${var.region} --project ${var.project_id}"
  }
}