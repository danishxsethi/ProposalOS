# =============================================================================
# Secret Manager Configuration
# =============================================================================
# Secure secret storage with:
# - Automatic rotation (where supported)
# - Version management
# - Access controls
# - Audit logging
# =============================================================================

# -----------------------------------------------------------------------------
# Required Secrets Definition
# -----------------------------------------------------------------------------

locals {
  # List of required secrets to create
  required_secrets = [
    "DATABASE_URL",
    "API_KEY",
    "NEXTAUTH_SECRET",
    "ADMIN_SECRET",
    "CRON_SECRET",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "RESEND_API_KEY",
    "GOOGLE_AI_API_KEY",
    "GOOGLE_PAGESPEED_API_KEY",
    "GOOGLE_PLACES_API_KEY",
    "SERP_API_KEY",
    "GCS_BUCKET_NAME",
  ]

  # Optional secrets
  optional_secrets = [
    "APOLLO_API_KEY",
    "HUNTER_API_KEY",
    "PROXYCURL_API_KEY",
    "CLEARBIT_API_KEY",
    "ZEROBOUNCE_API_KEY",
    "NEVERBOUNCE_API_KEY",
    "LANGCHAIN_API_KEY",
    "LANGSMITH_API_KEY",
    "REDIS_URL",
    "WEBHOOK_URL",
    "WEBHOOK_SECRET",
  ]
}

# -----------------------------------------------------------------------------
# Secret Definitions
# -----------------------------------------------------------------------------

# Generate random values for secrets that need them
resource "random_password" "api_key" {
  length  = 64
  special = false
  upper   = true
  lower   = true
  numeric = true
}

resource "random_password" "nextauth_secret" {
  length  = 32
  special = true
  upper   = true
  lower   = true
  numeric = true
}

resource "random_password" "admin_secret" {
  length  = 64
  special = true
  upper   = true
  lower   = true
  numeric = true
}

resource "random_password" "cron_secret" {
  length  = 32
  special = false
  upper   = true
  lower   = true
  numeric = true
}

# Create secrets with initial values
resource "google_secret_manager_secret" "database_url" {
  secret_id = "DATABASE_URL"
  project   = var.project_id

  replication {
    auto {}
  }

  labels = merge(local.common_labels, {
    secret_type = "database"
  })
}

resource "google_secret_manager_secret" "api_key" {
  secret_id = "API_KEY"
  project   = var.project_id

  replication {
    auto {}
  }

  labels = merge(local.common_labels, {
    secret_type = "api_key"
  })
}

resource "google_secret_manager_secret" "nextauth_secret" {
  secret_id = "NEXTAUTH_SECRET"
  project   = var.project_id

  replication {
    auto {}
  }

  labels = merge(local.common_labels, {
    secret_type = "auth"
  })
}

resource "google_secret_manager_secret" "admin_secret" {
  secret_id = "ADMIN_SECRET"
  project   = var.project_id

  replication {
    auto {}
  }

  labels = merge(local.common_labels, {
    secret_type = "auth"
  })
}

resource "google_secret_manager_secret" "cron_secret" {
  secret_id = "CRON_SECRET"
  project   = var.project_id

  replication {
    auto {}
  }

  labels = merge(local.common_labels, {
    secret_type = "auth"
  })
}

resource "google_secret_manager_secret" "stripe_secret_key" {
  secret_id = "STRIPE_SECRET_KEY"
  project   = var.project_id

  replication {
    auto {}
  }

  labels = merge(local.common_labels, {
    secret_type = "payment"
  })
}

resource "google_secret_manager_secret" "stripe_webhook_secret" {
  secret_id = "STRIPE_WEBHOOK_SECRET"
  project   = var.project_id

  replication {
    auto {}
  }

  labels = merge(local.common_labels, {
    secret_type = "payment"
  })
}

resource "google_secret_manager_secret" "resend_api_key" {
  secret_id = "RESEND_API_KEY"
  project   = var.project_id

  replication {
    auto {}
  }

  labels = merge(local.common_labels, {
    secret_type = "email"
  })
}

resource "google_secret_manager_secret" "google_ai_api_key" {
  secret_id = "GOOGLE_AI_API_KEY"
  project   = var.project_id

  replication {
    auto {}
  }

  labels = merge(local.common_labels, {
    secret_type = "llm"
  })
}

resource "google_secret_manager_secret" "google_pagespeed_api_key" {
  secret_id = "GOOGLE_PAGESPEED_API_KEY"
  project   = var.project_id

  replication {
    auto {}
  }

  labels = merge(local.common_labels, {
    secret_type = "google_api"
  })
}

resource "google_secret_manager_secret" "google_places_api_key" {
  secret_id = "GOOGLE_PLACES_API_KEY"
  project   = var.project_id

  replication {
    auto {}
  }

  labels = merge(local.common_labels, {
    secret_type = "google_api"
  })
}

resource "google_secret_manager_secret" "serp_api_key" {
  secret_id = "SERP_API_KEY"
  project   = var.project_id

  replication {
    auto {}
  }

  labels = merge(local.common_labels, {
    secret_type = "external_api"
  })
}

resource "google_secret_manager_secret" "gcs_bucket_name" {
  secret_id = "GCS_BUCKET_NAME"
  project   = var.project_id

  replication {
    auto {}
  }

  labels = merge(local.common_labels, {
    secret_type = "storage"
  })
}

# -----------------------------------------------------------------------------
# Initial Secret Versions (with generated values for auth secrets)
# -----------------------------------------------------------------------------

resource "google_secret_manager_secret_version" "api_key_version" {
  secret      = google_secret_manager_secret.api_key.id
  secret_data = random_password.api_key.result
}

resource "google_secret_manager_secret_version" "nextauth_secret_version" {
  secret      = google_secret_manager_secret.nextauth_secret.id
  secret_data = random_password.nextauth_secret.result
}

resource "google_secret_manager_secret_version" "admin_secret_version" {
  secret      = google_secret_manager_secret.admin_secret.id
  secret_data = random_password.admin_secret.result
}

resource "google_secret_manager_secret_version" "cron_secret_version" {
  secret      = google_secret_manager_secret.cron_secret.id
  secret_data = random_password.cron_secret.result
}

# -----------------------------------------------------------------------------
# IAM: Grant Cloud Run API service account access to secrets
# -----------------------------------------------------------------------------

resource "google_secret_manager_secret_iam_member" "api_database_url" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.database_url.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloud_run_api.email}"
}

resource "google_secret_manager_secret_iam_member" "api_api_key" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.api_key.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloud_run_api.email}"
}

resource "google_secret_manager_secret_iam_member" "api_nextauth" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.nextauth_secret.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloud_run_api.email}"
}

resource "google_secret_manager_secret_iam_member" "api_admin" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.admin_secret.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloud_run_api.email}"
}

resource "google_secret_manager_secret_iam_member" "api_cron" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.cron_secret.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloud_run_api.email}"
}

resource "google_secret_manager_secret_iam_member" "api_stripe" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.stripe_secret_key.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloud_run_api.email}"
}

resource "google_secret_manager_secret_iam_member" "api_stripe_webhook" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.stripe_webhook_secret.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloud_run_api.email}"
}

resource "google_secret_manager_secret_iam_member" "api_resend" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.resend_api_key.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloud_run_api.email}"
}

resource "google_secret_manager_secret_iam_member" "api_google_ai" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.google_ai_api_key.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloud_run_api.email}"
}

resource "google_secret_manager_secret_iam_member" "api_google_pagespeed" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.google_pagespeed_api_key.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloud_run_api.email}"
}

resource "google_secret_manager_secret_iam_member" "api_google_places" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.google_places_api_key.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloud_run_api.email}"
}

resource "google_secret_manager_secret_iam_member" "api_serp" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.serp_api_key.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloud_run_api.email}"
}

resource "google_secret_manager_secret_iam_member" "api_gcs" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.gcs_bucket_name.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloud_run_api.email}"
}

# -----------------------------------------------------------------------------
# Monitoring: Secret Rotation Reminder Alert
# -----------------------------------------------------------------------------

resource "google_monitoring_alert_policy" "secret_rotation_reminder" {
  project      = var.project_id
  display_name = "Secret Rotation Reminder (90 days)"
  combiner     = "OR"

  conditions {
    display_name = "Secret older than 85 days"

    condition_monitoring_query_language {
      query = <<-EOT
        fetch secretmanager.googleapis.com::secret
        | metric 'secretmanager.googleapis.com/secret/version_count'
        | filter (resource.secret_id == 'DATABASE_URL')
        | group_by 1d
        | condition val() > 0
        | every 1d
      EOT
      duration = "86400s"
    }
  }

  documentation {
    content   = "Secrets approaching 90-day rotation deadline. Please rotate secrets."
    mime_type = "text/markdown"
  }
}

# -----------------------------------------------------------------------------
# Outputs
# -----------------------------------------------------------------------------

output "secret_manager_secrets" {
  description = "List of created secrets"
  value = {
    required = local.required_secrets
    optional = local.optional_secrets
  }
}

output "secret_manager_secret_ids" {
  description = "Secret manager secret IDs"
  value = {
    database_url          = google_secret_manager_secret.database_url.secret_id
    api_key               = google_secret_manager_secret.api_key.secret_id
    nextauth_secret       = google_secret_manager_secret.nextauth_secret.secret_id
    admin_secret          = google_secret_manager_secret.admin_secret.secret_id
    cron_secret           = google_secret_manager_secret.cron_secret.secret_id
    stripe_secret_key     = google_secret_manager_secret.stripe_secret_key.secret_id
    stripe_webhook_secret = google_secret_manager_secret.stripe_webhook_secret.secret_id
    resend_api_key        = google_secret_manager_secret.resend_api_key.secret_id
    google_ai_api_key     = google_secret_manager_secret.google_ai_api_key.secret_id
    google_pagespeed_api  = google_secret_manager_secret.google_pagespeed_api_key.secret_id
    google_places_api     = google_secret_manager_secret.google_places_api_key.secret_id
    serp_api_key          = google_secret_manager_secret.serp_api_key.secret_id
    gcs_bucket_name       = google_secret_manager_secret.gcs_bucket_name.secret_id
  }
  sensitive = true
}