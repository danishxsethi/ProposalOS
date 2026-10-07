resource "aws_iam_role" "production_schema_migrator_execution" {
  name                 = "ProposalOSProductionSchemaMigratorExecutionRole"
  description          = "ECS image pull, log delivery, and read-only injection of the production RDS master secret for Prisma migrations."
  assume_role_policy   = jsonencode(local.ecs_task_trust)
  permissions_boundary = "arn:aws:iam::${var.aws_account_id}:policy/ProposalOSServiceRoleBoundary"
  tags                 = { Project = local.project, RoleType = "importer" }
}

resource "aws_iam_role_policy_attachment" "production_schema_migrator_execution" {
  role       = aws_iam_role.production_schema_migrator_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "production_schema_migrator_execution" {
  name = "ReadProductionRdsMasterSecretForPrismaMigrations"
  role = aws_iam_role.production_schema_migrator_execution.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue"]
      Resource = aws_db_instance.production.master_user_secret[0].secret_arn
    }]
  })
}

output "production_schema_migrator_execution_role_arn" {
  value       = aws_iam_role.production_schema_migrator_execution.arn
  description = "Execution role for the one-shot, database-scoped production Prisma migration task."
}
