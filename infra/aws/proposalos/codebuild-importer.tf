locals {
  importer_build_trust = {
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "codebuild.amazonaws.com" }
      Action    = "sts:AssumeRole"
      Condition = {
        StringEquals = { "aws:SourceAccount" = var.aws_account_id }
        ArnLike      = { "aws:SourceArn" = "arn:aws:codebuild:${var.aws_region}:${var.aws_account_id}:project/proposalos-staging-*" }
      }
    }]
  }
}

resource "aws_iam_role" "importer_build" {
  name                 = "ProposalOSStagingImporterBuildRole"
  description          = "Builds the single-purpose database importer image and pushes it to ProposalOS staging ECR."
  assume_role_policy   = jsonencode(local.importer_build_trust)
  permissions_boundary = "arn:aws:iam::${var.aws_account_id}:policy/ProposalOSServiceRoleBoundary"

  tags = {
    Project  = local.project
    RoleType = "build"
  }
}

resource "aws_iam_role_policy" "importer_build" {
  name = "BuildAndPushOnlyMigrationImporter"
  role = aws_iam_role.importer_build.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "ReadTemporaryBuildContext"
        Effect   = "Allow"
        Action   = ["s3:GetObject"]
        Resource = "arn:aws:s3:::${aws_s3_bucket.data.bucket}/${var.migration_build_source_key}"
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
        Sid    = "PushImporterImageOnly"
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:CompleteLayerUpload",
          "ecr:InitiateLayerUpload",
          "ecr:PutImage",
          "ecr:UploadLayerPart"
        ]
        Resource = aws_ecr_repository.service["migration-importer"].arn
      },
      {
        Sid      = "WriteImporterBuildLogs"
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.importer_build.arn}:*"
      }
    ]
  })
}

resource "aws_codebuild_project" "importer_build" {
  name           = "${local.prefix}-importer-build"
  description    = "One-time build for the scoped ProposalOS staging SQL importer image."
  service_role   = aws_iam_role.importer_build.arn
  build_timeout  = 15
  queued_timeout = 30

  source {
    type      = "S3"
    location  = "${aws_s3_bucket.data.bucket}/${var.migration_build_source_key}"
    buildspec = <<-YAML
      version: 0.2
      phases:
        pre_build:
          commands:
            - aws ecr get-login-password --region "$AWS_DEFAULT_REGION" | docker login --username AWS --password-stdin "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com"
        build:
          commands:
            - docker build --pull -f Dockerfile.importer -t "$IMAGE_REPOSITORY:$IMAGE_TAG" .
            - docker push "$IMAGE_REPOSITORY:$IMAGE_TAG"
    YAML
  }

  artifacts {
    type = "NO_ARTIFACTS"
  }

  environment {
    type                        = "LINUX_CONTAINER"
    compute_type                = "BUILD_GENERAL1_SMALL"
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
      name  = "IMAGE_REPOSITORY"
      value = aws_ecr_repository.service["migration-importer"].repository_url
    }
    environment_variable {
      name  = "IMAGE_TAG"
      value = var.migration_importer_image_tag
    }
  }

  logs_config {
    cloudwatch_logs {
      group_name  = aws_cloudwatch_log_group.importer_build.name
      stream_name = "build"
      status      = "ENABLED"
    }
  }

  tags = merge(local.common_tags, { Name = "${local.prefix}-importer-build" })
}
