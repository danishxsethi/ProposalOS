resource "aws_db_subnet_group" "production" {
  name        = "${local.prefix}-db"
  subnet_ids  = [for subnet in aws_subnet.private : subnet.id]
  description = "Private subnets for ProposalOS production PostgreSQL."
  tags        = { Name = "${local.prefix}-db" }
}

resource "aws_db_parameter_group" "production" {
  name        = "${local.prefix}-postgres15"
  family      = "postgres15"
  description = "ProposalOS PostgreSQL 15 TLS and diagnostic settings."
  tags        = { Name = "${local.prefix}-postgres15" }

  parameter {
    name         = "rds.force_ssl"
    value        = "1"
    apply_method = "pending-reboot"
  }

  parameter {
    name         = "log_connections"
    value        = "1"
    apply_method = "immediate"
  }

  parameter {
    name         = "log_disconnections"
    value        = "1"
    apply_method = "immediate"
  }

  parameter {
    name         = "log_lock_waits"
    value        = "1"
    apply_method = "immediate"
  }

  parameter {
    name         = "log_min_duration_statement"
    value        = "1000"
    apply_method = "immediate"
  }

  parameter {
    name         = "log_statement"
    value        = "ddl"
    apply_method = "immediate"
  }

  parameter {
    name         = "log_min_error_statement"
    value        = "error"
    apply_method = "immediate"
  }
}

resource "aws_db_instance" "production" {
  identifier                          = "${local.prefix}-db"
  engine                              = "postgres"
  engine_version                      = var.postgres_engine_version
  instance_class                      = var.postgres_instance_class
  db_name                             = "proposal_engine"
  username                            = "proposalos_master"
  manage_master_user_password         = true
  allocated_storage                   = var.postgres_allocated_storage_gb
  max_allocated_storage               = var.postgres_max_allocated_storage_gb
  storage_type                        = "gp3"
  storage_encrypted                   = true
  auto_minor_version_upgrade          = true
  allow_major_version_upgrade         = false
  backup_retention_period             = 7
  backup_window                       = "04:00-05:00"
  maintenance_window                  = "sun:05:00-sun:06:00"
  db_subnet_group_name                = aws_db_subnet_group.production.name
  parameter_group_name                = aws_db_parameter_group.production.name
  vpc_security_group_ids              = [aws_security_group.database.id]
  publicly_accessible                 = false
  multi_az                            = var.postgres_multi_az
  deletion_protection                 = true
  skip_final_snapshot                 = false
  final_snapshot_identifier           = "proposalos-production-final"
  copy_tags_to_snapshot               = true
  enabled_cloudwatch_logs_exports     = ["postgresql", "upgrade"]
  performance_insights_enabled        = false
  iam_database_authentication_enabled = false
  apply_immediately                   = false

  tags = { Name = "${local.prefix}-db" }
}

resource "aws_cloudwatch_log_group" "postgresql" {
  name              = "/aws/rds/instance/${aws_db_instance.production.identifier}/postgresql"
  retention_in_days = 30
  tags              = { Name = "${local.prefix}-postgresql" }
}

resource "aws_cloudwatch_log_group" "postgresql_upgrade" {
  name              = "/aws/rds/instance/${aws_db_instance.production.identifier}/upgrade"
  retention_in_days = 30
  tags              = { Name = "${local.prefix}-postgresql-upgrade" }
}
