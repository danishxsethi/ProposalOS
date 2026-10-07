locals {
  project     = "ProposalOS"
  environment = "production"
  prefix      = "proposalos-${local.environment}"

  common_tags = {
    Project     = local.project
    Environment = local.environment
    ManagedBy   = "Terraform"
    CostCenter  = "proposalos"
  }

  # RDS Multi-AZ placement in us-east-2 currently needs a private subnet in
  # us-east-2c to find db.t4g.medium capacity. Keep three AZs in the DB subnet
  # group so AWS can place the primary and standby in eligible zones.
  azs = slice(data.aws_availability_zones.available.names, 0, 3)

  subnet_layout = {
    public_a  = { az = local.azs[0], index = 0 }
    public_b  = { az = local.azs[1], index = 1 }
    public_c  = { az = local.azs[2], index = 4 }
    private_a = { az = local.azs[0], index = 2 }
    private_b = { az = local.azs[1], index = 3 }
    private_c = { az = local.azs[2], index = 5 }
  }

}

data "aws_availability_zones" "available" {
  state = "available"
}
