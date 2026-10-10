locals {
  github_actions_main_subjects = [
    "repo:Danish-Sethi@324834111/ProposalOS@1158247398:ref:refs/heads/main"
  ]
}

resource "aws_iam_openid_connect_provider" "github_actions" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
  tags           = merge(local.common_tags, { Name = "proposalos-github-actions" })
}

resource "aws_iam_role" "github_actions_production_deploy" {
  name                 = "ProposalOSGitHubActionsProductionDeploy"
  description          = "GitHub main can publish immutable ProposalOS images and deploy the production ECS services."
  max_session_duration = 3600
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = aws_iam_openid_connect_provider.github_actions.arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          "token.actions.githubusercontent.com:sub" = local.github_actions_main_subjects
        }
      }
    }]
  })
  tags = merge(local.common_tags, { Name = "proposalos-github-actions-production-deploy" })
}

resource "aws_iam_role_policy" "github_actions_production_deploy" {
  name = "ProposalOSProductionImageAndEcsDeploy"
  role = aws_iam_role.github_actions_production_deploy.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "EcrLogin"
        Effect   = "Allow"
        Action   = ["ecr:GetAuthorizationToken"]
        Resource = "*"
      },
      {
        Sid    = "PublishAndReadOnlyProductionImages"
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:CompleteLayerUpload",
          "ecr:DescribeImages",
          "ecr:GetDownloadUrlForLayer",
          "ecr:InitiateLayerUpload",
          "ecr:PutImage",
          "ecr:UploadLayerPart",
          "ecr:BatchGetImage"
        ]
        Resource = [for name in ["proposalos-production-proposal-engine", "proposalos-production-claraud-web", "proposalos-production-migration-importer"] : "arn:aws:ecr:${var.aws_region}:${var.aws_account_id}:repository/${name}"]
      },
      {
        Sid      = "RegisterTaskDefinitions"
        Effect   = "Allow"
        Action   = ["ecs:RegisterTaskDefinition"]
        Resource = "*"
      },
      {
        Sid      = "ReadAndTagOnlyProductionTaskDefinitions"
        Effect   = "Allow"
        Action   = ["ecs:DescribeTaskDefinition", "ecs:TagResource"]
        Resource = "arn:aws:ecs:${var.aws_region}:${var.aws_account_id}:task-definition/proposalos-production-*:*"
      },
      {
        Sid      = "DescribeProductionCluster"
        Effect   = "Allow"
        Action   = ["ecs:DescribeClusters"]
        Resource = aws_ecs_cluster.production.arn
      },
      {
        Sid      = "DescribeAndUpdateProductionServices"
        Effect   = "Allow"
        Action   = ["ecs:DescribeServices", "ecs:UpdateService"]
        Resource = [aws_ecs_service.api.arn, aws_ecs_service.web.arn]
      },
      {
        Sid      = "RunSchemaMigrationTask"
        Effect   = "Allow"
        Action   = ["ecs:RunTask"]
        Resource = "arn:aws:ecs:${var.aws_region}:${var.aws_account_id}:task-definition/proposalos-production-schema-migrator:*"
        Condition = {
          ArnEquals = { "ecs:cluster" = aws_ecs_cluster.production.arn }
        }
      },
      {
        Sid      = "InspectAndStopProductionTasks"
        Effect   = "Allow"
        Action   = ["ecs:DescribeTasks", "ecs:StopTask"]
        Resource = "arn:aws:ecs:${var.aws_region}:${var.aws_account_id}:task/${aws_ecs_cluster.production.name}/*"
        Condition = {
          ArnEquals = { "ecs:cluster" = aws_ecs_cluster.production.arn }
        }
      },
      {
        Sid      = "ListProductionTasks"
        Effect   = "Allow"
        Action   = ["ecs:ListTasks"]
        Resource = "*"
        Condition = {
          ArnEquals = { "ecs:cluster" = aws_ecs_cluster.production.arn }
        }
      },
      {
        Sid      = "ReadProductionDatabaseEndpointMetadata"
        Effect   = "Allow"
        Action   = ["rds:DescribeDBInstances"]
        Resource = "*"
      },
      {
        Sid      = "ReadMigrationTaskLogs"
        Effect   = "Allow"
        Action   = ["logs:DescribeLogStreams", "logs:GetLogEvents"]
        Resource = "${aws_cloudwatch_log_group.service["migration-importer"].arn}:*"
      },
      {
        Sid    = "PassOnlyProposalOsProductionTaskRoles"
        Effect = "Allow"
        Action = ["iam:PassRole"]
        Resource = [
          aws_iam_role.api_task.arn,
          aws_iam_role.api_execution.arn,
          aws_iam_role.web_task.arn,
          aws_iam_role.web_execution.arn,
          aws_iam_role.production_schema_migrator_execution.arn
        ]
        Condition = {
          StringEquals = { "iam:PassedToService" = "ecs-tasks.amazonaws.com" }
        }
      }
    ]
  })
}

output "github_actions_production_deploy_role_arn" {
  value       = aws_iam_role.github_actions_production_deploy.arn
  description = "OIDC role restricted to GitHub main for immutable image publishing and ProposalOS production ECS deployment."
}
