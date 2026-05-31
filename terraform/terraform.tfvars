# Terraform Variables Configuration for ProposalOS
# Project: proposal-487522

project_id  = "proposal-487522"
region      = "us-central1"
zone        = "us-central1-a"
app_name    = "proposalos"
environment = "prod"

cloud_run_api = {
  min_instances   = 1
  max_instances   = 50
  memory          = "1Gi"
  cpu             = "1"
  concurrency     = 40
  timeout_seconds = 300
  container_port  = 8080
  always_on_cpu   = true
}

cloud_run_frontend = {
  min_instances   = 1
  max_instances   = 20
  memory          = "1Gi"
  cpu             = "1"
  concurrency     = 80
  timeout_seconds = 60
  container_port  = 3000
}

cloud_sql = {
  database_name       = "proposalos"
  tier                = "db-custom-2-4096"
  disk_size           = 50
  disk_type           = "PD_SSD"
  availability_type   = "REGIONAL"
  backup_start_time   = "02:00"
  backup_retention    = 7
  maintenance_day     = "MON"
  maintenance_hour    = 2
  require_ssl         = true
  private_ip          = true
  deletion_protection = true
}

gcs_buckets = {
  proposals       = "proposals"
  audit_snapshots = "audit-snapshots"
  outreach_assets = "outreach-assets"
  terraform_state = "terraform-state"
}

vpc = {
  name                     = null
  auto_create_subnetworks  = false
  subnet_cidr              = "10.0.0.0/20"
  cloud_run_connector_cidr = "10.8.0.0/28"
}

cloud_armor = {
  enabled                     = true
  ddos_protection             = true
  allowed_ips                 = []
  blocked_ips                 = []
  rate_limit_requests_per_sec = 1000
}

# IMPORTANT: Use separate sending domain for cold outreach to protect main domain reputation
# Register: getclaraud.com, tryclaraud.com, or claraud.io for outreach
dns = {
  domain            = "claraud.com"         # Main domain (for website)
  sending_domain    = "getclaraud.com"      # Separate domain for cold outreach [P0 - TODO: Register this domain]
  sending_subdomain = "mail"
  managed_zone      = "claraud-com"
  spf_include       = ["_spf.google.com", "sendgrid.net", "resend.com"]
  dmarc_policy      = "quarantine"
  dmarc_rua_email   = "dmarc-reports@claraud.com"
}

monitoring = {
  enabled            = true
  notification_email = "founder@misprice.app"
  uptime_check_enabled = true
}

default_labels = {
  environment = "prod"
  managed_by  = "terraform"
  application = "proposalos"
}

cost_allocation_labels = {
  cost_center  = "engineering"
  team         = "platform"
  billing_code = "prod-001"
}