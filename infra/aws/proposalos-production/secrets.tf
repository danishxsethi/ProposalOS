locals {
  production_runtime_secret_envs = toset([
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

resource "aws_secretsmanager_secret" "production_runtime" {
  for_each                = local.production_runtime_secret_envs
  name                    = "proposalos/app/production/${each.value}"
  description             = "ProposalOS production runtime secret migrated from GCP Secret Manager."
  recovery_window_in_days = 7
  tags                    = { Name = "${local.prefix}-${lower(replace(each.value, "_", "-"))}" }
}
