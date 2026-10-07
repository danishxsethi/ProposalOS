variable "aws_account_id" {
  description = "Expected AWS account ID."
  type        = string
  default     = "410432886960"
}

variable "aws_region" {
  description = "AWS region selected for ProposalOS."
  type        = string
  default     = "us-east-2"
}

variable "aws_profile" {
  description = "AWS CLI profile authorized to provision the isolated ProposalOS production stack."
  type        = string
  default     = "proposalos-migration"
}

variable "vpc_cidr" {
  description = "Dedicated ProposalOS VPC address space."
  type        = string
  default     = "10.43.0.0/16"
}

variable "postgres_engine_version" {
  description = "Latest confirmed PostgreSQL 15 patch available in us-east-2 on 2026-10-03."
  type        = string
  default     = "15.19"
}

variable "postgres_instance_class" {
  description = "Right-sized production database class."
  type        = string
  default     = "db.t4g.medium"
}

variable "postgres_multi_az" {
  description = "Preserve regional database HA; set false only if the owner explicitly accepts the availability reduction for lower cost."
  type        = bool
  default     = true
}

variable "postgres_allocated_storage_gb" {
  description = "Initial encrypted gp3 storage for production."
  type        = number
  default     = 50
}

variable "postgres_max_allocated_storage_gb" {
  description = "Maximum RDS storage autoscaling ceiling for production."
  type        = number
  default     = 100
}

variable "redis_engine_version" {
  description = "Redis engine version confirmed available in us-east-2."
  type        = string
  default     = "7.1"
}

variable "redis_node_type" {
  description = "Single-node production cache class."
  type        = string
  default     = "cache.t4g.micro"
}

variable "migration_export_bucket" {
  description = "Private, short-lived S3 bucket holding the verified ProposalOS database exports."
  type        = string
  default     = "proposalos-migration-410432886960-20261003"
}

variable "enable_migration_importer" {
  description = "Create the production one-shot importer only after a final write-paused export and its verified S3 metadata are available."
  type        = bool
  default     = false
}

variable "migration_export_key" {
  description = "Unique object key for the final write-paused production export."
  type        = string
  default     = ""

  validation {
    condition     = !var.enable_migration_importer || can(regex("^final/proposal_engine-[0-9]{8}T[0-9]{6}Z[.]sql$", var.migration_export_key))
    error_message = "Use a unique final export key such as final/proposal_engine-20261004T235959Z.sql; the point-in-time proposal_engine.sql snapshot is not valid for production."
  }
}

variable "migration_export_etag" {
  description = "Required ETag recorded from the final, write-paused production export (include any multipart suffix)."
  type        = string
  default     = ""

  validation {
    condition     = !var.enable_migration_importer || length(trimspace(var.migration_export_etag)) > 0
    error_message = "Set the ETag of the final production database export; a point-in-time staging export is not valid."
  }
}

variable "migration_export_size_bytes" {
  description = "Required byte size recorded from the final, write-paused production export."
  type        = number
  default     = 0

  validation {
    condition     = !var.enable_migration_importer || var.migration_export_size_bytes > 0
    error_message = "Set the positive byte size of the final production database export."
  }
}

variable "migration_importer_image_tag" {
  description = "Image tag to publish from the one-off production importer build."
  type        = string
  default     = "production-migration-20261004-1"
}

variable "migration_importer_task_image_tag" {
  description = "Currently deployed immutable importer image tag."
  type        = string
  default     = "production-migration-20261004-1"
}

variable "migration_build_source_key" {
  description = "Temporary ZIP source context for the isolated CodeBuild importer image build."
  type        = string
  default     = "logs/migration-build/importer-context.zip"
}

variable "app_image_tag" {
  description = "Immutable tag shared by the production API and web images. Use a new tag for each build."
  type        = string
  default     = "production-20261004-1"
}

variable "app_build_source_key" {
  description = "Short-lived ZIP source context used by the production API and web CodeBuild project."
  type        = string
  default     = "logs/app-build/source-context.zip"
}

variable "production_app_url" {
  description = "Production browser URL reserved for the later TLS/DNS setup."
  type        = string
  default     = "https://claraud.com"
}

variable "production_domain_name" {
  description = "Domain for the ProposalOS production TLS certificate."
  type        = string
  default     = "claraud.com"
}

variable "enable_public_production" {
  description = "Keep enabled after production TLS validation and DNS cutover so the production hostname remains public."
  type        = bool
  default     = true
}

variable "app_desired_count" {
  description = "Production API and web task count; keep one task per service after the immutable images are available."
  type        = number
  default     = 1
}

variable "enable_production_app_services" {
  description = "Keep API and web services running after production database import, Prisma migrations, and qualification."
  type        = bool
  default     = true
}

variable "enable_audit_worker_dispatch" {
  description = "Enable API self-dispatch and the five-minute audit queue fallback after production DNS points to AWS."
  type        = bool
  default     = true
}

variable "enable_bedrock" {
  description = "Enable the Bedrock-only LLM path for the production API; on-demand inference is billed by usage."
  type        = bool
  default     = true
}

variable "billing_live_mode" {
  description = "Preserve the current GCP production Stripe live-mode setting."
  type        = bool
  default     = true
}

variable "stripe_publishable_key" {
  description = "Current Stripe publishable key used by the production API and embedded into the browser build."
  type        = string
  sensitive   = true
  default     = ""

  validation {
    condition     = !var.enable_production_app_services || (var.billing_live_mode ? startswith(var.stripe_publishable_key, "pk_live_") : startswith(var.stripe_publishable_key, "pk_test_"))
    error_message = "When production app services are enabled, provide the publishable key that matches billing_live_mode."
  }
}

variable "stripe_price_id_starter_live" {
  description = "Existing Stripe Starter price identifier used by production billing."
  type        = string
  sensitive   = true
  default     = ""

  validation {
    condition     = !var.enable_production_app_services || startswith(var.stripe_price_id_starter_live, "price_")
    error_message = "Provide the existing production Starter price ID before enabling production app services."
  }
}

variable "stripe_product_id_starter_live" {
  description = "Existing Stripe Starter product identifier used by production billing."
  type        = string
  sensitive   = true
  default     = ""

  validation {
    condition     = !var.enable_production_app_services || startswith(var.stripe_product_id_starter_live, "prod_")
    error_message = "Provide the existing production Starter product ID before enabling production app services."
  }
}

variable "default_tenant_id" {
  description = "Existing default tenant ID used by ProposalOS API-key and web clients."
  type        = string
  sensitive   = true
  default     = ""

  validation {
    condition     = !var.enable_production_app_services || length(trimspace(var.default_tenant_id)) > 0
    error_message = "Provide the current default tenant ID before enabling production app services."
  }
}

variable "from_email" {
  description = "Existing production sender address used for ProposalOS mail."
  type        = string
  sensitive   = true
  default     = ""

  validation {
    condition     = !var.enable_production_app_services || (length(trimspace(var.from_email)) > 3 && strcontains(var.from_email, "@"))
    error_message = "Provide the current production sender address before enabling production app services."
  }
}

variable "monitoring_alert_emails" {
  description = "Existing AWS budget email subscribers that should also receive ProposalOS production infrastructure alerts."
  type        = set(string)
  default     = []
}
