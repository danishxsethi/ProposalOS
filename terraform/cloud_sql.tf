# =============================================================================
# Cloud SQL Configuration
# =============================================================================
# Production-hardened PostgreSQL instance with:
# - High Availability (regional)
# - Automated backups with PITR
# - Private IP only
# - SSL enforcement
# - Maintenance windows
# =============================================================================

# -----------------------------------------------------------------------------
# Private IP Configuration (Private Service Access)
# -----------------------------------------------------------------------------

resource "google_compute_global_address" "private_ip_range" {
  name          = "${local.prefix}-private-ip-range"
  project       = var.project_id
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.main.id

  labels = local.common_labels
}

resource "google_service_networking_connection" "private_vpc_connection" {
  network                 = google_compute_network.main.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_ip_range.name]

  depends_on = [google_project_service.required_apis]
}

# -----------------------------------------------------------------------------
# Cloud SQL Instance
# -----------------------------------------------------------------------------

resource "google_sql_database_instance" "main" {
  name                = "${local.prefix}-db"
  project             = var.project_id
  region              = var.region
  database_version    = "POSTGRES_15"
  deletion_protection = var.cloud_sql.deletion_protection

  # Instance configuration
  settings {
    tier              = var.cloud_sql.tier
    availability_type = var.cloud_sql.availability_type

    disk_size             = var.cloud_sql.disk_size
    disk_type             = var.cloud_sql.disk_type
    disk_autoresize       = true
    disk_autoresize_limit = 500

    # Private IP only
    ip_configuration {
      ipv4_enabled    = false
      private_network = google_compute_network.main.id
      require_ssl     = var.cloud_sql.require_ssl
      ssl_mode        = "ENCRYPTED_ONLY"
    }

    # Backup configuration
    backup_configuration {
      enabled                        = true
      start_time                     = var.cloud_sql.backup_start_time
      point_in_time_recovery_enabled = true
      transaction_log_retention_days = var.cloud_sql.backup_retention
      backup_retention_settings {
        retained_backups = var.cloud_sql.backup_retention
        retention_unit   = "COUNT"
      }
    }

    # Maintenance window
    maintenance_window {
      day          = var.cloud_sql.maintenance_day
      hour         = var.cloud_sql.maintenance_hour
      update_track = "stable"
    }

    # Database flags for security and performance
    database_flags {
      name  = "log_checkpoints"
      value = "on"
    }

    database_flags {
      name  = "log_connections"
      value = "on"
    }

    database_flags {
      name  = "log_disconnections"
      value = "on"
    }

    database_flags {
      name  = "log_lock_waits"
      value = "on"
    }

    database_flags {
      name  = "log_min_duration_statement"
      value = "1000"
    }

    database_flags {
      name  = "log_statement"
      value = "ddl"
    }

    database_flags {
      name  = "log_min_error_statement"
      value = "error"
    }

    # SSL enforcement
    database_flags {
      name  = "ssl"
      value = "on"
    }

    # Connection limits
    database_flags {
      name  = "max_connections"
      value = "200"
    }

    labels = local.common_labels
  }

  depends_on = [google_service_networking_connection.private_vpc_connection]

  lifecycle {
    prevent_destroy = true
  }
}

# -----------------------------------------------------------------------------
# Database
# -----------------------------------------------------------------------------

resource "google_sql_database" "main" {
  name      = var.cloud_sql.database_name
  project   = var.project_id
  instance  = google_sql_database_instance.main.name
  charset   = "UTF8"
  collation = "en_US.UTF8"

  depends_on = [google_sql_database_instance.main]
}

# -----------------------------------------------------------------------------
# Database Users
# -----------------------------------------------------------------------------

# Application user (generated password)
resource "random_password" "db_password" {
  length  = 32
  special = true
  upper   = true
  lower   = true
  numeric = true
}

resource "google_sql_user" "app_user" {
  name     = "app_user"
  project  = var.project_id
  instance = google_sql_database_instance.main.name
  password = random_password.db_password.result

  depends_on = [google_sql_database_instance.main]
}

# -----------------------------------------------------------------------------
# Cloud SQL Insights (Monitoring)
# -----------------------------------------------------------------------------

resource "google_monitoring_metric_descriptor" "cloud_sql_connections" {
  project = var.project_id

  display_name = "Cloud SQL Connections"
  type         = "custom.googleapis.com/cloud_sql/connections"
  metric_kind  = "GAUGE"
  value_type   = "INT64"
  description  = "Number of active connections to Cloud SQL"

  labels {
    key         = "instance_name"
    value_type  = "STRING"
    description = "Cloud SQL instance name"
  }

  unit = "1"
}

# -----------------------------------------------------------------------------
# Monitoring Alert: High CPU
# -----------------------------------------------------------------------------

resource "google_monitoring_alert_policy" "cloud_sql_high_cpu" {
  project      = var.project_id
  display_name = "Cloud SQL High CPU Usage"
  combiner     = "OR"

  conditions {
    display_name = "CPU utilization > 80%"

    condition_threshold {
      filter          = "resource.type = \"cloudsql_database\" AND metric.type = \"cloudsql.googleapis.com/database/cpu/utilization\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 0.8
      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_MEAN"
      }
    }
  }

  notification_channels = []

  documentation {
    content   = "Cloud SQL CPU utilization has exceeded 80% for 5 minutes. Consider scaling up the instance."
    mime_type = "text/markdown"
  }
}

# -----------------------------------------------------------------------------
# Monitoring Alert: Disk Space
# -----------------------------------------------------------------------------

resource "google_monitoring_alert_policy" "cloud_sql_disk_space" {
  project      = var.project_id
  display_name = "Cloud SQL Low Disk Space"
  combiner     = "OR"

  conditions {
    display_name = "Disk space < 20%"

    condition_threshold {
      filter          = "resource.type = \"cloudsql_database\" AND metric.type = \"cloudsql.googleapis.com/database/disk/bytes_available\""
      duration        = "300s"
      comparison      = "COMPARISON_LT"
      threshold_value = 0.2 * var.cloud_sql.disk_size * 1024 * 1024 * 1024
      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_MEAN"
      }
    }
  }

  notification_channels = []

  documentation {
    content   = "Cloud SQL available disk space is below 20%. Consider increasing disk size."
    mime_type = "text/markdown"
  }
}

# -----------------------------------------------------------------------------
# Outputs
# -----------------------------------------------------------------------------

output "cloud_sql_connection_name" {
  description = "Cloud SQL connection name for DATABASE_URL"
  value       = google_sql_database_instance.main.connection_name
}

output "cloud_sql_private_ip" {
  description = "Cloud SQL private IP address"
  value       = google_sql_database_instance.main.private_ip_address
  sensitive   = true
}

output "cloud_sql_database_url_template" {
  description = "DATABASE_URL template (fill in password)"
  value       = "postgresql://app_user:PASSWORD@/proposalos?host=/cloudsql/${google_sql_database_instance.main.connection_name}"
  sensitive   = true
}