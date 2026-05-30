/**
 * Feature Flags Configuration
 *
 * All feature flags should be configured here for centralized management.
 * Flags can be controlled via environment variables or updated at runtime via the admin API.
 *
 * =============================================================================
 * FEATURE FLAG OWNERSHIP
 * =============================================================================
 * Each feature flag must have a documented owner responsible for:
 * - Defining success metrics
 * - Approving enable/disable decisions
 * - Monitoring impact after changes
 *
 * Owner Types:
 * - PRODUCT: Product team owns the feature behavior and rollout
 * - ENGINEERING: Engineering team owns the technical implementation
 * - SECURITY: Security team must approve for sensitive features
 *
 * =============================================================================
 * ROTATION SCHEDULE
 * =============================================================================
 * - Feature flags should be reviewed quarterly
 * - Flags older than 1 year should be evaluated for removal
 * - A/B test flags should be removed within 90 days of experiment conclusion
 */

export const FEATURE_FLAGS = {
  // ==========================================
  // MODEL ROUTING
  // ==========================================
  /**
   * Enable Gemini 3.1 Pro for diagnosis/proposal tasks
   * Traffic percentage controlled by GEMINI_31_PRO_TRAFFIC_PCT
   */
  GEMINI_31_PRO_ENABLED: process.env.GEMINI_31_PRO_ENABLED === 'true',

  /**
   * Percentage of traffic to route to Gemini 3.1 Pro (0-100)
   * Used for A/B testing when GEMINI_31_PRO_ENABLED is true
   */
  GEMINI_31_PRO_TRAFFIC_PCT: parseInt(process.env.GEMINI_31_PRO_TRAFFIC_PCT || '0'),

  // ==========================================
  // PER-FEATURE TOGGLES
  // ==========================================
  /**
   * Enable thinking mode for supported models
   * Allows models to "think" before responding for improved quality
   */
  THINKING_MODE_ENABLED: process.env.THINKING_MODE_ENABLED === 'true',

  /**
   * Enable multimodal features (image analysis, etc.)
   * Requires models with vision capabilities
   */
  MULTIMODAL_ENABLED: process.env.MULTIMODAL_ENABLED === 'true',

  /**
   * Enable streaming responses for LLM outputs
   * Provides real-time token streaming to clients
   */
  STREAMING_ENABLED: process.env.STREAMING_ENABLED === 'true',

  /**
   * Use single-pass diagnosis instead of multi-phase
   * Faster but may produce less detailed analysis
   */
  SINGLE_PASS_DIAGNOSIS: process.env.SINGLE_PASS_DIAGNOSIS !== 'false',

  // ==========================================
  // BUSINESS FEATURE FLAGS
  // ==========================================
  /**
   * Enable batch mode for processing multiple audits
   * Allows bulk audit generation and processing
   */
  ENABLE_BATCH_MODE: process.env.ENABLE_BATCH_MODE === 'true',

  /**
   * Enable white-label features for agency partners
   * Removes ProposalOS branding, allows custom branding
   */
  ENABLE_WHITE_LABEL: process.env.ENABLE_WHITE_LABEL === 'true',

  /**
   * Enable cold outreach functionality
   * Includes email sequencing, lead enrichment, inbox rotation
   */
  ENABLE_COLD_OUTREACH: process.env.ENABLE_COLD_OUTREACH === 'true',

  /**
   * Enable widget embed mode
   * Allows embedding audit widgets on external sites
   */
  ENABLE_WIDGET_EMBED: process.env.ENABLE_WIDGET_EMBED === 'true',

  /**
   * Enable B2C mode for consumer-facing features
   * Simplified UI and flows for individual users
   */
  ENABLE_B2C_MODE: process.env.ENABLE_B2C_MODE === 'true',

  // ==========================================
  // NEW AUDIT MODULES (Phase V - Release Management)
  // ==========================================
  /**
   * Enable new accessibility audit module
   * Includes WCAG 2.1 AA compliance checks, ARIA validation
   */
  ENABLE_ACCESSIBILITY_AUDIT_MODULE: process.env.ENABLE_ACCESSIBILITY_AUDIT_MODULE === 'true',

  /**
   * Enable new performance audit module
   * Includes Core Web Vitals, LCP, FID, CLS analysis
   */
  ENABLE_PERFORMANCE_AUDIT_MODULE: process.env.ENABLE_PERFORMANCE_AUDIT_MODULE === 'true',

  /**
   * Enable new SEO audit module
   * Includes meta tags, structured data, sitemap validation
   */
  ENABLE_SEO_AUDIT_MODULE: process.env.ENABLE_SEO_AUDIT_MODULE === 'true',

  /**
   * Enable new security audit module
   * Includes HTTPS, CSP, security headers validation
   */
  ENABLE_SECURITY_AUDIT_MODULE: process.env.ENABLE_SECURITY_AUDIT_MODULE === 'true',

  // ==========================================
  // PROPOSAL TEMPLATE FLAGS
  // ==========================================
  /**
   * Enable new proposal template system
   * Allows dynamic template selection and customization
   */
  ENABLE_NEW_PROPOSAL_TEMPLATES: process.env.ENABLE_NEW_PROPOSAL_TEMPLATES === 'true',

  /**
   * Enable AI-generated proposal summaries
   * Uses LLM to generate executive summaries for proposals
   */
  ENABLE_AI_PROPOSAL_SUMMARIES: process.env.ENABLE_AI_PROPOSAL_SUMMARIES === 'true',

  /**
   * Enable interactive proposal pricing
   * Allows clients to adjust pricing tiers interactively
   */
  ENABLE_INTERACTIVE_PROPOSAL_PRICING: process.env.ENABLE_INTERACTIVE_PROPOSAL_PRICING === 'true',

  /**
   * Enable proposal comparison view
   * Side-by-side comparison of current vs proposed state
   */
  ENABLE_PROPOSAL_COMPARISON_VIEW: process.env.ENABLE_PROPOSAL_COMPARISON_VIEW === 'true',

  // ==========================================
  // UI COMPONENT FLAGS
  // ==========================================
  /**
   * Enable new dashboard UI components
   * Includes redesigned charts, improved navigation
   */
  ENABLE_NEW_DASHBOARD_UI: process.env.ENABLE_NEW_DASHBOARD_UI === 'true',

  /**
   * Enable dark mode toggle
   * User-selectable light/dark theme
   */
  ENABLE_DARK_MODE: process.env.ENABLE_DARK_MODE === 'true',

  /**
   * Enable real-time audit progress updates
   * WebSocket-based live progress streaming
   */
  ENABLE_REALTIME_AUDIT_UPDATES: process.env.ENABLE_REALTIME_AUDIT_UPDATES === 'true',

  /**
   * Enable new audit findings visualization
   * Interactive charts and graphs for findings
   */
  ENABLE_NEW_FINDINGS_VIZ: process.env.ENABLE_NEW_FINDINGS_VIZ === 'true',

  // ==========================================
  // AI/ML FEATURE FLAGS
  // ==========================================
  /**
   * Enable AI sales chat agent
   * Conversational AI for lead qualification
   */
  ENABLE_AI_SALES_CHAT: process.env.ENABLE_AI_SALES_CHAT === 'true',

  /**
   * Enable predictive lead scoring
   * ML-based scoring for outreach prioritization
   */
  ENABLE_PREDICTIVE_LEAD_SCORING: process.env.ENABLE_PREDICTIVE_LEAD_SCORING === 'true',

  /**
   * Enable auto-prompt evolution
   * Automatic prompt optimization based on quality scores
   */
  ENABLE_AUTO_PROMPT_EVOLUTION: process.env.ENABLE_AUTO_PROMPT_EVOLUTION === 'true',

  // ==========================================
  // GRADUAL ROLLOUT PERCENTAGES
  // ==========================================
  /**
   * Percentage of users to enable new features for (0-100)
   * Applied to all gradual rollout flags
   */
  GRADUAL_ROLLOUT_PERCENTAGE: parseInt(process.env.GRADUAL_ROLLOUT_PERCENTAGE || '100'),

  /**
   * Percentage for accessibility module rollout
   */
  ACCESSIBILITY_MODULE_ROLLOUT_PCT: parseInt(process.env.ACCESSIBILITY_MODULE_ROLLOUT_PCT || '100'),

  /**
   * Percentage for new dashboard UI rollout
   */
  NEW_DASHBOARD_UI_ROLLOUT_PCT: parseInt(process.env.NEW_DASHBOARD_UI_ROLLOUT_PCT || '100'),
} as const;

/**
 * Type for feature flags
 */
export type FeatureFlags = typeof FEATURE_FLAGS;

/**
 * Get a specific feature flag value
 */
export function getFeatureFlag<K extends keyof typeof FEATURE_FLAGS>(
  flag: K
): (typeof FEATURE_FLAGS)[K] {
  return FEATURE_FLAGS[flag];
}

/**
 * Check if a feature is enabled
 */
export function isFeatureEnabled<K extends keyof typeof FEATURE_FLAGS>(flag: K): boolean {
  const value = FEATURE_FLAGS[flag];
  return typeof value === 'boolean' ? value : false;
}

/**
 * Get all feature flags (for admin API, debugging)
 */
export function getAllFeatureFlags(): Record<string, boolean | number> {
  return { ...FEATURE_FLAGS };
}
