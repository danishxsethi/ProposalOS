-- Deep Localization + Cross-Tenant Intelligence Database Schema

-- ============================================================================
-- Locale Configuration
-- ============================================================================

CREATE TABLE IF NOT EXISTS locale_configs (
  locale VARCHAR(10) PRIMARY KEY,
  language VARCHAR(50) NOT NULL,
  primary_search_engine VARCHAR(50) NOT NULL,
  currency VARCHAR(3) NOT NULL,
  regulations JSONB NOT NULL,
  tone VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Localized Prompts
-- ============================================================================

CREATE TABLE IF NOT EXISTS localized_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id VARCHAR(255) NOT NULL,
  locale VARCHAR(10) NOT NULL,
  prompt_text TEXT NOT NULL,
  cultural_context TEXT,
  approval_status VARCHAR(50) NOT NULL DEFAULT 'pending',
  native_speaker_review TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  UNIQUE(node_id, locale),
  FOREIGN KEY (locale) REFERENCES locale_configs(locale)
);

CREATE INDEX IF NOT EXISTS idx_localized_prompts_node_locale ON localized_prompts(node_id, locale);
CREATE INDEX IF NOT EXISTS idx_localized_prompts_approval ON localized_prompts(approval_status);

-- ============================================================================
-- Anonymized Metrics
-- ============================================================================

CREATE TABLE IF NOT EXISTS anonymized_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anonymous_id VARCHAR(64) NOT NULL,
  industry VARCHAR(100) NOT NULL,
  business_size VARCHAR(50) NOT NULL,
  locale VARCHAR(10) NOT NULL,
  metric_type VARCHAR(100) NOT NULL,
  metric_value DECIMAL(15,2) NOT NULL,
  differential_privacy_noise DECIMAL(10,6),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cohort_id UUID,
  FOREIGN KEY (locale) REFERENCES locale_configs(locale)
);

CREATE INDEX IF NOT EXISTS idx_anonymized_metrics_cohort ON anonymized_metrics(industry, business_size, locale);
CREATE INDEX IF NOT EXISTS idx_anonymized_metrics_timestamp ON anonymized_metrics(timestamp DESC);

-- ============================================================================
-- Benchmark Cohorts
-- ============================================================================

CREATE TABLE IF NOT EXISTS benchmark_cohorts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  industry VARCHAR(100) NOT NULL,
  business_size VARCHAR(50) NOT NULL,
  locale VARCHAR(10) NOT NULL,
  record_count INTEGER NOT NULL DEFAULT 0,
  k_anonymity INTEGER NOT NULL,
  metrics JSONB NOT NULL,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(industry, business_size, locale),
  FOREIGN KEY (locale) REFERENCES locale_configs(locale)
);

CREATE INDEX IF NOT EXISTS idx_benchmark_cohorts_lookup ON benchmark_cohorts(industry, business_size, locale);

-- ============================================================================
-- Patterns
-- ============================================================================

CREATE TABLE IF NOT EXISTS patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  description TEXT NOT NULL,
  affected_platforms JSONB NOT NULL,
  affected_plugins JSONB,
  frequency INTEGER NOT NULL DEFAULT 0,
  industries JSONB NOT NULL,
  locales JSONB NOT NULL,
  recommended_fixes JSONB NOT NULL,
  confidence_score DECIMAL(5,4) NOT NULL,
  trend VARCHAR(50) NOT NULL DEFAULT 'stable',
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patterns_frequency ON patterns(frequency DESC);
CREATE INDEX IF NOT EXISTS idx_patterns_confidence ON patterns(confidence_score DESC);

-- ============================================================================
-- Recommendation Implementations
-- ============================================================================

CREATE TABLE IF NOT EXISTS recommendation_implementations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id UUID NOT NULL,
  recommendation_type VARCHAR(100) NOT NULL,
  industry VARCHAR(100) NOT NULL,
  locale VARCHAR(10) NOT NULL,
  predicted_impact JSONB NOT NULL,
  implemented_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (locale) REFERENCES locale_configs(locale)
);

-- ============================================================================
-- Effectiveness Records
-- ============================================================================

CREATE TABLE IF NOT EXISTS effectiveness_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  implementation_id UUID NOT NULL,
  re_audit_date TIMESTAMPTZ NOT NULL,
  actual_impact JSONB NOT NULL,
  accuracy DECIMAL(5,4) NOT NULL,
  confidence_level DECIMAL(5,4) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (implementation_id) REFERENCES recommendation_implementations(id)
);

CREATE INDEX IF NOT EXISTS idx_effectiveness_implementation ON effectiveness_records(implementation_id);
CREATE INDEX IF NOT EXISTS idx_effectiveness_date ON effectiveness_records(re_audit_date DESC);

-- ============================================================================
-- Intelligence API Audit Log
-- ============================================================================

CREATE TABLE IF NOT EXISTS intelligence_api_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_type VARCHAR(50) NOT NULL,
  filters JSONB NOT NULL,
  requester_id VARCHAR(255) NOT NULL,
  response_sample_size INTEGER,
  response_k_anonymity INTEGER,
  compliance_review TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_audit_timestamp ON intelligence_api_audit_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_api_audit_requester ON intelligence_api_audit_log(requester_id);
