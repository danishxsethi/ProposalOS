# =============================================================================
# Variable Definitions
# =============================================================================

# -----------------------------------------------------------------------------
# GCP Configuration
# -----------------------------------------------------------------------------

variable "project_id" {
  description = "GCP Project ID"
  type        = string
}

variable "region" {
  description = "GCP Region"
  type        = string
  default     = "us-central1"
}

variable "zone" {
  description = "GCP Zone"
  type        = string
  default     = "us-central1-a"
}

# -----------------------------------------------------------------------------
# Application Configuration
# -----------------------------------------------------------------------------

variable "app_name" {
  description = "Application name used for resource naming"
  type        = string
  default     = "proposalos"
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "prod"
}

# -----------------------------------------------------------------------------
# Cloud Run Configuration
# -----------------------------------------------------------------------------

variable "cloud_run_api" {
  description = "Cloud Run API service configuration"
  type = object({
    min_instances     = optional(number, 1)
    max_instances     = optional(number, 50)
    memory            = optional(string, "1Gi")
    cpu               = optional(string, "1")
    concurrency       = optional(number, 40)
    timeout_seconds   = optional(number, 300)
    container_port    = optional(number, 8080)
    always_on_cpu     = optional(bool, true)
  })
  default = {}
}

variable "cloud_run_frontend" {
  description = "Cloud Run frontend service configuration"
  type = object({
    min_instances     = optional(number, 1)
    max_instances     = optional(number, 20)
    memory            = optional(string, "1Gi")
    cpu               = optional(string, "1")
    concurrency       = optional(number, 80)
    timeout_seconds   = optional(number, 60)
    container_port    = optional(number, 3000)
  })
  default = {}
}

# -----------------------------------------------------------------------------
# Cloud SQL Configuration
# -----------------------------------------------------------------------------

variable "cloud_sql" {
  description = "Cloud SQL database configuration"
  type = object({
    database_name      = optional(string, "proposalos")
    tier               = optional(string, "db-custom-2-4096")
    disk_size          = optional(number, 50)
    disk_type          = optional(string, "PD_SSD")
    availability_type  = optional(string, "REGIONAL")
    backup_start_time  = optional(string, "02:00")
    backup_retention   = optional(number, 7)
    maintenance_day    = optional(string, "MON")
    maintenance_hour   = optional(number, 2)
    require_ssl        = optional(bool, true)
    private_ip         = optional(bool, true)
    deletion_protection = optional(bool, true)
  })
  default = {}
}

# -----------------------------------------------------------------------------
# GCS Bucket Configuration
# -----------------------------------------------------------------------------

variable "gcs_buckets" {
  description = "GCS bucket names (without project prefix)"
  type = object({
    proposals         = optional(string, "proposals")
    audit_snapshots   = optional(string, "audit-snapshots")
    outreach_assets   = optional(string, "outreach-assets")
    terraform_state   = optional(string, "terraform-state")
  })
  default = {}
}

# -----------------------------------------------------------------------------
# Network Configuration
# -----------------------------------------------------------------------------

variable "vpc" {
  description = "VPC configuration"
  type = object({
    name                  = optional(string)
    auto_create_subnetworks = optional(bool, false)
    subnet_cidr           = optional(string, "10.0.0.0/20")
    cloud_run_connector_cidr = optional(string, "10.8.0.0/28")
  })
  default = {}
}

# -----------------------------------------------------------------------------
# Cloud Armor WAF Configuration
# -----------------------------------------------------------------------------

variable "cloud_armor" {
  description = "Cloud Armor WAF configuration"
  type = object({
    enabled                    = optional(bool, true)
    ddos_protection            = optional(bool, true)
    allowed_ips                = optional(list(string), [])
    blocked_ips                = optional(list(string), [])
    rate_limit_requests_per_sec = optional(number, 1000)
  })
  default = {}
}

# -----------------------------------------------------------------------------
# Secret Manager Configuration
# -----------------------------------------------------------------------------

variable "secrets" {
  description = "Secrets to create in Secret Manager"
  type = map(object({
    value      = string
    rotation   = optional(bool, false)
    next_rotation_time = optional(string)
  }))
  default     = {}
  sensitive   = true
}

# -----------------------------------------------------------------------------
# Tags and Labels
# -----------------------------------------------------------------------------

variable "default_labels" {
  description = "Default labels to apply to all resources"
  type        = map(string)
  default = {
    environment = "prod"
    managed_by  = "terraform"
    application = "proposalos"
  }
}

variable "cost_allocation_labels" {
  description = "Cost allocation labels for billing"
  type        = map(string)
  default = {
    cost_center   = "engineering"
    team          = "platform"
    billing_code  = "prod-001"
  }
}

# -----------------------------------------------------------------------------
# DNS Configuration
# -----------------------------------------------------------------------------

variable "dns" {
  description = "DNS configuration"
  type = object({
    domain              = optional(string)
    sending_domain      = optional(string)  # Separate domain for cold outreach (recommended)
    sending_subdomain   = optional(string, "mail")
    managed_zone        = optional(string)
    spf_include         = optional(list(string), ["_spf.google.com", "sendgrid.net", "resend.com"])
    dmarc_policy        = optional(string, "quarantine")
    dmarc_rua_email     = optional(string)
  })
  default = {}
}

# -----------------------------------------------------------------------------
# Monitoring Configuration
# -----------------------------------------------------------------------------

variable "monitoring" {
  description = "Monitoring and alerting configuration"
  type = object({
    enabled             = optional(bool, true)
    notification_email  = optional(string)
    uptime_check_enabled = optional(bool, true)
  })
  default = {}
}