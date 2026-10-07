resource "aws_acm_certificate" "staging" {
  domain_name       = var.staging_domain_name
  validation_method = "DNS"

  tags = merge(local.common_tags, { Name = "${local.prefix}-certificate" })

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_acm_certificate_validation" "staging" {
  count = var.enable_public_staging ? 1 : 0

  certificate_arn = aws_acm_certificate.staging.arn
  validation_record_fqdns = [
    for option in aws_acm_certificate.staging.domain_validation_options : option.resource_record_name
  ]
}
