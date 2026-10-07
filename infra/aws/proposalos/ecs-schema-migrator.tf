resource "aws_iam_role" "schema_migrator_task" {
  name                 = "ProposalOSStagingSchemaMigratorTaskRole"
  description          = "No-permission task role for the one-shot staging Prisma migrator."
  assume_role_policy   = jsonencode(local.ecs_task_trust)
  permissions_boundary = "arn:aws:iam::${var.aws_account_id}:policy/ProposalOSServiceRoleBoundary"

  tags = {
    Project  = local.project
    RoleType = "task"
  }
}

resource "aws_ecs_task_definition" "schema_migrator" {
  family                   = "proposalos-staging-schema-migrator"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512
  memory                   = 1024
  skip_destroy             = true
  execution_role_arn       = aws_iam_role.migration_importer_execution.arn
  task_role_arn            = aws_iam_role.schema_migrator_task.arn

  container_definitions = jsonencode([{
    name      = "schema-migrate"
    image     = "${aws_ecr_repository.service["migration-importer"].repository_url}:${var.schema_migrator_image_tag}"
    essential = true
    environment = [
      { name = "RDS_ENDPOINT", value = local.staging_database_endpoint },
      { name = "RDS_PORT", value = local.staging_database_port },
      { name = "TARGET_DATABASE", value = "proposal_engine" }
    ]
    secrets = [{
      name      = "RDS_MASTER_SECRET_JSON"
      valueFrom = local.staging_database_master_secret_arn
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

  tags = merge(local.common_tags, { Name = "proposalos-staging-schema-migrator" })

  depends_on = [
    aws_iam_role_policy_attachment.migration_importer_execution,
    aws_iam_role_policy.migration_importer_execution
  ]
}
