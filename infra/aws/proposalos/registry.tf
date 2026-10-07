resource "aws_ecs_cluster" "staging" {
  name = local.prefix
  tags = { Name = local.prefix }
}

resource "aws_ecr_repository" "service" {
  for_each = toset(["proposal-engine", "claraud-web", "migration-importer"])

  name                 = "${local.prefix}-${each.value}"
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }

  tags = { Name = "${local.prefix}-${each.value}" }
}

resource "aws_ecr_lifecycle_policy" "service" {
  for_each   = aws_ecr_repository.service
  repository = each.value.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep the 20 newest immutable ProposalOS staging images."
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 20
      }
      action = { type = "expire" }
    }]
  })
}

resource "aws_cloudwatch_log_group" "service" {
  for_each          = toset(["api", "web", "audit-worker", "outreach-worker", "batch", "migration-importer"])
  name              = "/ecs/${local.prefix}/${each.value}"
  retention_in_days = 30
  tags              = { Name = "${local.prefix}-${each.value}" }
}

resource "aws_cloudwatch_log_group" "importer_build" {
  name              = "/aws/codebuild/${local.prefix}-importer-build"
  retention_in_days = 30
  tags              = { Name = "${local.prefix}-importer-build" }
}

resource "aws_cloudwatch_log_group" "app_build" {
  name              = "/aws/codebuild/${local.prefix}-app-build"
  retention_in_days = 30
  tags              = { Name = "${local.prefix}-app-build" }
}
