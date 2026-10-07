locals {
  api_secret_names = toset([
    "ADMIN_SECRET",
    "API_KEY",
    "AUDIT_TRAIL_ENCRYPTION_KEY",
    "CRON_SECRET",
    "FIELD_ENCRYPTION_KEY_ID",
    "FIELD_ENCRYPTION_PRIMARY_KEY",
    "INTERNAL_OPS_KEY",
    "NEXTAUTH_SECRET",
    "RESEND_API_KEY",
    "SERP_API_KEY",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "WORKER_SECRET"
  ])
}

resource "aws_iam_role" "api_task" {
  name                 = "ProposalOSProductionApiTaskRole"
  description          = "Production API task role with access only to the ProposalOS production data bucket."
  assume_role_policy   = jsonencode(local.ecs_task_trust)
  permissions_boundary = "arn:aws:iam::${var.aws_account_id}:policy/ProposalOSServiceRoleBoundary"
  tags                 = { Project = local.project, RoleType = "api" }
}

resource "aws_iam_role_policy" "api_task_storage" {
  name = "ProposalOSProductionDataBucketAccess"
  role = aws_iam_role.api_task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:ListBucket", "s3:GetBucketLocation"]
        Resource = aws_s3_bucket.data.arn
      },
      {
        Effect = "Allow"
        Action = [
          "s3:AbortMultipartUpload",
          "s3:DeleteObject",
          "s3:GetObject",
          "s3:PutObject",
          "s3:PutObjectTagging"
        ]
        Resource = "${aws_s3_bucket.data.arn}/*"
      }
    ]
  })
}

resource "aws_iam_role_policy" "api_task_bedrock" {
  count = var.enable_bedrock ? 1 : 0
  name  = "ProposalOSProductionBedrockInvokeNova"
  role  = aws_iam_role.api_task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"]
        Resource = concat(
          [
            "arn:aws:bedrock:${var.aws_region}:${var.aws_account_id}:inference-profile/us.amazon.nova-micro-v1:0",
            "arn:aws:bedrock:${var.aws_region}:${var.aws_account_id}:inference-profile/us.amazon.nova-2-lite-v1:0"
          ],
          [for region in ["us-east-1", "us-east-2", "us-west-2"] : "arn:aws:bedrock:${region}::foundation-model/amazon.nova-micro-v1:0"],
          [for region in ["us-east-1", "us-east-2", "us-west-2"] : "arn:aws:bedrock:${region}::foundation-model/amazon.nova-2-lite-v1:0"]
        )
      },
      {
        Effect = "Allow"
        Action = ["bedrock:GetInferenceProfile"]
        Resource = [
          "arn:aws:bedrock:${var.aws_region}:${var.aws_account_id}:inference-profile/us.amazon.nova-micro-v1:0",
          "arn:aws:bedrock:${var.aws_region}:${var.aws_account_id}:inference-profile/us.amazon.nova-2-lite-v1:0"
        ]
      }
    ]
  })
}

resource "aws_iam_role" "api_execution" {
  name                 = "ProposalOSProductionApiExecutionRole"
  description          = "ECS image pull, log delivery, and production API secret injection."
  assume_role_policy   = jsonencode(local.ecs_task_trust)
  permissions_boundary = "arn:aws:iam::${var.aws_account_id}:policy/ProposalOSServiceRoleBoundary"
  tags                 = { Project = local.project, RoleType = "api" }
}

resource "aws_iam_role_policy_attachment" "api_execution" {
  role       = aws_iam_role.api_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "api_execution_secrets" {
  name = "ReadProductionApiSecrets"
  role = aws_iam_role.api_execution.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = ["secretsmanager:GetSecretValue"]
      Resource = concat(
        [aws_secretsmanager_secret.production_database_url.arn, aws_secretsmanager_secret.redis_url.arn],
        [for name in local.api_secret_names : aws_secretsmanager_secret.production_runtime[name].arn]
      )
    }]
  })
}

resource "aws_iam_role" "web_task" {
  name                 = "ProposalOSProductionWebTaskRole"
  description          = "Production web task role with no direct AWS permissions."
  assume_role_policy   = jsonencode(local.ecs_task_trust)
  permissions_boundary = "arn:aws:iam::${var.aws_account_id}:policy/ProposalOSServiceRoleBoundary"
  tags                 = { Project = local.project, RoleType = "api" }
}

resource "aws_iam_role" "web_execution" {
  name                 = "ProposalOSProductionWebExecutionRole"
  description          = "ECS image pull, log delivery, and production web authentication/API secret injection."
  assume_role_policy   = jsonencode(local.ecs_task_trust)
  permissions_boundary = "arn:aws:iam::${var.aws_account_id}:policy/ProposalOSServiceRoleBoundary"
  tags                 = { Project = local.project, RoleType = "api" }
}

resource "aws_iam_role_policy_attachment" "web_execution" {
  role       = aws_iam_role.web_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "web_execution_secrets" {
  name = "ReadProductionWebSecrets"
  role = aws_iam_role.web_execution.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = ["secretsmanager:GetSecretValue"]
      Resource = [
        aws_secretsmanager_secret.production_runtime["NEXTAUTH_SECRET"].arn,
        aws_secretsmanager_secret.production_runtime["API_KEY"].arn,
        aws_secretsmanager_secret.production_runtime["INTERNAL_OPS_KEY"].arn
      ]
    }]
  })
}

resource "aws_ecs_task_definition" "api" {
  family                   = "${local.prefix}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512
  memory                   = 1024
  skip_destroy             = true
  execution_role_arn       = aws_iam_role.api_execution.arn
  task_role_arn            = aws_iam_role.api_task.arn

  container_definitions = jsonencode([{
    name      = "api"
    image     = "${aws_ecr_repository.service["proposal-engine"].repository_url}:${var.app_image_tag}"
    essential = true
    cpu       = 512
    memory    = 1024
    portMappings = [{
      containerPort = 8080
      hostPort      = 8080
      protocol      = "tcp"
    }]
    environment = [
      { name = "AWS_REGION", value = var.aws_region },
      { name = "LLM_PRIMARY_PROVIDER", value = "bedrock" },
      { name = "BEDROCK_ENABLED", value = tostring(var.enable_bedrock) },
      { name = "BEDROCK_FAST_MODEL_ID", value = "us.amazon.nova-micro-v1:0" },
      { name = "BEDROCK_MODEL_ID", value = "us.amazon.nova-2-lite-v1:0" },
      { name = "BEDROCK_VISION_MODEL_ID", value = "us.amazon.nova-2-lite-v1:0" },
      { name = "PROPOSALOS_DATA_BUCKET", value = aws_s3_bucket.data.bucket },
      { name = "FROM_EMAIL", value = var.from_email },
      { name = "BILLING_LIVE_MODE", value = tostring(var.billing_live_mode) },
      { name = "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", value = var.stripe_publishable_key },
      { name = "STRIPE_PRICE_ID_STARTER_LIVE", value = var.stripe_price_id_starter_live },
      { name = "STRIPE_PRODUCT_ID_STARTER_LIVE", value = var.stripe_product_id_starter_live },
      { name = "DEFAULT_TENANT_ID", value = var.default_tenant_id },
      { name = "NEXTAUTH_URL", value = var.production_app_url },
      { name = "AUTH_TRUST_HOST", value = "true" },
      { name = "BASE_URL", value = var.production_app_url },
      { name = "NEXT_PUBLIC_APP_URL", value = var.production_app_url },
      { name = "NEXT_PUBLIC_BASE_URL", value = var.production_app_url },
      { name = "NEXT_PUBLIC_APP_VERSION", value = var.app_image_tag },
      { name = "SHARED_STORE_REQUIRED", value = "true" },
      { name = "WORKER_DISPATCH_URL", value = var.enable_audit_worker_dispatch ? "${trimsuffix(var.production_app_url, "/")}/api/worker/audit-job" : "" }
    ]
    secrets = concat(
      [
        { name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret.production_database_url.arn },
        { name = "REDIS_URL", valueFrom = aws_secretsmanager_secret.redis_url.arn }
      ],
      [for name in local.api_secret_names : { name = name, valueFrom = aws_secretsmanager_secret.production_runtime[name].arn }]
    )
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.service["api"].name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "task"
      }
    }
    readonlyRootFilesystem = false
    linuxParameters        = { initProcessEnabled = true }
  }])

  tags       = merge(local.common_tags, { Name = "${local.prefix}-api" })
  depends_on = [aws_iam_role_policy_attachment.api_execution]
}

resource "aws_ecs_task_definition" "web" {
  family                   = "${local.prefix}-web"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512
  memory                   = 1024
  skip_destroy             = true
  execution_role_arn       = aws_iam_role.web_execution.arn
  task_role_arn            = aws_iam_role.web_task.arn

  container_definitions = jsonencode([{
    name      = "web"
    image     = "${aws_ecr_repository.service["claraud-web"].repository_url}:${var.app_image_tag}"
    essential = true
    cpu       = 512
    memory    = 1024
    portMappings = [{
      containerPort = 3000
      hostPort      = 3000
      protocol      = "tcp"
    }]
    environment = [
      { name = "NEXTAUTH_URL", value = var.production_app_url },
      { name = "AUTH_TRUST_HOST", value = "true" },
      { name = "BILLING_LIVE_MODE", value = tostring(var.billing_live_mode) },
      { name = "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", value = var.stripe_publishable_key },
      { name = "STRIPE_PRICE_ID_STARTER_LIVE", value = var.stripe_price_id_starter_live },
      { name = "STRIPE_PRODUCT_ID_STARTER_LIVE", value = var.stripe_product_id_starter_live },
      { name = "DEFAULT_TENANT_ID", value = var.default_tenant_id },
      { name = "NEXT_PUBLIC_APP_URL", value = var.production_app_url },
      { name = "NEXT_PUBLIC_BASE_URL", value = var.production_app_url },
      { name = "PROPOSAL_ENGINE_API_URL", value = var.production_app_url }
    ]
    secrets = [
      { name = "NEXTAUTH_SECRET", valueFrom = aws_secretsmanager_secret.production_runtime["NEXTAUTH_SECRET"].arn },
      { name = "PROPOSAL_ENGINE_API_KEY", valueFrom = aws_secretsmanager_secret.production_runtime["API_KEY"].arn },
      { name = "INTERNAL_OPS_KEY", valueFrom = aws_secretsmanager_secret.production_runtime["INTERNAL_OPS_KEY"].arn }
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.service["web"].name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "task"
      }
    }
    readonlyRootFilesystem = false
    linuxParameters        = { initProcessEnabled = true }
  }])

  tags       = merge(local.common_tags, { Name = "${local.prefix}-web" })
  depends_on = [aws_iam_role_policy_attachment.web_execution]
}

resource "aws_ecs_service" "api" {
  name            = "${local.prefix}-api"
  cluster         = aws_ecs_cluster.production.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = var.enable_production_app_services ? var.app_desired_count : 0
  launch_type     = "FARGATE"

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  deployment_maximum_percent         = 200
  deployment_minimum_healthy_percent = 0
  health_check_grace_period_seconds  = 120

  network_configuration {
    subnets          = values(aws_subnet.public)[*].id
    security_groups  = [aws_security_group.app_tasks.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = 8080
  }

  propagate_tags = "SERVICE"
  tags           = merge(local.common_tags, { Name = "${local.prefix}-api" })

  depends_on = [aws_lb_listener.http, aws_iam_role_policy.api_task_storage]
}

resource "aws_ecs_service" "web" {
  name            = "${local.prefix}-web"
  cluster         = aws_ecs_cluster.production.id
  task_definition = aws_ecs_task_definition.web.arn
  desired_count   = var.enable_production_app_services ? var.app_desired_count : 0
  launch_type     = "FARGATE"

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  deployment_maximum_percent         = 200
  deployment_minimum_healthy_percent = 0
  health_check_grace_period_seconds  = 120

  network_configuration {
    subnets          = values(aws_subnet.public)[*].id
    security_groups  = [aws_security_group.app_tasks.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.web.arn
    container_name   = "web"
    container_port   = 3000
  }

  propagate_tags = "SERVICE"
  tags           = merge(local.common_tags, { Name = "${local.prefix}-web" })

  depends_on = [aws_lb_listener.http]
}
