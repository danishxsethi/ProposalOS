resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = { Name = local.prefix }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${local.prefix}-igw" }
}

# One shared NAT keeps production tasks in private subnets while allowing them
# to reach ECR, Secrets Manager, Bedrock, Stripe, and email/API providers.
# A single gateway is the lowest fixed-cost option; it is an egress AZ dependency.
resource "aws_eip" "production_nat" {
  domain = "vpc"
  tags   = { Name = "${local.prefix}-nat" }
}

resource "aws_nat_gateway" "production" {
  allocation_id = aws_eip.production_nat.id
  subnet_id     = aws_subnet.public["public_a"].id
  depends_on    = [aws_internet_gateway.main, aws_route.public_default, aws_route_table_association.public["public_a"]]
  tags          = { Name = "${local.prefix}-nat" }
}

resource "aws_subnet" "public" {
  for_each = {
    public_a = local.subnet_layout.public_a
    public_b = local.subnet_layout.public_b
    public_c = local.subnet_layout.public_c
  }

  vpc_id                  = aws_vpc.main.id
  availability_zone       = each.value.az
  cidr_block              = cidrsubnet(var.vpc_cidr, 4, each.value.index)
  map_public_ip_on_launch = true
  tags                    = { Name = "${local.prefix}-${each.key}" }
}

resource "aws_subnet" "private" {
  for_each = {
    private_a = local.subnet_layout.private_a
    private_b = local.subnet_layout.private_b
    private_c = local.subnet_layout.private_c
  }

  vpc_id                  = aws_vpc.main.id
  availability_zone       = each.value.az
  cidr_block              = cidrsubnet(var.vpc_cidr, 4, each.value.index)
  map_public_ip_on_launch = false
  tags                    = { Name = "${local.prefix}-${each.key}" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${local.prefix}-public" }
}

resource "aws_route" "public_default" {
  route_table_id         = aws_route_table.public.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.main.id
}

resource "aws_route_table_association" "public" {
  for_each = aws_subnet.public

  subnet_id      = each.value.id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${local.prefix}-private" }
}

resource "aws_route_table_association" "private" {
  for_each = aws_subnet.private

  subnet_id      = each.value.id
  route_table_id = aws_route_table.private.id
}

resource "aws_route" "private_default" {
  route_table_id         = aws_route_table.private.id
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = aws_nat_gateway.production.id
}

# The S3 gateway endpoint is free and lets the importer fetch the verified SQL
# exports without sending that traffic through a NAT gateway or public internet.
resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${var.aws_region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [aws_route_table.public.id, aws_route_table.private.id]

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "GetMigrationExportBucketLocation"
        Effect    = "Allow"
        Principal = "*"
        Action    = ["s3:GetBucketLocation"]
        Resource  = "arn:aws:s3:::proposalos-migration-410432886960-20261003"
      },
      {
        Sid       = "ReadCandidateMigrationExportOnly"
        Effect    = "Allow"
        Principal = "*"
        Action    = ["s3:GetObject"]
        Resource  = var.enable_migration_importer ? "arn:aws:s3:::${var.migration_export_bucket}/${var.migration_export_key}" : "arn:aws:s3:::${var.migration_export_bucket}/disabled/*"
      },
      {
        Sid       = "ReadECRImageLayersFromRegionalServiceBucket"
        Effect    = "Allow"
        Principal = "*"
        Action    = ["s3:GetObject"]
        Resource  = "arn:aws:s3:::prod-${var.aws_region}-starport-layer-bucket/*"
      },
      {
        Sid       = "AccessProposalOSDataBuckets"
        Effect    = "Allow"
        Principal = "*"
        Action    = ["s3:ListBucket", "s3:GetBucketLocation"]
        Resource  = "arn:aws:s3:::proposalos-data-*"
      },
      {
        Sid       = "AccessProposalOSDataObjects"
        Effect    = "Allow"
        Principal = "*"
        Action    = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:GetObjectAttributes"]
        Resource = [
          "arn:aws:s3:::proposalos-data-*/*"
        ]
      }
    ]
  })

  tags = { Name = "${local.prefix}-s3" }
}

resource "aws_security_group" "app_tasks" {
  name        = "${local.prefix}-app-tasks"
  description = "ECS tasks have outbound access only; ingress will be allowed only from the load balancer."
  vpc_id      = aws_vpc.main.id

  egress {
    description = "HTTPS to external APIs and AWS services."
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description     = "PostgreSQL over TLS to the private RDS instance."
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.database.id]
  }

  egress {
    description     = "TLS Redis to the private cache."
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.redis.id]
  }

  egress {
    description     = "Web-to-API calls and internal app URLs through the production ALB."
    from_port       = 80
    to_port         = 80
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  tags = { Name = "${local.prefix}-app-tasks" }
}

resource "aws_security_group" "import_task" {
  name        = "${local.prefix}-import-task"
  description = "One-shot database importer; no inbound network access."
  vpc_id      = aws_vpc.main.id

  egress {
    description = "HTTPS to ECR, Secrets Manager, and AWS task services."
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description     = "PostgreSQL over TLS to the private RDS instance."
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.database.id]
  }

  tags = { Name = "${local.prefix}-import-task" }
}

resource "aws_security_group" "database" {
  name        = "${local.prefix}-postgres"
  description = "Private PostgreSQL; accept TLS connections only from ProposalOS tasks."
  vpc_id      = aws_vpc.main.id
  egress      = []
  tags        = { Name = "${local.prefix}-postgres" }
}

resource "aws_security_group" "redis" {
  name        = "${local.prefix}-redis"
  description = "Private TLS Redis; accept connections only from ProposalOS app tasks."
  vpc_id      = aws_vpc.main.id
  egress      = []
  tags        = { Name = "${local.prefix}-redis" }
}

resource "aws_vpc_security_group_ingress_rule" "database_app" {
  security_group_id            = aws_security_group.database.id
  referenced_security_group_id = aws_security_group.app_tasks.id
  description                  = "App and worker tasks to PostgreSQL over TLS."
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  tags                         = local.common_tags
}

resource "aws_vpc_security_group_ingress_rule" "database_importer" {
  security_group_id            = aws_security_group.database.id
  referenced_security_group_id = aws_security_group.import_task.id
  description                  = "One-shot importer to PostgreSQL over TLS."
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  tags                         = local.common_tags
}

resource "aws_vpc_security_group_ingress_rule" "redis_app" {
  security_group_id            = aws_security_group.redis.id
  referenced_security_group_id = aws_security_group.app_tasks.id
  description                  = "App and worker tasks to Redis over TLS."
  ip_protocol                  = "tcp"
  from_port                    = 6379
  to_port                      = 6379
  tags                         = local.common_tags
}
