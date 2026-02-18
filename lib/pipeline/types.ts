/**
 * Shared TypeScript types and interfaces for the Autonomous Proposal Engine
 * 
 * This file contains all core type definitions for the pipeline orchestrator,
 * state machine, discovery engine, outreach agent, deal closer, delivery engine,
 * and supporting components.
 */

// ============================================================================
// Core Pipeline Types
// ============================================================================

/**
 * Prospect status in the autonomous pipeline lifecycle
 */
export type ProspectStatus =
  | 'discovered'
  | 'audited'
  | 'proposed'
  | 'outreach_sent'
  | 'hot_lead'
  | 'closing'
  | 'closed_won'
  | 'delivering'
  | 'delivered'
  | 'unqualified'
  | 'audit_failed'
  | 'low_value'
  | 'closed_lost';

/**
 * Pipeline stages
 */
export enum PipelineStage {
  DISCOVERY = 'discovery',
  AUDIT = 'audit',
  DIAGNOSIS = 'diagnosis',
  PROPOSAL = 'proposal',
  OUTREACH = 'outreach',
  CLOSING = 'closing',
  DELIVERY = 'delivery',
}

/**
 * Result of a pipeline stage execution
 */
export interface StageResult {
  success: boolean;
  prospectId: string;
  fromStatus: ProspectStatus;
  toStatus: ProspectStatus;
  costCents: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Pipeline configuration per tenant
 */
export interface PipelineConfig {
  tenantId: string;
  concurrencyLimit: number;
  batchSize: number;
  painScoreThreshold: number;
  dailyVolumeLimit: number;
  spendingLimitCents: number;
  hotLeadPercentile: number; // default: 95 (top 5%)
}

/**
 * State transition record
 */
export interface StateTransition {
  from: ProspectStatus;
  to: ProspectStatus;
  timestamp: Date;
  stage: PipelineStage;
  tenantId: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Discovery and Pain Score Types
// ============================================================================

/**
 * Pain score breakdown by dimension
 */
export interface PainScoreBreakdown {
  websiteSpeed: number;      // 0-20
  mobileBroken: number;      // 0-15
  gbpNeglected: number;      // 0-15
  noSsl: number;             // 0-10
  zeroReviewResponses: number; // 0-10
  socialMediaDead: number;   // 0-10
  competitorsOutperforming: number; // 0-10
  accessibilityViolations: number; // 0-10
}

/**
 * Qualification signals from multi-source audit
 */
export interface QualificationSignals {
  pageSpeedScore?: number;       // 0-100 from Lighthouse
  mobileResponsive?: boolean;
  hasSsl?: boolean;
  gbpClaimed?: boolean;
  gbpPhotoCount?: number;
  gbpReviewCount?: number;
  gbpReviewRating?: number;
  gbpReviewResponseRate?: number; // 0-1
  gbpPostingFrequencyDays?: number;
  socialPresent?: boolean;
  socialLastPostDays?: number;
  competitorScoreGap?: number;   // How much competitors outperform
  accessibilityViolationCount?: number;
}

/**
 * Discovery configuration
 */
export interface DiscoveryConfig {
  city: string;
  state?: string;
  vertical: string;
  targetLeads: number;
  painThreshold: number;
  sources: { googlePlaces: boolean; yelp: boolean; directories: boolean };
}

/**
 * Discovery result
 */
export interface DiscoveryResult {
  jobId: string;
  tenantId: string;
  prospectsFound: number;
  prospectsQualified: number;
  costCents: number;
  completedAt: Date;
}

/**
 * Enrichment result
 */
export interface EnrichmentResult {
  leadId: string;
  email?: string;
  phone?: string;
  decisionMaker?: {
    name: string;
    title: string;
    email: string;
  };
  provider: string;
  costCents: number;
}

// ============================================================================
// Email QA and Outreach Types
// ============================================================================

/**
 * Email QA configuration
 */
export interface EmailQAConfig {
  maxReadingGradeLevel: number;  // default: 5
  maxWordCount: number;          // default: 80
  minFindingReferences: number;  // default: 2
  maxSpamRiskScore: number;      // default: 30
  minQualityScore: number;       // default: 90
  jargonWordList: string[];
  dimensionWeights: {
    readability: number;
    wordCount: number;
    jargon: number;
    findingRefs: number;
    spamRisk: number;
  };
}

/**
 * Email QA result
 */
export interface EmailQAResult {
  compositeScore: number;  // 0-100
  dimensions: {
    readability: { score: number; gradeLevel: number };
    wordCount: { score: number; count: number };
    jargon: { score: number; termsFound: string[] };
    findingRefs: { score: number; refsFound: number };
    spamRisk: { score: number; triggersFound: string[] };
  };
  passed: boolean;
  suggestions: string[];
}

/**
 * Generated email
 */
export interface GeneratedEmail {
  id: string;
  subject: string;
  body: string;
  prospectId: string;
  proposalId: string;
  findingReferences: string[];
  scorecardUrl: string;
  generatedAt: Date;
}

/**
 * Email send result
 */
export interface SendResult {
  emailId: string;
  status: 'sent' | 'failed' | 'queued';
  sendingDomain: string;
  sentAt?: Date;
  error?: string;
}

/**
 * Outreach context for email generation
 */
export interface OutreachContext {
  prospect: any; // ProspectLead from Prisma
  audit: any; // Audit from Prisma
  proposal: any; // Proposal from Prisma
  findings: any[]; // Finding[] from Prisma
  painBreakdown: PainScoreBreakdown;
  vertical: string;
  tenantBranding: any; // TenantBranding from Prisma
}

/**
 * Outreach event type
 */
export type OutreachEventType = 'open' | 'click' | 'reply' | 'bounce' | 'unsubscribe';

/**
 * Outreach outcome for learning loop
 */
export interface OutreachOutcome {
  openRate: number;
  clickRate: number;
  replyRate: number;
  conversionRate: number;
  vertical: string;
  city: string;
}

// ============================================================================
// Engagement and Deal Closing Types
// ============================================================================

/**
 * Engagement score breakdown
 */
export interface EngagementScore {
  emailOpens: number;
  emailClicks: number;
  proposalViews: number;
  proposalDwellSeconds: number;
  scrollDepth: number;
  tierInteractions: number;
  total: number;
}

/**
 * Engagement event
 */
export interface EngagementEvent {
  leadId: string;
  eventType: 'email_open' | 'email_click' | 'proposal_view' | 'tier_interaction';
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Win/loss data for learning loop
 */
export interface WinLossData {
  outcome: 'won' | 'lost' | 'ghosted';
  tierChosen?: string;
  dealValue?: number;
  lostReason?: string;
  objectionsRaised?: string[];
  competitorMentioned?: string;
}

// ============================================================================
// Delivery Types
// ============================================================================

/**
 * Deliverable task
 */
export interface Deliverable {
  id: string;
  proposalId: string;
  findingId: string;
  agentType: 'speed_optimization' | 'seo_fix' | 'accessibility' | 'security_hardening' | 'content_generation';
  status: 'queued' | 'in_progress' | 'completed' | 'verified' | 'failed' | 'escalated';
  estimatedCompletionDate: Date;
  completedAt?: Date;
  verificationAuditId?: string;
  beforeAfterComparison?: Record<string, unknown>;
}

/**
 * Verification result
 */
export interface VerificationResult {
  deliverableId: string;
  passed: boolean;
  auditId: string;
  beforeMetrics: Record<string, number>;
  afterMetrics: Record<string, number>;
  improvementPercent: number;
}

// ============================================================================
// Observability and Metrics Types
// ============================================================================

/**
 * Pipeline metrics
 */
export interface PipelineMetrics {
  tenantId: string;
  period: { start: Date; end: Date };
  discoveredPerDay: number;
  auditsCompletedPerDay: number;
  proposalsGeneratedPerDay: number;
  emailsSentPerDay: number;
  openRate: number;
  replyRate: number;
  conversionRate: number;
  stageErrorRates: Record<PipelineStage, number>;
  totalCostCents: number;
  humanTouchRate: number;
}

/**
 * Date range
 */
export interface DateRange {
  start: Date;
  end: Date;
}

// ============================================================================
// Pre-Warming Types
// ============================================================================

/**
 * Pre-warming action
 */
export interface PreWarmingAction {
  id: string;
  leadId: string;
  platform: 'gbp' | 'facebook' | 'instagram';
  actionType: 'question' | 'like' | 'comment' | 'follow' | 'post_interaction';
  scheduledAt: Date;
  executedAt?: Date;
  status: 'scheduled' | 'completed' | 'failed' | 'skipped';
}

/**
 * Pre-warming configuration
 */
export interface PreWarmingConfig {
  windowDays: { min: number; max: number }; // default: { min: 3, max: 5 }
  dailyLimits: { gbp: number; facebook: number; instagram: number }; // default: 20, 15, 15
}

// ============================================================================
// Signal Detection Types
// ============================================================================

/**
 * Signal type
 */
export type SignalType = 'bad_review' | 'website_change' | 'competitor_upgrade' | 'new_business_license' | 'hiring_spike';

/**
 * Detected signal
 */
export interface DetectedSignal {
  id: string;
  leadId?: string;
  signalType: SignalType;
  sourceData: Record<string, unknown>;
  detectedAt: Date;
  priority: 'high' | 'medium' | 'low';
  outreachTriggered: boolean;
}

// ============================================================================
// AI Sales Chat Types
// ============================================================================

/**
 * Chat message
 */
export interface ChatMessage {
  role: 'prospect' | 'assistant';
  content: string;
  timestamp: Date;
  confidence?: number; // 0-1, for assistant messages
  intent?: 'question' | 'objection' | 'purchase_intent' | 'general';
}

/**
 * Chat context
 */
export interface ChatContext {
  proposalId: string;
  auditFindings: any[]; // Finding[] from Prisma
  proposalTiers: { essentials: any; growth: any; premium: any };
  industryBenchmarks: Record<string, number>;
  objectionPlaybook: ObjectionEntry[];
  tenantBranding: any; // TenantBranding from Prisma
}

/**
 * Objection playbook entry
 */
export interface ObjectionEntry {
  objection: string;
  response: string;
  category: string;
}

// ============================================================================
// Partner Portal Types
// ============================================================================

/**
 * Partner configuration
 */
export interface PartnerConfig {
  partnerId: string;
  verticals: string[];
  geographies: string[];
  monthlyVolume: number;
  pricingModel: 'per_lead' | 'subscription';
  perLeadPrice?: number; // cents
  subscriptionPrice?: number; // cents/month
}

/**
 * Packaged lead for partner delivery
 */
export interface PackagedLead {
  leadId: string;
  businessName: string;
  auditSummary: Record<string, unknown>;
  proposalSummary: Record<string, unknown>;
  painScore: number;
  painBreakdown: PainScoreBreakdown;
  decisionMaker: { name: string; title: string; email: string };
  deliveredAt: Date;
  status: 'delivered' | 'viewed' | 'contacted' | 'converted' | 'rejected';
}

/**
 * Partner metrics
 */
export interface PartnerMetrics {
  partnerId: string;
  leadsDelivered: number;
  leadsContacted: number;
  leadsConverted: number;
  conversionRate: number;
  revenue: number;
}

// ============================================================================
// Cross-Tenant Intelligence Types
// ============================================================================

/**
 * Anonymized pattern
 */
export interface AnonymizedPattern {
  vertical: string;
  geoRegion: string;
  winRate: number;
  effectiveFindingTypes: string[];
  optimalPriceRange: { min: number; max: number };
  bestEmailPatterns: string[];
  sampleSize: number;
}

/**
 * Predictive score
 */
export interface PredictiveScore {
  closeProb: number; // 0-100
  confidence: number; // 0-1
  factors: { factor: string; weight: number; value: number }[];
  modelVersion: string;
}

// ============================================================================
// Component Interfaces
// ============================================================================

/**
 * Pipeline Orchestrator interface
 */
export interface PipelineOrchestrator {
  processStage(stage: PipelineStage, tenantId: string, batchSize: number): Promise<StageResult[]>;
  transitionProspect(prospectId: string, toStatus: ProspectStatus): Promise<void>;
  getMetrics(tenantId: string): Promise<PipelineMetrics>;
  pauseStage(stage: PipelineStage, tenantId: string): Promise<void>;
  resumeStage(stage: PipelineStage, tenantId: string): Promise<void>;
}

/**
 * Prospect State Machine interface
 */
export interface ProspectStateMachine {
  canTransition(from: ProspectStatus, to: ProspectStatus): boolean;
  transition(prospectId: string, to: ProspectStatus, stage: PipelineStage): Promise<StateTransition>;
  getHistory(prospectId: string): Promise<StateTransition[]>;
  serializeHistory(transitions: StateTransition[]): string; // JSON serialization
  deserializeHistory(json: string): StateTransition[]; // JSON deserialization
}

/**
 * Prospect Discovery Engine interface
 */
export interface ProspectDiscoveryEngine {
  discover(config: DiscoveryConfig, tenantId: string): Promise<DiscoveryResult>;
  computePainScore(signals: QualificationSignals): PainScoreBreakdown;
  enrichProspect(leadId: string): Promise<EnrichmentResult>;
}

/**
 * Pain Score Calculator interface
 */
export interface PainScoreCalculator {
  calculate(signals: QualificationSignals): { total: number; breakdown: PainScoreBreakdown };
  serialize(config: PainScoreConfig): string;   // JSON
  deserialize(json: string): PainScoreConfig;   // JSON
}

/**
 * Pain Score Configuration
 */
export interface PainScoreConfig {
  weights: PainScoreBreakdown;
  threshold: number;
}

/**
 * Outreach Agent interface
 */
export interface OutreachAgent {
  generateEmail(context: OutreachContext): Promise<GeneratedEmail>;
  scoreEmail(email: GeneratedEmail): EmailQAResult;
  sendWithRotation(email: GeneratedEmail, tenantId: string): Promise<SendResult>;
  scheduleFollowUps(leadId: string, initialEmailId: string): Promise<void>;
  processBehaviorBranch(leadId: string, event: OutreachEventType): Promise<void>;
}

/**
 * Email QA Scorer interface
 */
export interface EmailQAScorer {
  score(email: GeneratedEmail, config: EmailQAConfig): EmailQAResult;
  serializeConfig(config: EmailQAConfig): string;   // JSON
  deserializeConfig(json: string): EmailQAConfig;    // JSON
}

/**
 * Deal Closer interface
 */
export interface DealCloser {
  recordEvent(leadId: string, event: EngagementEvent): Promise<void>;
  computeEngagementScore(leadId: string): Promise<EngagementScore>;
  isHotLead(score: EngagementScore, tenantConfig: PipelineConfig): boolean;
  createCheckoutSession(leadId: string, tier: string): Promise<string>; // Stripe session URL
  handlePaymentSuccess(leadId: string, stripeSessionId: string): Promise<void>;
  handlePaymentFailure(leadId: string, stripeSessionId: string): Promise<void>;
}

/**
 * Delivery Engine interface
 */
export interface DeliveryEngine {
  generateDeliverables(proposalId: string, tier: string): Promise<Deliverable[]>;
  dispatchToAgent(deliverable: Deliverable): Promise<void>;
  verifyDeliverable(deliverableId: string): Promise<VerificationResult>;
  escalateOverdue(): Promise<Deliverable[]>;
  checkAllComplete(proposalId: string): Promise<boolean>;
}

/**
 * Learning Loop interface
 */
export interface LearningLoop {
  // Existing (from dataFlywheel.ts)
  updateBenchmark(industry: string, metrics: Record<string, number>): Promise<void>;
  trackFindingOutcome(findingType: string, accepted: boolean): Promise<void>;
  trackPromptOutcome(promptId: string, outcome: { qaScore?: number; accepted?: boolean }): Promise<void>;

  // New extensions
  trackOutreachOutcome(templateId: string, outcome: OutreachOutcome): Promise<void>;
  trackWinLoss(proposalId: string, outcome: WinLossData): Promise<void>;
  recalibratePricing(vertical: string, city: string): Promise<PricingCalibration>;
  getVerticalInsights(vertical: string): Promise<VerticalInsights>;
}

/**
 * Pricing calibration result
 */
export interface PricingCalibration {
  vertical: string;
  city: string;
  recommendedMultiplier: number;
  confidence: number;
}

/**
 * Vertical insights
 */
export interface VerticalInsights {
  vertical: string;
  avgPainScore: number;
  topFindingTypes: string[];
  avgDealValue: number;
  winRate: number;
}

/**
 * Pipeline Observer interface
 */
export interface PipelineObserver {
  getMetrics(tenantId: string, period: DateRange): Promise<PipelineMetrics>;
  checkCircuitBreaker(stage: PipelineStage, tenantId: string): Promise<boolean>;
  logStageFailure(stage: PipelineStage, prospectId: string, error: Error): Promise<void>;
  alertAdmin(tenantId: string, message: string): Promise<void>;
}

/**
 * Pre-Warming Engine interface
 */
export interface PreWarmingEngine {
  scheduleActions(leadId: string, outreachDate: Date, config: PreWarmingConfig): Promise<PreWarmingAction[]>;
  executeAction(action: PreWarmingAction): Promise<void>;
  checkWindowComplete(leadId: string): Promise<boolean>;
  getDailyActionCount(platform: string, date: Date): Promise<number>;
}

/**
 * Signal Detector interface
 */
export interface SignalDetector {
  runDetection(tenantId: string, signalType: SignalType): Promise<DetectedSignal[]>;
  deduplicateSignals(signals: DetectedSignal[]): DetectedSignal[];
  triggerSignalOutreach(signal: DetectedSignal): Promise<void>;
  getSchedule(): Record<SignalType, string>; // cron expressions
}

/**
 * AI Sales Chat interface
 */
export interface AISalesChat {
  handleMessage(context: ChatContext, history: ChatMessage[], message: string): Promise<ChatMessage>;
  detectIntent(message: string): Promise<{ intent: string; confidence: number }>;
  shouldEscalate(confidence: number, config: { threshold: number }): boolean;
  recordOutcome(proposalId: string, outcome: 'converted' | 'escalated' | 'abandoned', objections: string[]): Promise<void>;
}

/**
 * Partner Portal interface
 */
export interface PartnerPortal {
  onboardPartner(config: PartnerConfig): Promise<void>;
  matchLeadsToPartner(partnerId: string): Promise<PackagedLead[]>;
  deliverLead(partnerId: string, leadId: string): Promise<PackagedLead>;
  updateLeadStatus(partnerId: string, leadId: string, status: string): Promise<void>;
  getPartnerMetrics(partnerId: string): Promise<PartnerMetrics>;
}

/**
 * Cross-Tenant Intelligence interface
 */
export interface CrossTenantIntelligence {
  aggregatePatterns(tenantId: string, outcomes: WinLossData[]): Promise<void>;
  predictCloseProb(prospect: { vertical: string; painScore: number; geoRegion: string; businessSize?: string }): Promise<PredictiveScore>;
  getModelVersion(): string;
  rollbackModel(version: string): Promise<void>;
  ensureAnonymized(data: Record<string, unknown>): boolean; // Verify no PII
}
