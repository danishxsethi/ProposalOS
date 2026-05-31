# =============================================================================
# Main Configuration - VPC, Networking, and Service Accounts
# =============================================================================

# -----------------------------------------------------------------------------
# Local Values
# -----------------------------------------------------------------------------

locals {
  # Combined labels for all resources
  common_labels = merge(var.default_labels, var.cost_allocation_labels, {
    project = var.project_id
  })

  # Resource naming prefix
  prefix = "${var.app_name}-${var.environment}"

  # API service URL
  api_service_url = "proposal-engine"

  # Frontend service URL
  frontend_service_url = "claraud-web"
}

# -----------------------------------------------------------------------------
# VPC Network
# -----------------------------------------------------------------------------

resource "google_compute_network" "main" {
  name                            = var.vpc.name != null ? var.vpc.name : "${local.prefix}-vpc"
  auto_create_subnetworks         = var.vpc.auto_create_subnetworks
  delete_default_routes_on_create = false
}

# -----------------------------------------------------------------------------
# Subnet
# -----------------------------------------------------------------------------

resource "google_compute_subnetwork" "main" {
  name                     = "${local.prefix}-subnet"
  ip_cidr_range            = var.vpc.subnet_cidr
  region                   = var.region
  network                  = google_compute_network.main.id
  private_ip_google_access = true

  log_config {
    aggregation_interval = "INTERVAL_5_SEC"
    flow_sampling        = 0.5
    metadata             = "INCLUDE_ALL_METADATA"
  }
}

# -----------------------------------------------------------------------------
# VPC Peering for Cloud Run (Serverless VPC Access)
# -----------------------------------------------------------------------------

resource "google_vpc_access_connector" "cloud_run" {
  name          = "prop-prod-connector"
  project       = var.project_id
  region        = var.region
  network       = google_compute_network.main.name
  ip_cidr_range = var.vpc.cloud_run_connector_cidr

  min_instances = 2
  max_instances = 10
  machine_type  = "e2-micro"

  lifecycle {
    ignore_changes = [
      max_throughput,
      min_throughput
    ]
  }
}

# -----------------------------------------------------------------------------
# Cloud NAT for Private Egress
# -----------------------------------------------------------------------------

resource "google_compute_router" "main" {
  name    = "${local.prefix}-router"
  region  = google_compute_subnetwork.main.region
  network = google_compute_network.main.id

  bgp {
    asn = 64514
  }
}

resource "google_compute_router_nat" "main" {
  name                               = "${local.prefix}-nat"
  router                             = google_compute_router.main.name
  region                             = google_compute_router.main.region
  nat_ip_allocate_option             = "AUTO_ONLY"
  source_subnetwork_ip_ranges_to_nat = "ALL_SUBNETWORKS_ALL_IP_RANGES"

  log_config {
    enable = true
    filter = "ERRORS_ONLY"
  }

  depends_on = [google_compute_router.main]
}

# -----------------------------------------------------------------------------
# Firewall Rules
# -----------------------------------------------------------------------------

# Allow health checks from GCP load balancer
resource "google_compute_firewall" "allow_health_checks" {
  name    = "${local.prefix}-allow-health-checks"
  network = google_compute_network.main.name

  allow {
    protocol = "tcp"
    ports    = ["8080", "3000"]
  }

  source_ranges = ["35.191.0.0/16", "130.211.0.0/22"]
  target_tags   = ["${local.prefix}-app"]
}

# Deny all egress except to Google APIs (optional, for enhanced security)
resource "google_compute_firewall" "deny_egress" {
  name      = "${local.prefix}-deny-egress"
  network   = google_compute_network.main.name
  direction = "EGRESS"

  deny {
    protocol = "all"
  }

  destination_ranges = ["0.0.0.0/0"]
  priority           = 1000
}

# -----------------------------------------------------------------------------
# Service Accounts
# -----------------------------------------------------------------------------

# Cloud Run API Service Account
resource "google_service_account" "cloud_run_api" {
  account_id   = "${local.prefix}-api-sa"
  display_name = "Cloud Run API Service Account"
  description  = "Service account for Cloud Run API service"
  project      = var.project_id
}

# Cloud Run Frontend Service Account
resource "google_service_account" "cloud_run_frontend" {
  account_id   = "${local.prefix}-frontend-sa"
  display_name = "Cloud Run Frontend Service Account"
  description  = "Service account for Cloud Run frontend service"
  project      = var.project_id
}

# Grant Cloud Run service accounts required permissions
resource "google_project_iam_member" "cloud_run_api_logging" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.cloud_run_api.email}"
}

resource "google_project_iam_member" "cloud_run_api_monitoring" {
  project = var.project_id
  role    = "roles/monitoring.metricWriter"
  member  = "serviceAccount:${google_service_account.cloud_run_api.email}"
}

resource "google_project_iam_member" "cloud_run_api_trace" {
  project = var.project_id
  role    = "roles/cloudtrace.agent"
  member  = "serviceAccount:${google_service_account.cloud_run_api.email}"
}

resource "google_project_iam_member" "cloud_run_api_secretmanager" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.cloud_run_api.email}"
}

resource "google_project_iam_member" "cloud_run_api_storage" {
  project = var.project_id
  role    = "roles/storage.objectViewer"
  member  = "serviceAccount:${google_service_account.cloud_run_api.email}"
}

resource "google_project_iam_member" "cloud_run_api_sql" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.cloud_run_api.email}"
}

# Frontend service account permissions
resource "google_project_iam_member" "cloud_run_frontend_logging" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.cloud_run_frontend.email}"
}

resource "google_project_iam_member" "cloud_run_frontend_monitoring" {
  project = var.project_id
  role    = "roles/monitoring.metricWriter"
  member  = "serviceAccount:${google_service_account.cloud_run_frontend.email}"
}

# -----------------------------------------------------------------------------
# Enable Required APIs
# -----------------------------------------------------------------------------

resource "google_project_service" "required_apis" {
  for_each = toset([
    "run.googleapis.com",
    "sqladmin.googleapis.com",
    "storage.googleapis.com",
    "secretmanager.googleapis.com",
    "servicenetworking.googleapis.com",
    "compute.googleapis.com",
    "cloudbuild.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "iam.googleapis.com",
    "logging.googleapis.com",
    "monitoring.googleapis.com",
    "cloudtrace.googleapis.com",
    "vpcaccess.googleapis.com",
  ])

  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}