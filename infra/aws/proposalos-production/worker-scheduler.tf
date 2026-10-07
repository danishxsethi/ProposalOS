resource "aws_scheduler_schedule_group" "production" {
  name = "${local.prefix}-workers"
  tags = local.common_tags
}

resource "aws_iam_role" "audit_sweep_scheduler" {
  name        = "ProposalOSProductionAuditSweepScheduler"
  description = "Allows EventBridge Scheduler to start the bounded, on-demand audit queue sweep task."
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "scheduler.amazonaws.com" }
      Action    = "sts:AssumeRole"
      Condition = {
        StringEquals = {
          "aws:SourceAccount" = var.aws_account_id
          "aws:SourceArn"     = aws_scheduler_schedule_group.production.arn
        }
      }
    }]
  })
  permissions_boundary = "arn:aws:iam::${var.aws_account_id}:policy/ProposalOSServiceRoleBoundary"
  tags                 = merge(local.common_tags, { RoleType = "worker-scheduler" })
}

resource "aws_iam_role_policy" "audit_sweep_scheduler" {
  name = "RunProposalOSProductionAuditSweep"
  role = aws_iam_role.audit_sweep_scheduler.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "RunAuditSweepTask"
        Effect   = "Allow"
        Action   = ["ecs:RunTask"]
        Resource = aws_ecs_task_definition.api.arn
        Condition = {
          ArnEquals = { "ecs:cluster" = aws_ecs_cluster.production.arn }
        }
      },
      {
        Sid      = "TagAuditSweepTask"
        Effect   = "Allow"
        Action   = ["ecs:TagResource"]
        Resource = "arn:aws:ecs:${var.aws_region}:${var.aws_account_id}:task/${aws_ecs_cluster.production.name}/*"
        Condition = {
          StringEquals = { "ecs:CreateAction" = "RunTask" }
        }
      },
      {
        Sid      = "PassApiTaskRoles"
        Effect   = "Allow"
        Action   = ["iam:PassRole"]
        Resource = [aws_iam_role.api_execution.arn, aws_iam_role.api_task.arn]
        Condition = {
          StringEquals = { "iam:PassedToService" = "ecs-tasks.amazonaws.com" }
        }
      }
    ]
  })
}

resource "aws_scheduler_schedule" "audit_sweep" {
  name                         = "${local.prefix}-audit-sweep"
  group_name                   = aws_scheduler_schedule_group.production.name
  description                  = "Five-minute fallback poll for the PostgreSQL-backed AuditJob queue."
  schedule_expression          = "rate(5 minutes)"
  schedule_expression_timezone = "UTC"
  state                        = var.enable_audit_worker_dispatch ? "ENABLED" : "DISABLED"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = aws_ecs_cluster.production.arn
    role_arn = aws_iam_role.audit_sweep_scheduler.arn

    input = jsonencode({
      containerOverrides = [{
        name = "api"
        command = [
          "node",
          "-e",
          <<-JAVASCRIPT
              fetch(process.env.WORKER_DISPATCH_URL, {
                method: "POST",
                headers: {
                  authorization: "Bearer " + process.env.WORKER_SECRET,
                  "content-type": "application/json"
                },
                body: "{}"
              }).then(async (response) => {
                console.log(JSON.stringify({ status: response.status, traceId: response.headers.get("x-trace-id") }));
                if (!response.ok || response.status === 207) process.exitCode = 1;
              }).catch((error) => {
                console.error("audit queue sweep request failed", error.message);
                process.exit(1);
              });
            JAVASCRIPT
        ]
      }]
    })

    retry_policy {
      maximum_event_age_in_seconds = 3600
      maximum_retry_attempts       = 3
    }

    ecs_parameters {
      launch_type             = "FARGATE"
      platform_version        = "LATEST"
      propagate_tags          = "TASK_DEFINITION"
      enable_ecs_managed_tags = true
      task_count              = 1
      task_definition_arn     = aws_ecs_task_definition.api.arn

      network_configuration {
        assign_public_ip = true
        security_groups  = [aws_security_group.app_tasks.id]
        subnets          = values(aws_subnet.public)[*].id
      }
    }
  }
}

output "audit_sweep_schedule_arn" {
  description = "Five-minute audit queue fallback schedule; disabled until explicitly enabled for post-cutover operation."
  value       = aws_scheduler_schedule.audit_sweep.arn
}
