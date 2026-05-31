# =============================================================================
# Terraform Configuration for ProposalOS on GCP
# =============================================================================
# This configuration provisions all GCP resources for production deployment.
#
# Prerequisites:
# - GCP Project ID
# - gcloud CLI authenticated
# - Service account with required permissions
#
# Usage:
#   terraform init
#   terraform plan -var="project_id=your-project" -var="region=us-central1"
#   terraform apply -var="project_id=your-project" -var="region=us-central1"
# =============================================================================

terraform {
  required_version = ">= 1.6.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
  }

  # Backend configuration for state storage
  # Production: Use GCS backend for remote state
  # Initialize with: terraform init -backend-config="bucket=${var.project_id}-terraform-state" -backend-config="prefix=terraform/state"
  backend "gcs" {
    bucket = "proposal-487522-terraform-state"
    prefix = "terraform/state/proposalos"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
  zone    = var.zone
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
  zone    = var.zone
}