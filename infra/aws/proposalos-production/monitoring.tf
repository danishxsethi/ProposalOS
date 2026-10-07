resource "aws_sns_topic" "production_alerts" {
  name = "proposalos-production-alerts"
  tags = local.common_tags
}

resource "aws_sns_topic_policy" "production_alerts" {
  arn = aws_sns_topic.production_alerts.arn
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowProposalOSCloudWatchAlarms"
        Effect    = "Allow"
        Principal = { Service = "cloudwatch.amazonaws.com" }
        Action    = "SNS:Publish"
        Resource  = aws_sns_topic.production_alerts.arn
        Condition = {
          StringEquals = { "aws:SourceAccount" = var.aws_account_id }
          ArnLike      = { "aws:SourceArn" = "arn:aws:cloudwatch:${var.aws_region}:${var.aws_account_id}:alarm:ProposalOSProduction-*" }
        }
      }
    ]
  })
}

resource "aws_sns_topic_subscription" "production_alert_emails" {
  for_each  = var.monitoring_alert_emails
  topic_arn = aws_sns_topic.production_alerts.arn
  protocol  = "email"
  endpoint  = each.value
}

resource "aws_cloudwatch_metric_alarm" "api_unhealthy_targets" {
  alarm_name          = "ProposalOSProduction-ALB-API-UnhealthyTargets"
  alarm_description   = "The production API target group has at least one unhealthy target."
  namespace           = "AWS/ApplicationELB"
  metric_name         = "UnHealthyHostCount"
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 2
  datapoints_to_alarm = 2
  comparison_operator = "GreaterThanOrEqualToThreshold"
  threshold           = 1
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.production_alerts.arn]

  dimensions = {
    LoadBalancer = aws_lb.production.arn_suffix
    TargetGroup  = aws_lb_target_group.api.arn_suffix
  }

  tags       = local.common_tags
  depends_on = [aws_sns_topic_policy.production_alerts]
}

resource "aws_cloudwatch_metric_alarm" "web_unhealthy_targets" {
  alarm_name          = "ProposalOSProduction-ALB-Web-UnhealthyTargets"
  alarm_description   = "The production web target group has at least one unhealthy target."
  namespace           = "AWS/ApplicationELB"
  metric_name         = "UnHealthyHostCount"
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 2
  datapoints_to_alarm = 2
  comparison_operator = "GreaterThanOrEqualToThreshold"
  threshold           = 1
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.production_alerts.arn]

  dimensions = {
    LoadBalancer = aws_lb.production.arn_suffix
    TargetGroup  = aws_lb_target_group.web.arn_suffix
  }

  tags       = local.common_tags
  depends_on = [aws_sns_topic_policy.production_alerts]
}

resource "aws_cloudwatch_metric_alarm" "load_balancer_5xx" {
  alarm_name          = "ProposalOSProduction-ALB-LoadBalancer5xx"
  alarm_description   = "The production load balancer returned at least 10 5xx responses in five minutes."
  namespace           = "AWS/ApplicationELB"
  metric_name         = "HTTPCode_ELB_5XX_Count"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  threshold           = 10
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.production_alerts.arn]

  dimensions = {
    LoadBalancer = aws_lb.production.arn_suffix
  }

  tags       = local.common_tags
  depends_on = [aws_sns_topic_policy.production_alerts]
}

resource "aws_cloudwatch_metric_alarm" "database_free_storage" {
  alarm_name          = "ProposalOSProduction-RDS-FreeStorage"
  alarm_description   = "Production RDS free storage has fallen below 5 GiB."
  namespace           = "AWS/RDS"
  metric_name         = "FreeStorageSpace"
  statistic           = "Minimum"
  period              = 300
  evaluation_periods  = 2
  datapoints_to_alarm = 2
  comparison_operator = "LessThanThreshold"
  threshold           = 5368709120
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.production_alerts.arn]

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.production.identifier
  }

  tags       = local.common_tags
  depends_on = [aws_sns_topic_policy.production_alerts]
}

resource "aws_budgets_budget" "proposalos_monthly_cost" {
  name         = "proposalos-production-monthly-300"
  budget_type  = "COST"
  limit_amount = "300"
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  cost_filter {
    name   = "TagKeyValue"
    values = ["user:Project$ProposalOS"]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    notification_type          = "ACTUAL"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    subscriber_email_addresses = sort(tolist(var.monitoring_alert_emails))
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    notification_type          = "FORECASTED"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    subscriber_email_addresses = sort(tolist(var.monitoring_alert_emails))
  }

  tags = local.common_tags
}
