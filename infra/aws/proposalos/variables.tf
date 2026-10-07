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
  description = "Scoped ProposalOS provisioning profile; never use the default/root profile."
  type        = string
  default     = "proposalos-migration"
}

variable "vpc_cidr" {
  description = "Dedicated ProposalOS VPC address space."
  type        = string
  default     = "10.42.0.0/16"
}

variable "postgres_engine_version" {
  description = "Latest confirmed PostgreSQL 15 patch available in us-east-2 on 2026-10-03."
  type        = string
  default     = "15.19"
}

variable "postgres_instance_class" {
  description = "Low-footprint single-AZ staging database class. Production uses a separate Multi-AZ configuration."
  type        = string
  default     = "db.t4g.small"
}

variable "postgres_allocated_storage_gb" {
  description = "Initial encrypted gp3 storage for staging."
  type        = number
  default     = 20
}

variable "postgres_max_allocated_storage_gb" {
  description = "Maximum RDS storage autoscaling ceiling for staging."
  type        = number
  default     = 100
}

variable "redis_engine_version" {
  description = "Redis engine version confirmed available in us-east-2."
  type        = string
  default     = "7.1"
}

variable "redis_node_type" {
  description = "Single-node staging cache class."
  type        = string
  default     = "cache.t4g.micro"
}

variable "migration_export_bucket" {
  description = "Private, short-lived S3 bucket holding the verified ProposalOS database exports."
  type        = string
  default     = "proposalos-migration-410432886960-20261003"
}

variable "migration_export_key" {
  description = "Object key for the populated proposal_engine SQL export."
  type        = string
  default     = "proposal_engine.sql"
}

variable "migration_export_etag" {
  description = "Expected single-part S3 ETag (MD5) for the candidate database export."
  type        = string
  default     = "b2b5e74b01b1ee783a6d17c9d939b016"
}

variable "migration_export_size_bytes" {
  description = "Expected byte size of the candidate database export."
  type        = number
  default     = 1466310
}

variable "migration_importer_image_tag" {
  description = "Image tag to publish from the one-off staging importer build."
  type        = string
  default     = "migration-20261003-7"
}

variable "migration_importer_task_image_tag" {
  description = "Currently deployed immutable importer image tag."
  type        = string
  default     = "migration-20261003-7"
}

variable "schema_migrator_image_tag" {
  description = "Immutable image tag for the one-shot staging Prisma migrator."
  type        = string
  default     = "schema-migrate-20261004-1"
}

variable "migration_build_source_key" {
  description = "Temporary ZIP source context for the isolated CodeBuild importer image build."
  type        = string
  default     = "logs/migration-build/importer-context.zip"
}

variable "app_image_tag" {
  description = "Immutable tag shared by the staging API and web images. Use a new tag for each build."
  type        = string
  default     = "staging-20261004-1"
}

variable "app_build_source_key" {
  description = "Short-lived ZIP source context used by the staging API and web CodeBuild project."
  type        = string
  default     = "logs/app-build/source-context.zip"
}

variable "staging_app_url" {
  description = "Staging browser URL reserved for the later TLS/DNS setup."
  type        = string
  default     = "https://aws-stage.claraud.com"
}

variable "staging_domain_name" {
  description = "Domain for the ProposalOS staging TLS certificate."
  type        = string
  default     = "aws-stage.claraud.com"
}

variable "enable_public_staging" {
  description = "Expose the staging load balancer publicly. Default off to avoid idle staging ingress."
  type        = bool
  default     = false
}

variable "enable_staging_alb" {
  description = "Keep the staging application load balancer provisioned. Default off to avoid idle hourly charges."
  type        = bool
  default     = false
}

variable "enable_staging_database" {
  description = "Keep the staging PostgreSQL instance provisioned. Default off to avoid idle database charges."
  type        = bool
  default     = false
}

variable "enable_staging_redis" {
  description = "Keep the staging Redis replication group provisioned. Default off to avoid idle cache charges."
  type        = bool
  default     = false
}

variable "app_desired_count" {
  description = "Staging API and web task count; leave at zero to reduce idle spend and set to one only while staging is in use."
  type        = number
  default     = 0
}

variable "enable_bedrock" {
  description = "Enable the Bedrock-only LLM path for the staging API; on-demand inference is billed by usage."
  type        = bool
  default     = true
}
