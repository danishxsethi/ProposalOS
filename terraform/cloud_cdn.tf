# =============================================================================
# Cloud CDN Configuration
# =============================================================================
# Production-grade CDN configuration for:
# - Static assets (JS, CSS, images)
# - Proposal PDFs
# - Widget embed script
# - Audit snapshots
# =============================================================================

# -----------------------------------------------------------------------------
# Backend Bucket for Static Assets
# -----------------------------------------------------------------------------

resource "google_compute_backend_bucket" "static_assets" {
  name        = "${local.prefix}-static-assets"
  project     = var.project_id
  bucket_name = google_storage_bucket.proposals.name
  enable_cdn  = true

  # CDN Policy
  cdn_policy {
    cache_mode         = "USE_ORIGIN_HEADERS"
    default_ttl        = 3600   # 1 hour default
    max_ttl            = 86400  # 24 hours max
    negative_caching   = true
    
    negative_caching_policy {
      code = 404
      ttl  = 300
    }

    # Cache key configuration
    cache_key_policy {
      query_string_whitelist = [
        "v",      # Version parameter for cache busting
        "tenant", # Tenant ID for multi-tenant caching
      ]
    }

    # Request coalescing - reduce origin load
    request_coalescing = true
  }

  custom_response_headers = [
    "Access-Control-Allow-Origin:*",
    "Cache-Control:public, max-age=3600, stale-while-revalidate=86400",
    "X-Content-Type-Options:nosniff",
    "X-Frame-Options:SAMEORIGIN"
  ]

  depends_on = [google_storage_bucket.proposals]
}

# -----------------------------------------------------------------------------
# Backend Bucket for Widget.js
# -----------------------------------------------------------------------------

resource "google_compute_backend_bucket" "widget" {
  name        = "${local.prefix}-widget"
  project     = var.project_id
  bucket_name = google_storage_bucket.proposals.name
  enable_cdn  = true

  # Widget-specific CDN policy - longer cache for versioned files
  cdn_policy {
    cache_mode         = "USE_ORIGIN_HEADERS"
    default_ttl        = 604800  # 7 days for widget
    max_ttl            = 604800  # 7 days max
    negative_caching   = true
    
    negative_caching_policy {
      code = 404
      ttl  = 60
    }

    cache_key_policy {
      query_string_whitelist = [
        "v",        # Version for cache busting
        "tenant",   # Tenant configuration
        "color",    # Brand color
        "position", # Widget position
        "lang",     # Language
      ]
    }

    request_coalescing = true
  }

  custom_response_headers = [
    "Access-Control-Allow-Origin:*",
    "Access-Control-Allow-Methods:GET, OPTIONS",
    "Access-Control-Allow-Headers:Content-Type, X-Widget-Origin",
    "Access-Control-Max-Age:86400"
  ]

  depends_on = [google_storage_bucket.proposals]
}

# -----------------------------------------------------------------------------
# Signed URLs for Proposal PDFs (Security)
# -----------------------------------------------------------------------------

resource "google_storage_bucket_iam_member" "cdn_signer" {
  bucket = google_storage_bucket.proposals.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.cloud_run_api.email}"
}

resource "random_id" "signed_url_key" {
  byte_length = 16
}

# Cloud CDN signed URL key for private content
resource "google_compute_backend_bucket_signed_url_key" "proposals_key" {
  name           = "${local.prefix}-proposals-key"
  backend_bucket = google_compute_backend_bucket.static_assets.name
  project        = var.project_id
  key_value      = random_id.signed_url_key.b64_url
}

# -----------------------------------------------------------------------------
# Cache Invalidation Configuration
# -----------------------------------------------------------------------------

# Note: Cache invalidation is done via gcloud CLI or API
# Example: gcloud compute backend-buckets invalidate-cache static-assets --path="/proposals/*"

# -----------------------------------------------------------------------------
# Monitoring: Cache Hit Ratio Alert
# -----------------------------------------------------------------------------

# resource "google_monitoring_alert_policy" "cdn_cache_hit_ratio" {
#   project      = var.project_id
#   display_name = "Cloud CDN Low Cache Hit Ratio"
#   combiner     = "OR"
# 
#   conditions {
#     display_name = "CDN Cache Hit Ratio < 50%"
# 
#     condition_monitoring_query_language {
#       query = <<-EOT
#         fetch http_load_balancer
#         | metric 'loadbalancing.googleapis.com/https/backend_request_count'
#         | filter (resource.backend_bucket_name == '${google_compute_backend_bucket.static_assets.name}')
#         | group_by 5m
#         | condition val() / (val() + val('loadbalancing.googleapis.com/https/cache_hit_count')) > 0.5
#       EOT
#       duration = "600s"
#     }
#   }
# 
#   documentation {
#     content   = "Cloud CDN cache hit ratio is below 50%. Consider reviewing cache policies or origin cache headers."
#     mime_type = "text/markdown"
#   }
# }

# -----------------------------------------------------------------------------
# Monitoring: Origin Load Alert
# -----------------------------------------------------------------------------

# resource "google_monitoring_alert_policy" "cdn_origin_load" {
#   project      = var.project_id
#   display_name = "Cloud CDN High Origin Load"
#   combiner     = "OR"
# 
#   conditions {
#     display_name = "CDN Origin Request Rate > 1000/min"
# 
#     condition_threshold {
#       filter          = "resource.type=\"http_load_balancer\" AND metric.type=\"loadbalancing.googleapis.com/https/backend_request_count\""
#       duration        = "300s"
#       comparison      = "COMPARISON_GT"
#       threshold_value = 1000
#       aggregations {
#         alignment_period   = "60s"
#         per_series_aligner = "ALIGN_RATE"
#       }
#     }
#   }
# 
#   documentation {
#     content   = "High origin request rate detected. CDN may not be caching effectively."
#     mime_type = "text/markdown"
#   }
# }

# -----------------------------------------------------------------------------
# Outputs
# -----------------------------------------------------------------------------

output "cdn_static_assets_backend_bucket" {
  description = "Cloud CDN backend bucket for static assets"
  value       = google_compute_backend_bucket.static_assets.name
}

output "cdn_widget_backend_bucket" {
  description = "Cloud CDN backend bucket for widget"
  value       = google_compute_backend_bucket.widget.name
}

output "cdn_static_assets_url" {
  description = "CDN URL for static assets (to be configured with load balancer)"
  value       = "https://cdn.${var.dns.domain != null ? var.dns.domain : "proposalos.com"}/static"
}

output "cdn_widget_url" {
  description = "CDN URL for widget embed"
  value       = "https://cdn.${var.dns.domain != null ? var.dns.domain : "proposalos.com"}/widget.js"
}