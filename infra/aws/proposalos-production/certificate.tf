resource "aws_acm_certificate" "production" {
  domain_name               = var.production_domain_name
  subject_alternative_names = ["www.${var.production_domain_name}"]
  validation_method         = "DNS"

  tags = merge(local.common_tags, { Name = "${local.prefix}-certificate" })

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_acm_certificate_validation" "production" {
  count = var.enable_public_production ? 1 : 0

  certificate_arn = aws_acm_certificate.production.arn
  validation_record_fqdns = [
    for option in aws_acm_certificate.production.domain_validation_options : option.resource_record_name
  ]
}
