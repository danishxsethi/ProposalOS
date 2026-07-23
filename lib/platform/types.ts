/**
 * Platform types for Sprint 5-6: White-Label Platform, Public API, and Widget
 */

import type { DateRange } from '../pipeline/types';

// ============================================================
// Tenant / White-Label Platform
// ============================================================

export type TenantTier = 'starter' | 'growth' | 'enterprise';
export type TenantStatus = 'active' | 'suspended' | 'cancelled';

export interface TenantBrandingConfig {
  logo: string;
  primaryColor: string;
  secondaryColor: string;
  companyName: string;
  contactEmail: string;
  supportEmail: string;
}

export interface TenantDomains {
  proposalDomain?: string; // e.g., proposals.agencyname.com
  portalDomain?: string;   // e.g., portal.agencyname.com
  widgetDomain?: string;   // e.g., audit.agencyname.com
}

export interface TenantLimits {
  prospectsPerDay: number;
  activeClients: number;
  apiRequestsPerHour: number;
}

export interface TenantBilling {
  stripeCustomerId: string;
  subscriptionId: string;
  revenueSharePercent: number; // 20-30% platform keeps; agencies keep 70-80%
}

export interface TenantSettings {
  verticals: string[];
  geographies: string[];
  autoOutreach: boolean;
  humanReviewThreshold: number;
}

export interface TenantConfig {
  id: string;
  name: string;
  slug: string; // URL-safe identifier
  tier: TenantTier;
  branding: TenantBrandingConfig;
  domains: TenantDomains;
  limits: TenantLimits;
  billing: TenantBilling;
  settings: TenantSettings;
  createdAt: Date;
  status: TenantStatus;
}

export interface TenantUsage {
  tenantId: string;
  period: DateRange;
  prospectsDiscovered: number;
  auditsCompleted: number;
  proposalsGenerated: number;
  emailsSent: number;
  dealsWon: number;
  apiRequestsUsed: number;
  costCents: number;
}

export interface BrandableContent {
  type: 'proposal' | 'email' | 'report' | 'widget';
  content: string;
}

export interface BrandedContent {
  content: string;
  appliedBranding: {
    logo: boolean;
    colors: boolean;
    companyName: boolean;
  };
}

export interface DomainValidation {
  domain: string;
  valid: boolean;
  dnsConfigured: boolean;
  sslProvisioned: boolean;
  errors: string[];
}

// ============================================================
// Public API Key
// ============================================================

export type APIPermission = 'read' | 'write' | 'admin';

export interface APIRateLimit {
  requestsPerHour: number;
  requestsPerDay: number;
}

export interface APIKeyConfig {
  id: string;
  tenantId: string;
  name: string;
  keyHash: string; // bcrypt hash of the key
  keyPrefix: string; // First 8 chars for display
  permissions: APIPermission[];
  rateLimit: APIRateLimit;
  lastUsedAt?: Date;
  expiresAt?: Date;
  status: 'active' | 'revoked';
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

// ============================================================
// Webhooks
// ============================================================

export type WebhookEvent =
  | 'audit.completed'
  | 'audit.failed'
  | 'proposal.generated'
  | 'proposal.viewed'
  | 'email.sent'
  | 'email.opened'
  | 'email.clicked'
  | 'deal.closed'
  | 'client.created';

export interface WebhookConfig {
  id: string;
  tenantId: string;
  url: string;
  events: WebhookEvent[];
  secret: string; // HMAC secret for signature verification
  status: 'active' | 'paused' | 'failed';
  failureCount: number;
  lastDeliveredAt?: Date;
}

export interface WebhookDeliveryResult {
  success: boolean;
  statusCode?: number;
  responseBody?: string;
  attemptCount: number;
  deliveredAt?: Date;
}

// ============================================================
// Embeddable Audit Widget
// ============================================================

export type WidgetFormField = 'email' | 'phone' | 'name';

export interface WidgetTheme {
  primaryColor: string;
  buttonText: string;
  formFields: WidgetFormField[];
}

export interface WidgetBehavior {
  showResultsInline: boolean;
  redirectUrl?: string;
  captureBeforeResults: boolean;
}

export interface WidgetTracking {
  utmSource?: string;
  customFields?: Record<string, string>;
}

export interface WidgetConfig {
  tenantId: string;
  containerId: string;
  theme: WidgetTheme;
  behavior: WidgetBehavior;
  tracking: WidgetTracking;
}

export interface WidgetSubmission {
  url: string;
  email?: string;
  phone?: string;
  name?: string;
  referrerUrl?: string;
  sessionId: string;
  metadata?: Record<string, unknown>;
}

export interface WidgetAnalytics {
  impressions: number;
  submissions: number;
  completions: number;
  conversionRate: number;
  averageTimeToSubmit: number;
  topReferrers: { url: string; count: number }[];
}

// ============================================================
// Billing / Revenue Share
// ============================================================

export interface BillingPeriod {
  start: Date;
  end: Date;
}

export interface RevenueShareCalculation {
  tenantId: string;
  period: BillingPeriod;
  grossRevenue: number;
  platformShare: number;
  agencyShare: number;
  sharePercent: number;
}

export interface Invoice {
  id: string;
  tenantId: string;
  period: BillingPeriod;
  lineItems: { description: string; amountCents: number }[];
  totalCents: number;
  status: 'draft' | 'sent' | 'paid' | 'overdue';
  dueAt: Date;
  createdAt: Date;
}

export interface PaymentResult {
  success: boolean;
  transactionId?: string;
  errorMessage?: string;
}

export interface SubscriptionStatus {
  tenantId: string;
  tier: TenantTier;
  status: 'active' | 'past_due' | 'cancelled' | 'trialing';
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
}

// ============================================================
// Multi-Platform Integration
// ============================================================

export type SupportedPlatform = 'wordpress' | 'shopify' | 'wix' | 'squarespace' | 'custom';

export interface PlatformCredentials {
  platform: SupportedPlatform;
  apiKey?: string;
  accessToken?: string;
  siteUrl: string;
  additionalConfig?: Record<string, unknown>;
}

export interface DeploymentChange {
  type: 'speed-optimization' | 'seo-fix' | 'content-update' | 'full-redesign';
  description: string;
  files?: { path: string; content: string }[];
  settings?: Record<string, unknown>;
}

export interface BackupResult {
  backupId: string;
  createdAt: Date;
  platform: SupportedPlatform;
  siteUrl: string;
}

export interface RollbackResult {
  success: boolean;
  backupId: string;
  rolledBackAt: Date;
  errorMessage?: string;
}

export interface DeploymentLog {
  id: string;
  clientId: string;
  platform: SupportedPlatform;
  changeType: string;
  status: 'success' | 'failed' | 'rolled_back';
  backupId?: string;
  deployedAt: Date;
  errorMessage?: string;
}

// ============================================================
// Localization
// ============================================================

export type SupportedCountry = 'US' | 'UK' | 'CA' | 'AU' | 'ES' | 'BR';
export type SupportedLanguage = 'en' | 'en-GB' | 'en-AU' | 'es' | 'fr' | 'pt-BR';

export interface CountryCompliance {
  dataResidency: boolean;
  gdprApplicable: boolean;
  pipedaApplicable: boolean;
  localRegulations: string[];
}

export interface CountryAuditModules {
  enabled: string[];
  disabled: string[];
  countrySpecific: string[];
}

export interface CountryEmailConfig {
  toneAdjustments: Record<string, string>;
  culturalReferences: string[];
  legalDisclaimer: string;
}

export interface CountryConfig {
  country: SupportedCountry;
  language: SupportedLanguage;
  currency: string;
  currencySymbol: string;
  timezone: string;
  compliance: CountryCompliance;
  auditModules: CountryAuditModules;
  emailConfig: CountryEmailConfig;
  pricingMultiplier: number;
}
