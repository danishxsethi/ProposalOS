# =============================================================================
# Cloud Armor WAF Configuration
# =============================================================================
# Production-grade Web Application Firewall with:
# - DDoS protection (Layer 7)
# - OWASP Core Rule Set
# - IP allow/deny lists
# - Rate limiting
# - Geographic restrictions (optional)
# =============================================================================

# -----------------------------------------------------------------------------
# Cloud Armor Security Policy
# -----------------------------------------------------------------------------

resource "google_compute_security_policy" "main" {
  name        = "${local.prefix}-waf-policy"
  project     = var.project_id
  description = "Cloud Armor WAF policy for ProposalOS"

  # ---------------------------------------------------------------------------
  # Rule 1: Deny specific blocked IPs
  # ---------------------------------------------------------------------------
  dynamic "rule" {
    for_each = length(var.cloud_armor.blocked_ips) > 0 ? [1] : []
    content {
      action   = "deny(403)"
      priority = "100"
      match {
        versioned_expr = "SRC_IPS_V1"
        config {
          src_ip_ranges = var.cloud_armor.blocked_ips
        }
      }
      description = "Deny blocked IP addresses"
    }
  }

  # ---------------------------------------------------------------------------
  # Rule 2: Rate limiting - 1000 requests per second per IP
  # ---------------------------------------------------------------------------
  rule {
    action   = "rate_based_ban"
    priority = "200"
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }
    rate_limit_options {
      conform_action = "allow"
      exceed_action  = "deny(429)"
      rate_limit_threshold {
        count        = var.cloud_armor.rate_limit_requests_per_sec
        interval_sec = 1
      }
      ban_duration_sec = 600  # 10 minute ban
      enforce_on_key     = "IP"
    }
    description = "Rate limit: ${var.cloud_armor.rate_limit_requests_per_sec} requests/second per IP"
  }

  # ---------------------------------------------------------------------------
  # Rule 3: OWASP Core Rule Set - SQL Injection
  # ---------------------------------------------------------------------------
  rule {
    action   = "deny(403)"
    priority = "300"
    match {
      expr {
        expression = "evaluatePreconfiguredExpr('sqli-stable')"
      }
    }
    preview     = false
    description = "OWASP CRS: SQL Injection Protection"
  }

  # ---------------------------------------------------------------------------
  # Rule 4: OWASP Core Rule Set - XSS
  # ---------------------------------------------------------------------------
  rule {
    action   = "deny(403)"
    priority = "310"
    match {
      expr {
        expression = "evaluatePreconfiguredExpr('xss-stable')"
      }
    }
    preview     = false
    description = "OWASP CRS: Cross-Site Scripting (XSS) Protection"
  }

  # ---------------------------------------------------------------------------
  # Rule 5: OWASP Core Rule Set - RCE
  # ---------------------------------------------------------------------------
  rule {
    action   = "deny(403)"
    priority = "320"
    match {
      expr {
        expression = "evaluatePreconfiguredExpr('rce-stable')"
      }
    }
    preview     = false
    description = "OWASP CRS: Remote Code Execution (RCE) Protection"
  }

  # ---------------------------------------------------------------------------
  # Rule 6: OWASP Core Rule Set - LFI
  # ---------------------------------------------------------------------------
  rule {
    action   = "deny(403)"
    priority = "330"
    match {
      expr {
        expression = "evaluatePreconfiguredExpr('lfi-stable')"
      }
    }
    preview     = false
    description = "OWASP CRS: Local File Inclusion (LFI) Protection"
  }

  # ---------------------------------------------------------------------------
  # Rule 7: OWASP Core Rule Set - RFI
  # ---------------------------------------------------------------------------
  rule {
    action   = "deny(403)"
    priority = "340"
    match {
      expr {
        expression = "evaluatePreconfiguredExpr('rfi-stable')"
      }
    }
    preview     = false
    description = "OWASP CRS: Remote File Inclusion (RFI) Protection"
  }

  # ---------------------------------------------------------------------------
  # Rule 8: Block common attack patterns (user-agent)
  # ---------------------------------------------------------------------------
  rule {
    action   = "deny(403)"
    priority = "400"
    match {
      expr {
        expression = "userAgent().contains('sqlmap') || userAgent().contains('nikto') || userAgent().contains('nmap') || userAgent().contains('masscan')"
      }
    }
    description = "Block known scanner user agents"
  }

  # ---------------------------------------------------------------------------
  # Rule 9: Block bad bots
  # ---------------------------------------------------------------------------
  rule {
    action   = "deny(403)"
    priority = "410"
    match {
      expr {
        expression = "userAgent().contains('curl') && !userAgent().contains('GoogleBot') && !userAgent().contains('BingBot')"
      }
    }
    description = "Block suspicious curl requests"
  }

  # ---------------------------------------------------------------------------
  # Rule 10: Allow health checks from GCP
  # ---------------------------------------------------------------------------
  rule {
    action   = "allow"
    priority = "500"
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["35.191.0.0/16", "130.211.0.0/22", "209.85.152.0/22", "209.85.204.0/22"]
      }
    }
    description = "Allow GCP health check and load balancer IPs"
  }

  # ---------------------------------------------------------------------------
  # Rule 11: Allow specific allowed IPs (if configured)
  # ---------------------------------------------------------------------------
  dynamic "rule" {
    for_each = length(var.cloud_armor.allowed_ips) > 0 ? [1] : []
    content {
      action   = "allow"
      priority = "510"
      match {
        versioned_expr = "SRC_IPS_V1"
        config {
          src_ip_ranges = var.cloud_armor.allowed_ips
        }
      }
      description = "Allow specific IP addresses"
    }
  }

  # ---------------------------------------------------------------------------
  # Default Rule: Deny all other traffic (configured via default_rule block)
  # ---------------------------------------------------------------------------
}

# Default deny rule (must be separate due to provider requirements)
resource "google_compute_security_policy_rule" "default_deny" {
  security_policy = google_compute_security_policy.main.name
  priority        = "2147483647"
  action          = "deny(403)"
  description     = "Default deny all"
  match {
    versioned_expr = "SRC_IPS_V1"
    config {
      src_ip_ranges = ["*"]
    }
  }
  project = var.project_id
}

# -----------------------------------------------------------------------------
# Cloud Armor Pre-configured WAF Rules (additional protection)
# -----------------------------------------------------------------------------

# Additional rule for PHP injection (if applicable)
resource "google_compute_security_policy_rule" "php_injection" {
  security_policy = google_compute_security_policy.main.name
  priority        = 350
  action          = "deny(403)"
  description     = "OWASP CRS: PHP Injection Protection"

  match {
    expr {
      expression = "evaluatePreconfiguredExpr('php-stable')"
    }
  }

  project = var.project_id
}

# Java injection protection
resource "google_compute_security_policy_rule" "java_injection" {
  security_policy = google_compute_security_policy.main.name
  priority        = 360
  action          = "deny(403)"
  description     = "OWASP CRS: Java Injection Protection"

  match {
    expr {
      expression = "evaluatePreconfiguredExpr('java-stable')"
    }
  }

  project = var.project_id
}

# Protocol attack protection
resource "google_compute_security_policy_rule" "protocol_attacks" {
  security_policy = google_compute_security_policy.main.name
  priority        = 370
  action          = "deny(403)"
  description     = "OWASP CRS: Protocol Attack Protection"

  match {
    expr {
      expression = "evaluatePreconfiguredExpr('protocolattacks-stable')"
    }
  }

  project = var.project_id
}

# Session fixation protection
resource "google_compute_security_policy_rule" "session_fixation" {
  security_policy = google_compute_security_policy.main.name
  priority        = 380
  action          = "deny(403)"
  description     = "OWASP CRS: Session Fixation Protection"

  match {
    expr {
      expression = "evaluatePreconfiguredExpr('sessionfixation-stable')"
    }
  }

  project = var.project_id
}

# -----------------------------------------------------------------------------
# Cloud Armor Logging
# -----------------------------------------------------------------------------

resource "google_logging_project_bucket_config" "cloud_armor_logs" {
  project     = var.project_id
  location    = "global"
  bucket_id   = "cloud-armor-logs"
  description = "Cloud Armor WAF logs"

  enable_analytics = true
  retention_days   = 90
}

# Cloud Armor logging configured via security policy

# -----------------------------------------------------------------------------
# Monitoring Alerts for WAF Events
# -----------------------------------------------------------------------------

resource "google_monitoring_alert_policy" "waf_block_rate" {
  project      = var.project_id
  display_name = "Cloud Armor WAF High Block Rate"
  combiner     = "OR"

  conditions {
    display_name = "WAF block rate > 100/minute"

    condition_monitoring_query_language {
      query = <<-EOT
        fetch http_load_balancer
        | metric 'loadbalancing.googleapis.com/https/total_response_count'
        | filter (resource.url_map_name == '${local.prefix}-url-map')
        | filter (metric.response_code_class == '4xx')
        | group_by 1m
        | condition val() > 100
      EOT
      duration = "300s"
    }
  }

  documentation {
    content   = "Cloud Armor WAF is blocking more than 100 requests per minute. This may indicate an attack."
    mime_type = "text/markdown"
  }

}

resource "google_monitoring_alert_policy" "waf_ddos_detection" {
  project      = var.project_id
  display_name = "Cloud Armor DDoS Detection"
  combiner     = "OR"

  conditions {
    display_name = "Potential DDoS attack detected"

    condition_monitoring_query_language {
      query = <<-EOT
        fetch http_load_balancer
        | metric 'loadbalancing.googleapis.com/https/total_response_count'
        | filter (resource.url_map_name == '${local.prefix}-url-map')
        | group_by 1m
        | condition val() > 10000
      EOT
      duration = "60s"
    }
  }

  documentation {
    content   = "Traffic spike detected - potential DDoS attack. Cloud Armor is active."
    mime_type = "text/markdown"
  }

}

# Outputs removed - moved to outputs.tf to avoid duplicates
