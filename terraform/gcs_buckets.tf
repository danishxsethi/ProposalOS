# =============================================================================
# GCS Buckets Configuration
# =============================================================================
# Separate buckets for different data types with:
# - Versioning enabled
# - Lifecycle policies (90-day archive)
# - Access controls
# - Encryption at rest
# =============================================================================

# -----------------------------------------------------------------------------
# Proposal PDFs Bucket
# -----------------------------------------------------------------------------

resource "google_storage_bucket" "proposals" {
  name          = "${var.project_id}-${var.gcs_buckets.proposals}"
  project       = var.project_id
  location      = var.region
  storage_class = "STANDARD"

  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  versioning {
    enabled = true
  }

  # Lifecycle policy: Archive after 90 days, delete after 365 days
  lifecycle_rule {
    condition {
      age = 90
    }
    action {
      type          = "SetStorageClass"
      storage_class = "NEARLINE"
    }
  }

  lifecycle_rule {
    condition {
      age = 365
    }
    action {
      type = "Delete"
    }
  }

  # Encryption - use Google-managed keys (default)

  # Logging
  logging {
    log_bucket        = google_storage_bucket.logs.name
    log_object_prefix = "gcs-access/proposals/"
  }

  labels = local.common_labels
}

# -----------------------------------------------------------------------------
# Audit Snapshots Bucket
# -----------------------------------------------------------------------------

resource "google_storage_bucket" "audit_snapshots" {
  name          = "${var.project_id}-${var.gcs_buckets.audit_snapshots}"
  project       = var.project_id
  location      = var.region
  storage_class = "STANDARD"

  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  versioning {
    enabled = true
  }

  # Lifecycle policy: Archive after 30 days, delete after 180 days
  lifecycle_rule {
    condition {
      age = 30
    }
    action {
      type          = "SetStorageClass"
      storage_class = "NEARLINE"
    }
  }

  lifecycle_rule {
    condition {
      age = 180
    }
    action {
      type = "Delete"
    }
  }

  logging {
    log_bucket        = google_storage_bucket.logs.name
    log_object_prefix = "gcs-access/audit-snapshots/"
  }

  labels = local.common_labels
}

# -----------------------------------------------------------------------------
# Outreach Assets Bucket (separate for cold outreach)
# -----------------------------------------------------------------------------

resource "google_storage_bucket" "outreach_assets" {
  name          = "${var.project_id}-${var.gcs_buckets.outreach_assets}"
  project       = var.project_id
  location      = var.region
  storage_class = "STANDARD"

  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  versioning {
    enabled = true
  }

  # Lifecycle policy: Archive after 60 days, delete after 270 days
  lifecycle_rule {
    condition {
      age = 60
    }
    action {
      type          = "SetStorageClass"
      storage_class = "NEARLINE"
    }
  }

  lifecycle_rule {
    condition {
      age = 270
    }
    action {
      type = "Delete"
    }
  }

  logging {
    log_bucket        = google_storage_bucket.logs.name
    log_object_prefix = "gcs-access/outreach-assets/"
  }

  labels = local.common_labels
}

# -----------------------------------------------------------------------------
# Logs Bucket (for GCS access logging)
# -----------------------------------------------------------------------------

resource "google_storage_bucket" "logs" {
  name          = "${var.project_id}-logs"
  project       = var.project_id
  location      = var.region
  storage_class = "NEARLINE"

  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  # Versioning enabled for audit trail
  versioning {
    enabled = true
  }

  # Retain logs for 90 days
  lifecycle_rule {
    condition {
      age = 90
    }
    action {
      type = "Delete"
    }
  }

  labels = local.common_labels
}

# -----------------------------------------------------------------------------
# Terraform State Bucket
# -----------------------------------------------------------------------------

resource "google_storage_bucket" "terraform_state" {
  name          = "${var.project_id}-${var.gcs_buckets.terraform_state}"
  project       = var.project_id
  location      = var.region
  storage_class = "STANDARD"

  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  versioning {
    enabled = true
  }

  # Retain state versions for 365 days
  lifecycle_rule {
    condition {
      age    = 365
      with_state = "ARCHIVED"
    }
    action {
      type = "Delete"
    }
  }

  labels = local.common_labels
}

# Terraform state bucket has versioning enabled for protection

# -----------------------------------------------------------------------------
# IAM Bindings for Cloud Run Service Accounts
# -----------------------------------------------------------------------------

# API Service Account - Full access to all buckets
resource "google_storage_bucket_iam_member" "proposals_api_writer" {
  bucket = google_storage_bucket.proposals.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.cloud_run_api.email}"
}

resource "google_storage_bucket_iam_member" "audit_snapshots_api_writer" {
  bucket = google_storage_bucket.audit_snapshots.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.cloud_run_api.email}"
}

resource "google_storage_bucket_iam_member" "outreach_assets_api_writer" {
  bucket = google_storage_bucket.outreach_assets.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.cloud_run_api.email}"
}

resource "google_storage_bucket_iam_member" "logs_api_reader" {
  bucket = google_storage_bucket.logs.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.cloud_run_api.email}"
}

# Frontend Service Account - Read-only access to proposals (for public URLs)
resource "google_storage_bucket_iam_member" "proposals_frontend_reader" {
  bucket = google_storage_bucket.proposals.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.cloud_run_frontend.email}"
}

# -----------------------------------------------------------------------------
# Bucket Access Logging Project
# -----------------------------------------------------------------------------

resource "google_project_iam_member" "logging_writer" {
  project = var.project_id
  role    = "roles/storage.objectCreator"
  member  = "group:cloud-storage-analytics@google.com"
}

# -----------------------------------------------------------------------------
# Outputs
# -----------------------------------------------------------------------------

output "gcs_bucket_proposals" {
  description = "GCS bucket for proposal PDFs"
  value       = google_storage_bucket.proposals.name
}

output "gcs_bucket_audit_snapshots" {
  description = "GCS bucket for audit snapshots"
  value       = google_storage_bucket.audit_snapshots.name
}

output "gcs_bucket_outreach_assets" {
  description = "GCS bucket for outreach assets"
  value       = google_storage_bucket.outreach_assets.name
}

output "gcs_bucket_urls" {
  description = "GCS bucket URLs"
  value = {
    proposals       = "gs://${google_storage_bucket.proposals.name}"
    audit_snapshots = "gs://${google_storage_bucket.audit_snapshots.name}"
    outreach_assets = "gs://${google_storage_bucket.outreach_assets.name}"
    logs            = "gs://${google_storage_bucket.logs.name}"
    terraform_state = "gs://${google_storage_bucket.terraform_state.name}"
  }
}