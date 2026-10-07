locals {
  staging_runtime_secret_envs = toset([
    "ADMIN_SECRET",
    "API_KEY",
    "AUDIT_LOG_SIGNING_SECRET",
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

resource "aws_secretsmanager_secret" "staging_runtime" {
  for_each                = local.staging_runtime_secret_envs
  name                    = "proposalos/app/staging/${each.value}"
  description             = "ProposalOS staging runtime secret migrated from GCP Secret Manager."
  recovery_window_in_days = 7
  tags                    = { Name = "${local.prefix}-${lower(replace(each.value, "_", "-"))}" }
}
