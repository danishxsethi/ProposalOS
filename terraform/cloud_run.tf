# =============================================================================
# Cloud Run Services Configuration
# =============================================================================
# Production-optimized Cloud Run services with:
# - Optimized min/max instances
# - Concurrency settings
# - Cold start optimization
# - Always-on CPU for API
# - Health checks
# =============================================================================

# -----------------------------------------------------------------------------
# Artifact Registry for Container Images
# -----------------------------------------------------------------------------

resource "google_artifact_registry_repository" "containers" {
  location      = var.region
  repository_id = "${local.prefix}-containers"
  description   = "Container repository for ProposalOS"
  format        = "DOCKER"

  labels = local.common_labels
}

# -----------------------------------------------------------------------------
# Cloud Run API Service
# -----------------------------------------------------------------------------

resource "google_cloud_run_v2_service" "api" {
  name     = local.api_service_url
  location = var.region
  project  = var.project_id

  description = "ProposalOS API Service"

  # Labels
  labels = local.common_labels

  # Request configuration
  template {
    max_instance_request_concurrency = var.cloud_run_api.concurrency
    timeout                          = "${var.cloud_run_api.timeout_seconds}s"

    # Scaling configuration
    scaling {
      min_instance_count = var.cloud_run_api.min_instances  # 1 = always on, no cold starts
      max_instance_count = var.cloud_run_api.max_instances  # 50 = handle traffic spikes
    }

    # Container configuration
    containers {
      image = "us-central1-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.containers.repository_id}/proposal-engine:latest"
      ports {
        name           = "http1"
        container_port = var.cloud_run_api.container_port
      }

      # Resource limits
      resources {
        limits = {
          cpu    = var.cloud_run_api.cpu
          memory = var.cloud_run_api.memory
        }
      }

      # Environment variables
      env {
        name  = "NODE_ENV"
        value = "production"
      }

      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }

      env {
        name  = "GCP_REGION"
        value = var.region
      }

      env {
        name  = "GCS_BUCKET_NAME"
        value = google_storage_bucket.proposals.name
      }

      # Secrets from Secret Manager
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
        name = "API_KEY"
        value_source {
          secret_key_ref {
            secret  = "API_KEY"
            version = "latest"
          }
        }
      }

      env {
        name = "NEXTAUTH_SECRET"
        value_source {
          secret_key_ref {
            secret  = "NEXTAUTH_SECRET"
            version = "latest"
          }
        }
      }

      env {
        name = "STRIPE_SECRET_KEY"
        value_source {
          secret_key_ref {
            secret  = "STRIPE_SECRET_KEY"
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

      env {
        name  = "BASE_URL"
        value = "https://proposal-engine-120416863832.us-central1.run.app"
      }

      env {
        name  = "NEXTAUTH_URL"
        value = "https://proposal-engine-120416863832.us-central1.run.app"
      }

      env {
        name  = "NEXT_PUBLIC_APP_URL"
        value = "https://proposal-engine-120416863832.us-central1.run.app"
      }

      env {
        name  = "FROM_EMAIL"
        value = "noreply@proposalengine.app"
      }

      env {
        name = "CRON_SECRET"
        value_source {
          secret_key_ref {
            secret  = "CRON_SECRET"
            version = "latest"
          }
        }
      }

      env {
        name = "ADMIN_SECRET"
        value_source {
          secret_key_ref {
            secret  = "ADMIN_SECRET"
            version = "latest"
          }
        }
      }

      env {
        name = "STRIPE_WEBHOOK_SECRET"
        value_source {
          secret_key_ref {
            secret  = "STRIPE_WEBHOOK_SECRET"
            version = "latest"
          }
        }
      }

      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }
    }

    # Service account
    service_account = google_service_account.cloud_run_api.email

    # VPC connector for private egress
    vpc_access {
      connector = google_vpc_access_connector.cloud_run.id
      egress    = "PRIVATE_RANGES_ONLY"
    }

    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [google_sql_database_instance.main.connection_name]
      }
    }
  }

  # Traffic configuration
  traffic {
    percent = 100
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
  }

  # Binary authorization (optional, for enhanced security)
  # binary_authorization {
  #   use_default = false
  #   breakglass_justification = "Emergency deployment"
  # }

  depends_on = [
    google_project_service.required_apis,
    google_vpc_access_connector.cloud_run,
    google_service_networking_connection.private_vpc_connection
  ]
}

# -----------------------------------------------------------------------------
# Cloud Run Frontend Service
# -----------------------------------------------------------------------------

resource "google_cloud_run_v2_service" "frontend" {
  name     = local.frontend_service_url
  location = var.region
  project  = var.project_id

  description = "ProposalOS Frontend Service"

  labels = local.common_labels

  # Request configuration
  template {
    max_instance_request_concurrency = var.cloud_run_frontend.concurrency
    timeout                          = "${var.cloud_run_frontend.timeout_seconds}s"

    # Scaling configuration
    scaling {
      min_instance_count = var.cloud_run_frontend.min_instances
      max_instance_count = var.cloud_run_frontend.max_instances
    }

    containers {
      image = "us-central1-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.containers.repository_id}/claraud-web:latest"
      ports {
        name           = "http1"
        container_port = var.cloud_run_frontend.container_port
      }

      resources {
        limits = {
          cpu    = var.cloud_run_frontend.cpu
          memory = var.cloud_run_frontend.memory
        }
      }

      env {
        name  = "NODE_ENV"
        value = "production"
      }

      env {
        name  = "NEXT_PUBLIC_APP_URL"
        value = "https://${google_cloud_run_v2_service.api.uri}"
      }
    }

    service_account = google_service_account.cloud_run_frontend.email

    vpc_access {
      connector = google_vpc_access_connector.cloud_run.id
      egress    = "PRIVATE_RANGES_ONLY"
    }
  }

  traffic {
    percent = 100
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
  }

  depends_on = [
    google_project_service.required_apis,
    google_vpc_access_connector.cloud_run
  ]
}

# -----------------------------------------------------------------------------
# Cloud Run Worker Services (for background jobs)
# -----------------------------------------------------------------------------

# Audit Worker Service
resource "google_cloud_run_v2_service" "audit_worker" {
  name     = "${local.prefix}-audit-worker"
  location = var.region
  project  = var.project_id

  description = "ProposalOS Audit Processing Worker"
  labels      = local.common_labels

  template {
    max_instance_request_concurrency = 1  # Process one audit at a time
    timeout                          = "600s"  # 10 minute timeout for audits

    # Scaling configuration
    scaling {
      min_instance_count = 0  # Scale to zero when idle
      max_instance_count = 10
    }

    containers {
      image = "us-central1-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.containers.repository_id}/proposal-engine:latest"
      ports {
        name           = "http1"
        container_port = var.cloud_run_api.container_port
      }

      resources {
        limits = {
          cpu    = "2"  # More CPU for audit processing
          memory = "2Gi"
        }
      }

      env {
        name  = "NODE_ENV"
        value = "production"
      }

      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }

      env {
        name  = "GCP_REGION"
        value = var.region
      }

      env {
        name  = "GCS_BUCKET_NAME"
        value = google_storage_bucket.proposals.name
      }

      env {
        name  = "BASE_URL"
        value = "https://proposal-engine-120416863832.us-central1.run.app"
      }

      env {
        name  = "NEXTAUTH_URL"
        value = "https://proposal-engine-120416863832.us-central1.run.app"
      }

      env {
        name  = "NEXT_PUBLIC_APP_URL"
        value = "https://proposal-engine-120416863832.us-central1.run.app"
      }

      env {
        name  = "FROM_EMAIL"
        value = "noreply@proposalengine.app"
      }

      env {
        name  = "WORKER_MODE"
        value = "audit"
      }

      # Secrets from Secret Manager
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
        name = "API_KEY"
        value_source {
          secret_key_ref {
            secret  = "API_KEY"
            version = "latest"
          }
        }
      }

      env {
        name = "NEXTAUTH_SECRET"
        value_source {
          secret_key_ref {
            secret  = "NEXTAUTH_SECRET"
            version = "latest"
          }
        }
      }

      env {
        name = "STRIPE_SECRET_KEY"
        value_source {
          secret_key_ref {
            secret  = "STRIPE_SECRET_KEY"
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

      env {
        name = "CRON_SECRET"
        value_source {
          secret_key_ref {
            secret  = "CRON_SECRET"
            version = "latest"
          }
        }
      }

      env {
        name = "ADMIN_SECRET"
        value_source {
          secret_key_ref {
            secret  = "ADMIN_SECRET"
            version = "latest"
          }
        }
      }

      env {
        name = "STRIPE_WEBHOOK_SECRET"
        value_source {
          secret_key_ref {
            secret  = "STRIPE_WEBHOOK_SECRET"
            version = "latest"
          }
        }
      }

      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }
    }

    # VPC connector for private egress
    vpc_access {
      connector = google_vpc_access_connector.cloud_run.id
      egress    = "PRIVATE_RANGES_ONLY"
    }

    service_account = google_service_account.cloud_run_api.email

    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [google_sql_database_instance.main.connection_name]
      }
    }
  }

  traffic {
    percent = 100
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
  }

  depends_on = [google_project_service.required_apis]
}

# Cold Outreach Worker Service
resource "google_cloud_run_v2_service" "outreach_worker" {
  name     = "${local.prefix}-outreach-worker"
  location = var.region
  project  = var.project_id

  description = "ProposalOS Cold Outreach Worker"
  labels      = local.common_labels

  template {
    max_instance_request_concurrency = 10
    timeout                          = "300s"

    # Scaling configuration
    scaling {
      min_instance_count = 0
      max_instance_count = 5
    }

    containers {
      image = "us-central1-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.containers.repository_id}/proposal-engine:latest"
      ports {
        name           = "http1"
        container_port = var.cloud_run_api.container_port
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "1Gi"
        }
      }

      env {
        name  = "NODE_ENV"
        value = "production"
      }

      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }

      env {
        name  = "GCP_REGION"
        value = var.region
      }

      env {
        name  = "GCS_BUCKET_NAME"
        value = google_storage_bucket.proposals.name
      }

      env {
        name  = "BASE_URL"
        value = "https://proposal-engine-120416863832.us-central1.run.app"
      }

      env {
        name  = "NEXTAUTH_URL"
        value = "https://proposal-engine-120416863832.us-central1.run.app"
      }

      env {
        name  = "NEXT_PUBLIC_APP_URL"
        value = "https://proposal-engine-120416863832.us-central1.run.app"
      }

      env {
        name  = "FROM_EMAIL"
        value = "noreply@proposalengine.app"
      }

      env {
        name  = "WORKER_MODE"
        value = "outreach"
      }

      # Secrets from Secret Manager
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
        name = "API_KEY"
        value_source {
          secret_key_ref {
            secret  = "API_KEY"
            version = "latest"
          }
        }
      }

      env {
        name = "NEXTAUTH_SECRET"
        value_source {
          secret_key_ref {
            secret  = "NEXTAUTH_SECRET"
            version = "latest"
          }
        }
      }

      env {
        name = "STRIPE_SECRET_KEY"
        value_source {
          secret_key_ref {
            secret  = "STRIPE_SECRET_KEY"
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

      env {
        name = "CRON_SECRET"
        value_source {
          secret_key_ref {
            secret  = "CRON_SECRET"
            version = "latest"
          }
        }
      }

      env {
        name = "ADMIN_SECRET"
        value_source {
          secret_key_ref {
            secret  = "ADMIN_SECRET"
            version = "latest"
          }
        }
      }

      env {
        name = "STRIPE_WEBHOOK_SECRET"
        value_source {
          secret_key_ref {
            secret  = "STRIPE_WEBHOOK_SECRET"
            version = "latest"
          }
        }
      }

      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }
    }

    # VPC connector for private egress
    vpc_access {
      connector = google_vpc_access_connector.cloud_run.id
      egress    = "PRIVATE_RANGES_ONLY"
    }

    service_account = google_service_account.cloud_run_api.email

    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [google_sql_database_instance.main.connection_name]
      }
    }
  }

  traffic {
    percent = 100
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
  }

  depends_on = [google_project_service.required_apis]
}

# -----------------------------------------------------------------------------
# IAM: Allow unauthenticated invocations (for public endpoints)
# -----------------------------------------------------------------------------

resource "google_cloud_run_service_iam_member" "api_public" {
  project  = var.project_id
  location = var.region
  service  = google_cloud_run_v2_service.api.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_service_iam_member" "frontend_public" {
  project  = var.project_id
  location = var.region
  service  = google_cloud_run_v2_service.frontend.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# -----------------------------------------------------------------------------
# Monitoring: Uptime Checks
# -----------------------------------------------------------------------------

resource "google_monitoring_uptime_check_config" "api" {
  display_name = "ProposalOS API Uptime Check"
  project      = var.project_id

  http_check {
    path           = "/api/health"
    port           = 443
    use_ssl        = true
    validate_ssl   = true
    request_method = "GET"
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = trimprefix(google_cloud_run_v2_service.api.uri, "https://")
    }
  }

  timeout = "10s"
  period  = "60s"

  depends_on = [google_cloud_run_v2_service.api]
}

resource "google_monitoring_uptime_check_config" "frontend" {
  display_name = "ProposalOS Frontend Uptime Check"
  project      = var.project_id

  http_check {
    path           = "/"
    port           = 443
    use_ssl        = true
    validate_ssl   = true
    request_method = "GET"
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = trimprefix(google_cloud_run_v2_service.frontend.uri, "https://")
    }
  }

  timeout = "10s"
  period  = "60s"

  depends_on = [google_cloud_run_v2_service.frontend]
}

# -----------------------------------------------------------------------------
# Monitoring Alert: High Latency
# -----------------------------------------------------------------------------

resource "google_monitoring_alert_policy" "api_high_latency" {
  project      = var.project_id
  display_name = "Cloud Run API High Latency"
  combiner     = "OR"

  conditions {
    display_name = "P95 Latency > 2s"

    condition_threshold {
      filter          = "resource.type = \"cloud_run_revision\" AND metric.type = \"run.googleapis.com/request_latencies\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 2000
      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_PERCENTILE_95"
      }
    }
  }

  documentation {
    content   = "Cloud Run API P95 latency has exceeded 2 seconds for 5 minutes."
    mime_type = "text/markdown"
  }
}

# -----------------------------------------------------------------------------
# Monitoring Alert: High Error Rate
# -----------------------------------------------------------------------------

resource "google_monitoring_alert_policy" "api_high_error_rate" {
  project      = var.project_id
  display_name = "Cloud Run API High Error Rate"
  combiner     = "OR"

  conditions {
    display_name = "Error Rate > 5%"

    condition_threshold {
      filter          = "resource.type = \"cloud_run_revision\" AND metric.type = \"run.googleapis.com/request_count\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 0.05
      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_RATE"
        group_by_fields    = ["resource.label.response_code_class"]
      }
    }
  }

  documentation {
    content   = "Cloud Run API error rate has exceeded 5% for 5 minutes."
    mime_type = "text/markdown"
  }
}

# -----------------------------------------------------------------------------
# Outputs
# -----------------------------------------------------------------------------

output "cloud_run_api_url" {
  description = "Cloud Run API service URL"
  value       = google_cloud_run_v2_service.api.uri
}

output "cloud_run_frontend_url" {
  description = "Cloud Run frontend service URL"
  value       = google_cloud_run_v2_service.frontend.uri
}

output "cloud_run_services" {
  description = "All Cloud Run service URLs"
  value = {
    api            = google_cloud_run_v2_service.api.uri
    frontend       = google_cloud_run_v2_service.frontend.uri
    audit_worker   = google_cloud_run_v2_service.audit_worker.uri
    outreach_worker = google_cloud_run_v2_service.outreach_worker.uri
  }
}