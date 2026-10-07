locals {
  ecs_task_trust = {
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
      Condition = {
        StringEquals = { "aws:SourceAccount" = var.aws_account_id }
        ArnLike      = { "aws:SourceArn" = "arn:aws:ecs:${var.aws_region}:${var.aws_account_id}:*" }
      }
    }]
  }
}

resource "aws_iam_role" "migration_importer_task" {
  count                = var.enable_migration_importer ? 1 : 0
  name                 = "ProposalOSProductionImporterTaskRole"
  description          = "One-shot production database importer; reads only the selected SQL export."
  assume_role_policy   = jsonencode(local.ecs_task_trust)
  permissions_boundary = "arn:aws:iam::${var.aws_account_id}:policy/ProposalOSServiceRoleBoundary"

  tags = {
    Project  = local.project
    RoleType = "importer"
  }
}

resource "aws_iam_role_policy" "migration_importer_task" {
  count = var.enable_migration_importer ? 1 : 0
  name  = "ProductionImportAndAppRoleBootstrap"
  role  = aws_iam_role.migration_importer_task[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "ReadSelectedExportObject"
        Effect   = "Allow"
        Action   = ["s3:GetObject"]
        Resource = "arn:aws:s3:::${var.migration_export_bucket}/${var.migration_export_key}"
      },
      {
        Sid      = "LocateSelectedExportBucket"
        Effect   = "Allow"
        Action   = ["s3:GetBucketLocation"]
        Resource = "arn:aws:s3:::${var.migration_export_bucket}"
      },
      {
        Sid      = "WriteOnlyProductionAppDatabaseUrl"
        Effect   = "Allow"
        Action   = ["secretsmanager:PutSecretValue"]
        Resource = aws_secretsmanager_secret.production_database_url.arn
      }
    ]
  })
}

resource "aws_iam_role" "migration_importer_execution" {
  count                = var.enable_migration_importer ? 1 : 0
  name                 = "ProposalOSProductionImporterExecutionRole"
  description          = "ECS image pull, log delivery, and production DB secret injection for the one-shot importer."
  assume_role_policy   = jsonencode(local.ecs_task_trust)
  permissions_boundary = "arn:aws:iam::${var.aws_account_id}:policy/ProposalOSServiceRoleBoundary"

  tags = {
    Project  = local.project
    RoleType = "importer"
  }
}

resource "aws_iam_role_policy_attachment" "migration_importer_execution" {
  count      = var.enable_migration_importer ? 1 : 0
  role       = aws_iam_role.migration_importer_execution[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "migration_importer_execution" {
  count = var.enable_migration_importer ? 1 : 0
  name  = "ReadProductionRDSMasterSecret"
  role  = aws_iam_role.migration_importer_execution[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue"]
      Resource = aws_db_instance.production.master_user_secret[0].secret_arn
    }]
  })
}

resource "aws_ecs_task_definition" "migration_importer" {
  count                    = var.enable_migration_importer ? 1 : 0
  family                   = "proposalos-production-migration-importer"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512
  memory                   = 1024
  # Preserve immutable revisions for rollback without granting account-wide deregistration rights.
  skip_destroy       = true
  execution_role_arn = aws_iam_role.migration_importer_execution[0].arn
  task_role_arn      = aws_iam_role.migration_importer_task[0].arn

  container_definitions = jsonencode([{
    name      = "database-import"
    image     = "${aws_ecr_repository.service["migration-importer"].repository_url}:${var.migration_importer_task_image_tag}"
    essential = true
    environment = [
      { name = "AWS_REGION", value = var.aws_region },
      { name = "EXPECTED_AWS_ACCOUNT_ID", value = var.aws_account_id },
      { name = "EXPECTED_RDS_IDENTIFIER", value = aws_db_instance.production.identifier },
      { name = "MIGRATION_EXPORT_BUCKET", value = var.migration_export_bucket },
      { name = "MIGRATION_EXPORT_KEY", value = var.migration_export_key },
      { name = "MIGRATION_EXPORT_ETAG", value = var.migration_export_etag },
      { name = "MIGRATION_EXPORT_SIZE_BYTES", value = tostring(var.migration_export_size_bytes) },
      { name = "TARGET_DATABASE", value = "proposal_engine" },
      { name = "DATABASE_URL_SECRET_ARN", value = aws_secretsmanager_secret.production_database_url.arn },
      { name = "RDS_ENDPOINT", value = aws_db_instance.production.address },
      { name = "RDS_PORT", value = tostring(aws_db_instance.production.port) }
    ]
    secrets = [{
      name      = "RDS_MASTER_SECRET_JSON"
      valueFrom = aws_db_instance.production.master_user_secret[0].secret_arn
    }]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.service["migration-importer"].name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "task"
      }
    }
    readonlyRootFilesystem = false
    linuxParameters = {
      initProcessEnabled = true
    }
  }])

  tags       = merge(local.common_tags, { Name = "proposalos-production-migration-importer" })
  depends_on = [aws_iam_role_policy_attachment.migration_importer_execution]
}
