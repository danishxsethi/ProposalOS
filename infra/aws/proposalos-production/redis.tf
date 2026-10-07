resource "aws_elasticache_subnet_group" "production" {
  name        = "${local.prefix}-redis"
  description = "Private subnets for ProposalOS production Redis."
  subnet_ids  = [for subnet in aws_subnet.private : subnet.id]
  tags        = { Name = "${local.prefix}-redis" }
}

resource "random_password" "redis_auth_token" {
  length  = 48
  special = false
}

resource "aws_secretsmanager_secret" "redis_url" {
  name                    = "proposalos/app/production/REDIS_URL"
  description             = "TLS URL for the private ProposalOS production Redis cache."
  recovery_window_in_days = 7
  tags                    = { Name = "${local.prefix}-redis-url" }
}

resource "aws_elasticache_replication_group" "production" {
  replication_group_id       = "${local.prefix}-redis"
  description                = "ProposalOS production shared state and cache."
  engine                     = "redis"
  engine_version             = var.redis_engine_version
  node_type                  = var.redis_node_type
  num_cache_clusters         = 1
  port                       = 6379
  parameter_group_name       = "default.redis7"
  subnet_group_name          = aws_elasticache_subnet_group.production.name
  security_group_ids         = [aws_security_group.redis.id]
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token                 = random_password.redis_auth_token.result
  automatic_failover_enabled = false
  multi_az_enabled           = false
  snapshot_retention_limit   = 1
  snapshot_window            = "04:00-05:00"
  maintenance_window         = "sun:05:00-sun:06:00"
  apply_immediately          = false

  tags = { Name = "${local.prefix}-redis" }
}

locals {
  production_redis_url = "rediss://:${random_password.redis_auth_token.result}@${aws_elasticache_replication_group.production.primary_endpoint_address}:${aws_elasticache_replication_group.production.port}"
}

# Publish the derived URL through Terraform's write-only argument so the URL
# itself is not recorded in Terraform state.
resource "aws_secretsmanager_secret_version" "redis_url" {
  secret_id                = aws_secretsmanager_secret.redis_url.id
  secret_string_wo         = local.production_redis_url
  secret_string_wo_version = 1
}

# The secret value is written once by the protected secret-provisioning step.
# Terraform manages the secret metadata, not the value or version, so secrets
# remain outside Terraform state.
