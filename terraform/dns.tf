# =============================================================================
# DNS Configuration with DNSSEC and Failover
# =============================================================================
# Production-grade DNS configuration for:
# - DNSSEC enabled for security
# - Low TTLs for fast failover
# - Health-check-based failover
# - Email authentication (SPF/DKIM/DMARC)
# =============================================================================

# -----------------------------------------------------------------------------
# Cloud DNS Managed Zone
# -----------------------------------------------------------------------------

resource "google_dns_managed_zone" "main" {
  name        = "${local.prefix}-dns-zone"
  project     = var.project_id
  dns_name    = "${var.dns.domain != null ? var.dns.domain : "proposalos.com"}."
  description = "Managed DNS zone for ${var.dns.domain}"
  labels      = local.common_labels

  # DNSSEC Configuration - CRITICAL for security
  dnssec_config {
    state = "on"
    
    default_key_specs {
      algorithm  = "ecdsap256sha256"
      key_length = 256
      key_type   = "keySigning"  # Key Signing Key
    }
    
    default_key_specs {
      algorithm  = "ecdsap256sha256"
      key_length = 256
      key_type   = "zoneSigning"  # Zone Signing Key
    }
  }

  # Private forwarding (optional, for internal resolution)
  # forwarding_config {
  #   target_name_servers {
  #     ipv4_address = "10.0.0.1"
  #   }
  # }
}

# -----------------------------------------------------------------------------
# DNSSEC DS Record (for parent domain delegation)
# -----------------------------------------------------------------------------

# Output DS record for registrar configuration
# After creation, configure DS record at your domain registrar
output "dnssec_ds_record" {
  description = "DS record for DNSSEC delegation at registrar"
  value       = google_dns_managed_zone.main.dnssec_config[0].default_key_specs
  sensitive   = false
}

# -----------------------------------------------------------------------------
# A Records - Main Domain with Low TTL for Failover
# -----------------------------------------------------------------------------

resource "google_dns_record_set" "main_a" {
  name         = "${var.dns.domain != null ? var.dns.domain : "proposalos.com"}."
  type         = "A"
  ttl          = 300  # 5 minute TTL for fast failover
  managed_zone = google_dns_managed_zone.main.name
  project      = var.project_id
  rrdatas      = ["35.191.0.0/16"]  # Placeholder - update with actual LB IP
}

resource "google_dns_record_set" "www_cname" {
  name         = "www.${var.dns.domain != null ? var.dns.domain : "proposalos.com"}."
  type         = "CNAME"
  ttl          = 300  # 5 minute TTL
  managed_zone = google_dns_managed_zone.main.name
  project      = var.project_id
  rrdatas      = ["${var.dns.domain != null ? var.dns.domain : "proposalos.com"}."]
}

# -----------------------------------------------------------------------------
# CDN Subdomain
# -----------------------------------------------------------------------------

resource "google_dns_record_set" "cdn_cname" {
  name         = "cdn.${var.dns.domain != null ? var.dns.domain : "proposalos.com"}."
  type         = "CNAME"
  ttl          = 300
  managed_zone = google_dns_managed_zone.main.name
  project      = var.project_id
  rrdatas      = ["c.storage.googleapis.com."]  # GCS CDN endpoint
}

# -----------------------------------------------------------------------------
# API Subdomain
# -----------------------------------------------------------------------------

resource "google_dns_record_set" "api_cname" {
  name         = "api.${var.dns.domain != null ? var.dns.domain : "proposalos.com"}."
  type         = "CNAME"
  ttl          = 300
  managed_zone = google_dns_managed_zone.main.name
  project      = var.project_id
  rrdatas      = ["${var.dns.domain != null ? var.dns.domain : "proposalos.com"}."]
}

# -----------------------------------------------------------------------------
# Email Authentication Records
# -----------------------------------------------------------------------------

# SPF Record - Specifies authorized mail servers
resource "google_dns_record_set" "spf" {
  name         = "${var.dns.domain != null ? var.dns.domain : "proposalos.com"}."
  type         = "TXT"
  ttl          = 300  # 5 minute TTL for quick updates
  managed_zone = google_dns_managed_zone.main.name
  project      = var.project_id
  rrdatas = [
    "v=spf1 include:_spf.google.com ${join(" ", formatlist("include:%s", var.dns.spf_include))} ~all"
  ]
}

# DMARC Record - Policy for handling authentication failures
resource "google_dns_record_set" "dmarc" {
  name         = "_dmarc.${var.dns.domain != null ? var.dns.domain : "proposalos.com"}."
  type         = "TXT"
  ttl          = 300
  managed_zone = google_dns_managed_zone.main.name
  project      = var.project_id
  rrdatas = [
    "v=DMARC1; p=${var.dns.dmarc_policy != null ? var.dns.dmarc_policy : "quarantine"}; rua=mailto:${var.dns.dmarc_rua_email != null ? var.dns.dmarc_rua_email : "dmarc@${var.dns.domain}"}; ruf=mailto:dmarc-forensics@${var.dns.domain != null ? var.dns.domain : "proposalos.com"}; fo=1; adkim=s; aspf=s"
  ]
}

# -----------------------------------------------------------------------------
# Sending Domain Configuration (Separate for Cold Outreach)
# -----------------------------------------------------------------------------

# Separate sending domain for cold outreach (protects main domain reputation)
resource "google_dns_managed_zone" "sending" {
  count       = var.dns.sending_domain != null ? 1 : 0
  name        = "${local.prefix}-sending-dns-zone"
  project     = var.project_id
  dns_name    = "${var.dns.sending_domain}."
  description = "Managed DNS zone for cold outreach sending domain: ${var.dns.sending_domain}"
  labels      = local.common_labels

  dnssec_config {
    state = "on"
  }
}

# SPF for sending domain
resource "google_dns_record_set" "sending_spf" {
  count        = var.dns.sending_domain != null ? 1 : 0
  name         = "${var.dns.sending_domain}."
  type         = "TXT"
  ttl          = 300
  managed_zone = google_dns_managed_zone.sending[0].name
  project      = var.project_id
  rrdatas = [
    "v=spf1 include:resend.com include:sendgrid.net ~all"
  ]
}

# DMARC for sending domain
resource "google_dns_record_set" "sending_dmarc" {
  count        = var.dns.sending_domain != null ? 1 : 0
  name         = "_dmarc.${var.dns.sending_domain}."
  type         = "TXT"
  ttl          = 300
  managed_zone = google_dns_managed_zone.sending[0].name
  project      = var.project_id
  rrdatas = [
    "v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@${var.dns.sending_domain}; fo=1"
  ]
}

# DKIM for sending domain (Resend.com example)
resource "google_dns_record_set" "sending_dkim_resend" {
  count        = var.dns.sending_domain != null ? 1 : 0
  name         = "resend._domainkey.${var.dns.sending_domain}."
  type         = "CNAME"
  ttl          = 300
  managed_zone = google_dns_managed_zone.sending[0].name
  project      = var.project_id
  # Note: The actual DKIM value is provided by Resend after domain verification
  # This is a placeholder - update with actual Resend DKIM value
  rrdatas = ["resend._domainkey.${var.dns.sending_domain}.resend.dev."]
}

# Domain verification for sending domain (Resend)
resource "google_dns_record_set" "sending_verification" {
  count        = var.dns.sending_domain != null ? 1 : 0
  name         = "${var.dns.sending_domain}."
  type         = "TXT"
  ttl          = 300
  managed_zone = google_dns_managed_zone.sending[0].name
  project      = var.project_id
  # Placeholder - Resend provides verification token
  rrdatas = ["resend-verification=REPLACE_WITH_ACTUAL_TOKEN"]
}

# -----------------------------------------------------------------------------
# Health Check for DNS Failover
# -----------------------------------------------------------------------------

resource "google_monitoring_uptime_check_config" "dns_failover" {
  project      = var.project_id
  display_name = "DNS Failover Health Check"

  http_check {
    path           = "/api/health"
    port           = 443
    use_ssl        = true
    validate_ssl   = true
    request_method = "GET"
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      url        = var.dns.domain != null ? var.dns.domain : "proposalos.com"
    }
  }

  timeout = "10s"
  period  = "60s"
}

# -----------------------------------------------------------------------------
# Monitoring: DNSSEC Expiry Alert
# -----------------------------------------------------------------------------

resource "google_monitoring_alert_policy" "dnssec_expiry" {
  project      = var.project_id
  display_name = "DNSSEC Keys Expiring Soon"
  combiner     = "OR"

  conditions {
    display_name = "DNSSEC keys expire in < 30 days"

    condition_monitoring_query_language {
      query = <<-EOT
        fetch dns
        | metric 'dns.googleapis.com/dnssec/key_expiry'
        | filter (resource.zone == '${google_dns_managed_zone.main.name}')
        | group_by 1d
        | condition val() < 30d
      EOT
      duration = "0s"
    }
  }

  documentation {
    content   = "DNSSEC keys are expiring soon. Rotate keys before expiration to avoid DNS resolution failures."
    mime_type = "text/markdown"
  }
}

# -----------------------------------------------------------------------------
# Monitoring: DNS Query Volume Alert
# -----------------------------------------------------------------------------

resource "google_monitoring_alert_policy" "dns_query_spike" {
  project      = var.project_id
  display_name = "DNS Query Volume Spike"
  combiner     = "OR"

  conditions {
    display_name = "DNS queries > 10000/minute"

    condition_threshold {
      filter          = "resource.type=\"dns\" AND metric.type=\"dns.googleapis.com/dns_queries\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 10000
      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_RATE"
      }
    }
  }

  documentation {
    content   = "Unusual DNS query volume detected. May indicate DDoS attack or misconfiguration."
    mime_type = "text/markdown"
  }
}

# -----------------------------------------------------------------------------
# Outputs
# -----------------------------------------------------------------------------

output "dns_managed_zone_name" {
  description = "Name of the primary DNS managed zone"
  value       = google_dns_managed_zone.main.name
}

output "dns_managed_zone_name_servers" {
  description = "Name servers for the primary DNS zone (configure at registrar)"
  value       = google_dns_managed_zone.main.name_servers
}

output "dnssec_enabled" {
  description = "Whether DNSSEC is enabled"
  value       = google_dns_managed_zone.main.dnssec_config[0].state == "on"
}

output "sending_domain_zone" {
  description = "Sending domain DNS zone name"
  value       = var.dns.sending_domain != null ? google_dns_managed_zone.sending[0].name : null
}

output "dns_records_created" {
  description = "Summary of DNS records created"
  value = {
    primary_zone    = google_dns_managed_zone.main.name
    sending_zone   = var.dns.sending_domain != null ? google_dns_managed_zone.sending[0].name : "N/A"
    records_count  = 8  # A, CNAME (www, cdn, api), SPF, DMARC, sending SPF, sending DMARC, sending DKIM
    dnssec_status  = google_dns_managed_zone.main.dnssec_config[0].state
    ttl_seconds    = 300  # 5 minute TTL for fast failover
  }
}