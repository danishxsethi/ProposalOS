locals {
  app_build_trust = {
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "codebuild.amazonaws.com" }
      Action    = "sts:AssumeRole"
      Condition = {
        StringEquals = { "aws:SourceAccount" = var.aws_account_id }
        ArnLike      = { "aws:SourceArn" = "arn:aws:codebuild:${var.aws_region}:${var.aws_account_id}:project/${local.prefix}-*" }
      }
    }]
  }
}

resource "aws_iam_role" "app_build" {
  name                 = "ProposalOSProductionAppBuildRole"
  description          = "Builds the ProposalOS production API and web images and pushes only to their ECR repositories."
  assume_role_policy   = jsonencode(local.app_build_trust)
  permissions_boundary = "arn:aws:iam::${var.aws_account_id}:policy/ProposalOSServiceRoleBoundary"

  tags = {
    Project  = local.project
    RoleType = "build"
  }
}

resource "aws_iam_role_policy" "app_build" {
  name = "BuildAndPushProductionApiAndWeb"
  role = aws_iam_role.app_build.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "ReadTemporaryAppBuildContext"
        Effect   = "Allow"
        Action   = ["s3:GetObject"]
        Resource = "arn:aws:s3:::${aws_s3_bucket.data.bucket}/${var.app_build_source_key}"
      },
      {
        Sid      = "GetBuildContextBucketRegion"
        Effect   = "Allow"
        Action   = ["s3:GetBucketLocation"]
        Resource = aws_s3_bucket.data.arn
      },
      {
        Sid      = "AuthenticateToECR"
        Effect   = "Allow"
        Action   = ["ecr:GetAuthorizationToken"]
        Resource = "*"
      },
      {
        Sid    = "PushOnlyProductionApiAndWebImages"
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:CompleteLayerUpload",
          "ecr:InitiateLayerUpload",
          "ecr:PutImage",
          "ecr:UploadLayerPart"
        ]
        Resource = [
          aws_ecr_repository.service["proposal-engine"].arn,
          aws_ecr_repository.service["claraud-web"].arn
        ]
      },
      {
        Sid      = "WriteAppBuildLogs"
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.app_build.arn}:*"
      }
    ]
  })
}

resource "aws_codebuild_project" "app_build" {
  name           = "${local.prefix}-app-build"
  description    = "Builds the ProposalOS production API and Claraud web containers from one sanitized source context."
  service_role   = aws_iam_role.app_build.arn
  build_timeout  = 45
  queued_timeout = 30

  source {
    type      = "S3"
    location  = "${aws_s3_bucket.data.bucket}/${var.app_build_source_key}"
    buildspec = <<-YAML
      version: 0.2
      phases:
        pre_build:
          commands:
            - aws ecr get-login-password --region "$AWS_DEFAULT_REGION" | docker login --username AWS --password-stdin "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com"
        build:
          commands:
            - docker build --pull -f Dockerfile --build-arg NEXT_PUBLIC_APP_URL="$PRODUCTION_APP_URL" --build-arg NEXT_PUBLIC_BASE_URL="$PRODUCTION_APP_URL" --build-arg NEXT_PUBLIC_APP_VERSION="$IMAGE_TAG" --build-arg NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="$STRIPE_PUBLISHABLE_KEY" -t "$API_REPOSITORY:$IMAGE_TAG" .
            - docker push "$API_REPOSITORY:$IMAGE_TAG"
            - docker build --pull -f claraud-web/Dockerfile --build-arg NEXT_PUBLIC_APP_URL="$PRODUCTION_APP_URL" --build-arg NEXT_PUBLIC_BASE_URL="$PRODUCTION_APP_URL" --build-arg NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="$STRIPE_PUBLISHABLE_KEY" -t "$WEB_REPOSITORY:$IMAGE_TAG" .
            - docker push "$WEB_REPOSITORY:$IMAGE_TAG"
    YAML
  }

  artifacts {
    type = "NO_ARTIFACTS"
  }

  environment {
    type                        = "LINUX_CONTAINER"
    compute_type                = "BUILD_GENERAL1_MEDIUM"
    image                       = "aws/codebuild/standard:7.0"
    image_pull_credentials_type = "CODEBUILD"
    privileged_mode             = true

    environment_variable {
      name  = "AWS_ACCOUNT_ID"
      value = var.aws_account_id
    }
    environment_variable {
      name  = "AWS_DEFAULT_REGION"
      value = var.aws_region
    }
    environment_variable {
      name  = "API_REPOSITORY"
      value = aws_ecr_repository.service["proposal-engine"].repository_url
    }
    environment_variable {
      name  = "WEB_REPOSITORY"
      value = aws_ecr_repository.service["claraud-web"].repository_url
    }
    environment_variable {
      name  = "IMAGE_TAG"
      value = var.app_image_tag
    }
    environment_variable {
      name  = "PRODUCTION_APP_URL"
      value = var.production_app_url
    }
    environment_variable {
      name  = "STRIPE_PUBLISHABLE_KEY"
      value = var.stripe_publishable_key
    }
  }

  logs_config {
    cloudwatch_logs {
      group_name  = aws_cloudwatch_log_group.app_build.name
      stream_name = "build"
      status      = "ENABLED"
    }
  }

  tags = merge(local.common_tags, { Name = "${local.prefix}-app-build" })
}
