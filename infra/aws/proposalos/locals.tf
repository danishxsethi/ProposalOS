locals {
  project     = "ProposalOS"
  environment = "staging"
  prefix      = "proposalos-${local.environment}"

  staging_database_endpoint          = var.enable_staging_database ? aws_db_instance.staging[0].address : ""
  staging_database_port              = var.enable_staging_database ? tostring(aws_db_instance.staging[0].port) : "5432"
  staging_database_master_secret_arn = var.enable_staging_database ? aws_db_instance.staging[0].master_user_secret[0].secret_arn : aws_secretsmanager_secret.staging_database_url.arn

  common_tags = {
    Project     = local.project
    Environment = local.environment
    ManagedBy   = "Terraform"
    CostCenter  = "proposalos"
  }

  azs = slice(data.aws_availability_zones.available.names, 0, 2)

  subnet_layout = {
    public_a  = { az = local.azs[0], index = 0 }
    public_b  = { az = local.azs[1], index = 1 }
    private_a = { az = local.azs[0], index = 2 }
    private_b = { az = local.azs[1], index = 3 }
  }

}

data "aws_availability_zones" "available" {
  state = "available"
}
