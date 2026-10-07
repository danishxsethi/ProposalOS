resource "aws_security_group" "alb" {
  name        = "${local.prefix}-internal-alb"
  description = "Internal staging ALB; reachable only within the ProposalOS VPC."
  vpc_id      = aws_vpc.main.id

  egress {
    description = "ALB health checks and API traffic to staging API tasks."
    from_port   = 8080
    to_port     = 8080
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  egress {
    description = "ALB health checks and web traffic to staging web tasks."
    from_port   = 3000
    to_port     = 3000
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  tags = { Name = "${local.prefix}-internal-alb" }
}

resource "aws_vpc_security_group_ingress_rule" "alb_http_from_vpc" {
  security_group_id = aws_security_group.alb.id
  description       = "HTTP for internal staging checks only; the ALB is in private subnets."
  cidr_ipv4         = var.vpc_cidr
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
  tags              = local.common_tags
}

resource "aws_vpc_security_group_ingress_rule" "alb_http_from_public" {
  count             = var.enable_staging_alb && var.enable_public_staging ? 1 : 0
  security_group_id = aws_security_group.alb.id
  description       = "Public HTTP redirects staging browsers to HTTPS."
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
  tags              = local.common_tags
}

resource "aws_vpc_security_group_ingress_rule" "alb_https_from_public" {
  count             = var.enable_staging_alb && var.enable_public_staging ? 1 : 0
  security_group_id = aws_security_group.alb.id
  description       = "Public HTTPS for the ProposalOS staging app."
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  tags              = local.common_tags
}

resource "aws_vpc_security_group_ingress_rule" "app_from_alb_api" {
  security_group_id            = aws_security_group.app_tasks.id
  referenced_security_group_id = aws_security_group.alb.id
  description                  = "API requests and health checks from the internal staging ALB."
  ip_protocol                  = "tcp"
  from_port                    = 8080
  to_port                      = 8080
  tags                         = local.common_tags
}

resource "aws_vpc_security_group_ingress_rule" "app_from_alb_web" {
  security_group_id            = aws_security_group.app_tasks.id
  referenced_security_group_id = aws_security_group.alb.id
  description                  = "Web requests and health checks from the internal staging ALB."
  ip_protocol                  = "tcp"
  from_port                    = 3000
  to_port                      = 3000
  tags                         = local.common_tags
}

resource "aws_lb" "staging" {
  count              = var.enable_staging_alb ? 1 : 0
  name               = var.enable_public_staging ? "${local.prefix}-public" : "${local.prefix}-internal"
  internal           = !var.enable_public_staging
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = var.enable_public_staging ? values(aws_subnet.public)[*].id : values(aws_subnet.private)[*].id
  idle_timeout       = 120

  enable_deletion_protection = var.enable_public_staging

  tags = merge(local.common_tags, { Name = "${local.prefix}-${var.enable_public_staging ? "public" : "internal"}" })
}

resource "aws_lb_target_group" "api" {
  count                = var.enable_staging_alb ? 1 : 0
  name                 = "${local.prefix}-api"
  port                 = 8080
  protocol             = "HTTP"
  target_type          = "ip"
  vpc_id               = aws_vpc.main.id
  deregistration_delay = 15

  health_check {
    enabled             = true
    path                = "/api/health/live"
    port                = "traffic-port"
    protocol            = "HTTP"
    matcher             = "200"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  tags = merge(local.common_tags, { Name = "${local.prefix}-api" })
}

resource "aws_lb_target_group" "web" {
  count                = var.enable_staging_alb ? 1 : 0
  name                 = "${local.prefix}-web"
  port                 = 3000
  protocol             = "HTTP"
  target_type          = "ip"
  vpc_id               = aws_vpc.main.id
  deregistration_delay = 15

  health_check {
    enabled             = true
    path                = "/"
    port                = "traffic-port"
    protocol            = "HTTP"
    matcher             = "200-399"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  tags = merge(local.common_tags, { Name = "${local.prefix}-web" })
}

resource "aws_lb_listener" "http" {
  count             = var.enable_staging_alb ? 1 : 0
  load_balancer_arn = aws_lb.staging[0].arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = var.enable_public_staging ? "fixed-response" : "forward"
    target_group_arn = var.enable_staging_alb && !var.enable_public_staging ? aws_lb_target_group.web[0].arn : null

    dynamic "fixed_response" {
      for_each = var.enable_staging_alb && var.enable_public_staging ? [1] : []
      content {
        content_type = "text/plain"
        message_body = "Not Found"
        status_code  = "404"
      }
    }
  }

  tags = merge(local.common_tags, { Name = "${local.prefix}-http" })
}

resource "aws_lb_listener" "https" {
  count             = var.enable_staging_alb && var.enable_public_staging ? 1 : 0
  load_balancer_arn = aws_lb.staging[0].arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate_validation.staging[0].certificate_arn

  default_action {
    type = "fixed-response"

    fixed_response {
      content_type = "text/plain"
      message_body = "Not Found"
      status_code  = "404"
    }
  }

  tags = merge(local.common_tags, { Name = "${local.prefix}-https" })
}

resource "aws_lb_listener_rule" "api" {
  count        = var.enable_staging_alb && !var.enable_public_staging ? 1 : 0
  listener_arn = aws_lb_listener.http[0].arn
  priority     = 10

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api[0].arn
  }

  condition {
    path_pattern {
      values = ["/api/*"]
    }
  }

  tags = merge(local.common_tags, { Name = "${local.prefix}-api" })
}

resource "aws_lb_listener_rule" "api_https" {
  count        = var.enable_staging_alb && var.enable_public_staging ? 1 : 0
  listener_arn = aws_lb_listener.https[0].arn
  priority     = 10

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api[0].arn
  }

  condition {
    path_pattern {
      values = ["/api/*"]
    }
  }

  condition {
    host_header {
      values = [var.staging_domain_name]
    }
  }

  tags = merge(local.common_tags, { Name = "${local.prefix}-api" })
}

resource "aws_lb_listener_rule" "web_https" {
  count        = var.enable_staging_alb && var.enable_public_staging ? 1 : 0
  listener_arn = aws_lb_listener.https[0].arn
  priority     = 20

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.web[0].arn
  }

  condition {
    host_header {
      values = [var.staging_domain_name]
    }
  }

  tags = merge(local.common_tags, { Name = "${local.prefix}-web" })
}

resource "aws_lb_listener_rule" "http_redirect_https" {
  count        = var.enable_staging_alb && var.enable_public_staging ? 1 : 0
  listener_arn = aws_lb_listener.http[0].arn
  priority     = 1

  action {
    type = "redirect"

    redirect {
      host        = var.staging_domain_name
      path        = "/#{path}"
      port        = "443"
      protocol    = "HTTPS"
      query       = "#{query}"
      status_code = "HTTP_301"
    }
  }

  condition {
    host_header {
      values = [var.staging_domain_name]
    }
  }

  tags = merge(local.common_tags, { Name = "${local.prefix}-http-https-redirect" })
}
