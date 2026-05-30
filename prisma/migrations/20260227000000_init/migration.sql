-- CreateEnum
CREATE TYPE "AuditStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETE', 'PARTIAL', 'DEGRADED', 'FAILED');

-- CreateEnum
CREATE TYPE "FindingType" AS ENUM ('PAINKILLER', 'VITAMIN', 'VISUAL_UX', 'VISUAL_DESIGN', 'VISUAL_COMPARISON');

-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('DRAFT', 'READY', 'SENT', 'VIEWED', 'ACCEPTED', 'PAID', 'REJECTED');

-- CreateEnum
CREATE TYPE "ProposalOutcome" AS ENUM ('WON', 'LOST', 'PENDING');

-- CreateEnum
CREATE TYPE "EffortLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "SubscriptionTier" AS ENUM ('STARTER', 'PROFESSIONAL', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "ProspectDiscoveryJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'PARTIAL', 'COMPLETE', 'FAILED');

-- CreateEnum
CREATE TYPE "ProspectLeadStatus" AS ENUM ('DISCOVERED', 'QUALIFIED', 'DISQUALIFIED', 'ENRICH_PENDING', 'ENRICHED', 'ENRICH_FAILED');

-- CreateEnum
CREATE TYPE "ProspectEnrichmentProvider" AS ENUM ('APOLLO', 'HUNTER', 'PROXYCURL', 'CLEARBIT');

-- CreateEnum
CREATE TYPE "ProspectEnrichmentStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "OutreachLeadStage" AS ENUM ('READY', 'EMAIL_SENT', 'OPENED', 'CLICKED', 'PROPOSAL_QUEUED', 'PROPOSAL_SENT', 'HOT', 'REPLIED', 'DROPPED');

-- CreateEnum
CREATE TYPE "OutreachEmailType" AS ENUM ('INITIAL', 'FOLLOWUP_COMPETITOR', 'FOLLOWUP_PROPOSAL', 'FOLLOWUP_GBP', 'FOLLOWUP_RETRY');

-- CreateEnum
CREATE TYPE "OutreachEmailStatus" AS ENUM ('PENDING', 'SENT', 'OPENED', 'CLICKED', 'REPLIED', 'FAILED', 'SUPPRESSED');

-- CreateEnum
CREATE TYPE "OutreachEventType" AS ENUM ('EMAIL_SENT', 'EMAIL_OPEN', 'EMAIL_CLICK', 'SCORECARD_VIEW', 'SCORECARD_CLICK', 'SCORECARD_DWELL_2M', 'REPLY_RECEIVED', 'PROPOSAL_SENT', 'PROPOSAL_VIEW_2M', 'LEAD_DROPPED');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('KICKOFF', 'IN_PROGRESS', 'DELIVERED', 'NEEDS_REVIEW', 'COMPLETE');

-- CreateEnum
CREATE TYPE "NPSSurveyStatus" AS ENUM ('PENDING', 'SENT', 'RESPONDED', 'FLAGGED_DETRACTOR', 'REFERRAL_SENT');

-- CreateTable
CREATE TABLE "Audit" (
    "id" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "businessCity" TEXT,
    "businessUrl" TEXT,
    "placeId" TEXT,
    "businessIndustry" TEXT,
    "verticalPlaybookId" TEXT,
    "status" "AuditStatus" NOT NULL DEFAULT 'QUEUED',
    "modulesCompleted" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "modulesFailed" JSONB NOT NULL DEFAULT '[]',
    "overallScore" INTEGER,
    "apiCostCents" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "batchId" TEXT,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "Audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Finding" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "type" "FindingType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "evidence" JSONB NOT NULL DEFAULT '[]',
    "metrics" JSONB NOT NULL DEFAULT '{}',
    "impactScore" INTEGER NOT NULL,
    "confidenceScore" INTEGER NOT NULL,
    "effortEstimate" "EffortLevel",
    "recommendedFix" JSONB NOT NULL DEFAULT '[]',
    "manuallyEdited" BOOLEAN NOT NULL DEFAULT false,
    "excluded" BOOLEAN NOT NULL DEFAULT false,
    "confidenceLevel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT,

    CONSTRAINT "Finding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proposal" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "ProposalStatus" NOT NULL DEFAULT 'DRAFT',
    "prospectEmail" TEXT,
    "executiveSummary" TEXT,
    "painClusters" JSONB NOT NULL DEFAULT '[]',
    "tierEssentials" JSONB NOT NULL DEFAULT '{}',
    "tierGrowth" JSONB NOT NULL DEFAULT '{}',
    "tierPremium" JSONB NOT NULL DEFAULT '{}',
    "pricing" JSONB NOT NULL DEFAULT '{}',
    "stripePriceId" TEXT,
    "stripeAmountCents" INTEGER,
    "assumptions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "disclaimers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "nextSteps" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "comparisonReport" JSONB,
    "pdfUrl" TEXT,
    "pdfGeneratedAt" TIMESTAMP(3),
    "webLinkToken" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "viewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT,
    "templateId" TEXT,
    "qaScore" INTEGER DEFAULT 0,
    "qaResults" JSONB NOT NULL DEFAULT '{}',
    "clientScore" INTEGER DEFAULT 0,
    "clientScoreResults" JSONB NOT NULL DEFAULT '{}',
    "humanCloseabilityScore" DOUBLE PRECISION,
    "outcome" "ProposalOutcome",
    "closedAt" TIMESTAMP(3),
    "dealValue" DECIMAL(10,2),
    "lostReason" TEXT,
    "notes" TEXT,
    "replyReceivedAt" TIMESTAMP(3),
    "meetingBookedAt" TIMESTAMP(3),
    "tierChosen" TEXT,
    "shareCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Proposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposalAcceptance" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT,
    "message" TEXT,
    "ipAddress" TEXT,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProposalAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposalView" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scrollDepth" INTEGER NOT NULL DEFAULT 0,
    "timeOnPageSeconds" INTEGER NOT NULL DEFAULT 0,
    "ctaClicked" BOOLEAN NOT NULL DEFAULT false,
    "expandedSections" JSONB NOT NULL DEFAULT '[]',
    "userAgent" TEXT,
    "referrer" TEXT,
    "ipHash" TEXT,

    CONSTRAINT "ProposalView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactRequest" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "bestTime" TEXT,
    "preferredTier" TEXT,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "ContactRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposalFollowUp" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "step" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "emailSubject" TEXT NOT NULL,
    "emailBody" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProposalFollowUp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceSnapshot" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "rawResponse" JSONB NOT NULL,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT,

    CONSTRAINT "EvidenceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposalTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "industry" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "headerHtml" TEXT,
    "introText" TEXT,
    "outroText" TEXT,
    "ctaText" TEXT,
    "ctaUrl" TEXT,
    "customCss" TEXT,
    "footnotes" TEXT,
    "showFindings" BOOLEAN NOT NULL DEFAULT true,
    "showCompetitorMatrix" BOOLEAN NOT NULL DEFAULT true,
    "showRoi" BOOLEAN NOT NULL DEFAULT true,
    "assumptions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "disclaimers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "nextSteps" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pricing" JSONB NOT NULL DEFAULT '{}',
    "tierSettings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT,

    CONSTRAINT "ProposalTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "passwordHash" TEXT,
    "role" TEXT NOT NULL DEFAULT 'member',
    "subscriptionTier" "SubscriptionTier" NOT NULL DEFAULT 'STARTER',
    "stripeCustomerId" TEXT,
    "subscriptionId" TEXT,
    "auditsThisMonth" INTEGER NOT NULL DEFAULT 0,
    "auditsLimit" INTEGER NOT NULL DEFAULT 10,
    "tenantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "domain" TEXT,
    "planTier" TEXT NOT NULL DEFAULT 'free',
    "status" TEXT NOT NULL DEFAULT 'active',
    "subscriptionStatus" TEXT NOT NULL DEFAULT 'inactive',
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "stripeSubscriptionItemId" TEXT,
    "onboardingCompletedAt" TIMESTAMP(3),
    "branding" JSONB NOT NULL DEFAULT '{}',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "requireHumanReview" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "token" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invitedBy" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Playbook" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "industry" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "moduleConfig" JSONB NOT NULL DEFAULT '{}',
    "pricingConfig" JSONB NOT NULL DEFAULT '{}',
    "promptOverrides" JSONB NOT NULL DEFAULT '{}',
    "customFindings" JSONB NOT NULL DEFAULT '[]',
    "proposalLanguage" JSONB NOT NULL DEFAULT '{}',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Playbook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditSchedule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "businessCity" TEXT,
    "businessUrl" TEXT,
    "industry" TEXT,
    "frequency" TEXT NOT NULL,
    "nextRunAt" TIMESTAMP(3) NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "lastAuditId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditTarget" (
    "id" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "businessCity" TEXT,
    "businessUrl" TEXT NOT NULL,
    "placeId" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "rating" DOUBLE PRECISION,
    "reviewCount" INTEGER,
    "category" TEXT,
    "vertical" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'saskatoon-validation',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProspectDiscoveryJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT,
    "metro" TEXT,
    "vertical" TEXT NOT NULL,
    "targetLeads" INTEGER NOT NULL DEFAULT 200,
    "painThreshold" INTEGER NOT NULL DEFAULT 60,
    "sourceConfig" JSONB NOT NULL DEFAULT '{"googlePlaces":true,"yelp":true,"directories":true}',
    "status" "ProspectDiscoveryJobStatus" NOT NULL DEFAULT 'QUEUED',
    "runAttempts" INTEGER NOT NULL DEFAULT 0,
    "discoveredCount" INTEGER NOT NULL DEFAULT 0,
    "qualifiedCount" INTEGER NOT NULL DEFAULT 0,
    "enrichedCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "nextRunAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProspectDiscoveryJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProspectLead" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "discoveryJobId" TEXT,
    "source" TEXT NOT NULL,
    "sourceExternalId" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "businessName" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT,
    "vertical" TEXT NOT NULL,
    "category" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "rating" DOUBLE PRECISION,
    "reviewCount" INTEGER,
    "status" "ProspectLeadStatus" NOT NULL DEFAULT 'DISCOVERED',
    "painScore" INTEGER,
    "painThreshold" INTEGER NOT NULL DEFAULT 60,
    "painBreakdown" JSONB NOT NULL DEFAULT '{}',
    "topFindings" JSONB NOT NULL DEFAULT '[]',
    "auditSummarySnippet" TEXT,
    "qualificationEvidence" JSONB NOT NULL DEFAULT '{}',
    "qualifiedAt" TIMESTAMP(3),
    "disqualifiedReason" TEXT,
    "anonymizedAt" TIMESTAMP(3),
    "decisionMakerName" TEXT,
    "decisionMakerTitle" TEXT,
    "decisionMakerLinkedin" TEXT,
    "decisionMakerEmail" TEXT,
    "decisionMakerEmailStatus" TEXT,
    "enrichmentState" JSONB NOT NULL DEFAULT '{}',
    "estimatedCostCents" INTEGER NOT NULL DEFAULT 0,
    "outreachStage" "OutreachLeadStage" NOT NULL DEFAULT 'READY',
    "outreachAttempts" INTEGER NOT NULL DEFAULT 0,
    "outreachOpenCount" INTEGER NOT NULL DEFAULT 0,
    "outreachClickCount" INTEGER NOT NULL DEFAULT 0,
    "outreachReplyCount" INTEGER NOT NULL DEFAULT 0,
    "outreachLastContactedAt" TIMESTAMP(3),
    "outreachNextActionAt" TIMESTAMP(3),
    "outreachDroppedAt" TIMESTAMP(3),
    "outreachDropReason" TEXT,
    "scorecardToken" TEXT,
    "scorecardFirstViewedAt" TIMESTAMP(3),
    "scorecardLastViewedAt" TIMESTAMP(3),
    "scorecardTotalViewSeconds" INTEGER NOT NULL DEFAULT 0,
    "pipelineStatus" TEXT NOT NULL DEFAULT 'discovered',
    "auditId" TEXT,
    "proposalId" TEXT,
    "engagementScore" INTEGER NOT NULL DEFAULT 0,
    "lastEngagementAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProspectLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProspectEnrichmentRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "provider" "ProspectEnrichmentProvider" NOT NULL,
    "status" "ProspectEnrichmentStatus" NOT NULL DEFAULT 'PENDING',
    "requestPayload" JSONB NOT NULL DEFAULT '{}',
    "responsePayload" JSONB NOT NULL DEFAULT '{}',
    "costCents" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProspectEnrichmentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachSendingDomain" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "fromName" TEXT,
    "dailyLimit" INTEGER NOT NULL DEFAULT 50,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutreachSendingDomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachDomainDailyStat" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "domainId" TEXT NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "openCount" INTEGER NOT NULL DEFAULT 0,
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "replyCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutreachDomainDailyStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachEmail" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "domainId" TEXT,
    "type" "OutreachEmailType" NOT NULL DEFAULT 'INITIAL',
    "status" "OutreachEmailStatus" NOT NULL DEFAULT 'PENDING',
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "qualityScore" INTEGER NOT NULL DEFAULT 0,
    "readabilityGrade" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "spamRisk" INTEGER NOT NULL DEFAULT 0,
    "findingsUsed" JSONB NOT NULL DEFAULT '[]',
    "scorecardUrl" TEXT,
    "proposalUrl" TEXT,
    "trackingPixelUrl" TEXT,
    "trackingClickBaseUrl" TEXT,
    "providerMessageId" TEXT,
    "errorMessage" TEXT,
    "sentAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "repliedAt" TIMESTAMP(3),
    "scheduledAt" TIMESTAMP(3),
    "sequencePosition" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutreachEmail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachEmailEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "emailId" TEXT,
    "type" "OutreachEventType" NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutreachEmailEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scopes" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "rateLimitPerDay" INTEGER NOT NULL DEFAULT 1000,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "lastResetAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantBranding" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "brandName" TEXT,
    "tagline" TEXT,
    "logoUrl" TEXT,
    "logoDarkUrl" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#8B5CF6',
    "secondaryColor" TEXT NOT NULL DEFAULT '#38BDF8',
    "accentColor" TEXT NOT NULL DEFAULT '#F59E0B',
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "websiteUrl" TEXT,
    "customDomain" TEXT,
    "customDomainVerified" BOOLEAN NOT NULL DEFAULT false,
    "customDomainVerifiedAt" TIMESTAMP(3),
    "footerText" TEXT,
    "showPoweredBy" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantBranding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "ProspectStateTransition" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "fromStatus" TEXT NOT NULL,
    "toStatus" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProspectStateTransition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryTask" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "agentType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "estimatedCompletionDate" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "verificationAuditId" TEXT,
    "beforeAfterComparison" JSONB,
    "errorMessage" TEXT,
    "artifactId" TEXT,
    "bundleId" TEXT,
    "confidenceLevel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipelineConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "concurrencyLimit" INTEGER NOT NULL DEFAULT 10,
    "batchSize" INTEGER NOT NULL DEFAULT 50,
    "painScoreThreshold" INTEGER NOT NULL DEFAULT 60,
    "dailyVolumeLimit" INTEGER NOT NULL DEFAULT 200,
    "spendingLimitCents" INTEGER NOT NULL DEFAULT 100000,
    "hotLeadPercentile" INTEGER NOT NULL DEFAULT 95,
    "emailMinQualityScore" INTEGER NOT NULL DEFAULT 90,
    "maxEmailsPerDomainPerDay" INTEGER NOT NULL DEFAULT 50,
    "followUpSchedule" JSONB NOT NULL DEFAULT '[3, 7, 14]',
    "pausedStages" JSONB NOT NULL DEFAULT '[]',
    "country" TEXT NOT NULL DEFAULT 'US',
    "language" TEXT NOT NULL DEFAULT 'en',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "pricingMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PipelineConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipelineErrorLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "prospectId" TEXT,
    "errorType" TEXT NOT NULL,
    "errorMessage" TEXT NOT NULL,
    "stackTrace" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PipelineErrorLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachTemplatePerformance" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "vertical" TEXT NOT NULL,
    "city" TEXT,
    "totalSent" INTEGER NOT NULL DEFAULT 0,
    "openCount" INTEGER NOT NULL DEFAULT 0,
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "replyCount" INTEGER NOT NULL DEFAULT 0,
    "conversionCount" INTEGER NOT NULL DEFAULT 0,
    "openRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "clickRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "replyRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "conversionRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutreachTemplatePerformance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WinLossRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "vertical" TEXT NOT NULL,
    "city" TEXT,
    "outcome" TEXT NOT NULL,
    "tierChosen" TEXT,
    "dealValue" DECIMAL(10,2),
    "lostReason" TEXT,
    "objectionsRaised" JSONB NOT NULL DEFAULT '[]',
    "competitorMentioned" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WinLossRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreWarmingAction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "executedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PreWarmingAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DetectedSignal" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leadId" TEXT,
    "signalType" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "sourceData" JSONB NOT NULL DEFAULT '{}',
    "outreachTriggered" BOOLEAN NOT NULL DEFAULT false,
    "outreachEmailId" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DetectedSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatConversation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "messages" JSONB NOT NULL DEFAULT '[]',
    "outcome" TEXT,
    "objections" JSONB NOT NULL DEFAULT '[]',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ChatConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgencyPartner" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactName" TEXT,
    "verticals" JSONB NOT NULL DEFAULT '[]',
    "geographies" JSONB NOT NULL DEFAULT '[]',
    "monthlyVolume" INTEGER NOT NULL DEFAULT 50,
    "pricingModel" TEXT NOT NULL,
    "perLeadPriceCents" INTEGER,
    "subscriptionPriceCents" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgencyPartner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerDeliveredLead" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "packagedData" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'delivered',
    "deliveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerDeliveredLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SharedIntelligenceModel" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "patterns" JSONB NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SharedIntelligenceModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposalOutreach" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "emailSubject" TEXT NOT NULL,
    "emailBody" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openedAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "tenantId" TEXT,

    CONSTRAINT "ProposalOutreach_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FollowUpEmailSend" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "step" INTEGER NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "recipientName" TEXT,
    "emailSubject" TEXT NOT NULL,
    "emailBody" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT,

    CONSTRAINT "FollowUpEmailSend_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailBlocklist" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailBlocklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "credits" INTEGER NOT NULL DEFAULT 1,
    "stripeUsageRecordId" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_webhook_events" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "failed_webhook_events" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "errorMessage" TEXT,
    "errorStack" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastAttempt" TIMESTAMP(3),
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "failed_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart_abandonment_events" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "checkoutType" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "cart_abandonment_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "interval" TEXT,
    "status" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "tiers" JSONB NOT NULL,
    "stripeProductId" TEXT,
    "stripePriceIds" JSONB,
    "features" JSONB,
    "limits" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "pricing_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "stripeSubscriptionId" TEXT NOT NULL,
    "stripePriceId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "stripeInvoiceId" TEXT,
    "stripeChargeId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "status" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkout_attempts" (
    "id" TEXT NOT NULL,
    "stripeSessionId" TEXT NOT NULL,
    "tenantId" TEXT,
    "proposalId" TEXT,
    "type" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checkout_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BenchmarkStats" (
    "id" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "city" TEXT,
    "sampleSize" INTEGER NOT NULL DEFAULT 0,
    "metrics" JSONB NOT NULL DEFAULT '{}',
    "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BenchmarkStats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FindingEffectiveness" (
    "id" TEXT NOT NULL,
    "findingType" TEXT NOT NULL,
    "totalOccurrences" INTEGER NOT NULL DEFAULT 0,
    "acceptedCount" INTEGER NOT NULL DEFAULT 0,
    "rejectedCount" INTEGER NOT NULL DEFAULT 0,
    "conversionPower" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FindingEffectiveness_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromptPerformance" (
    "id" TEXT NOT NULL,
    "promptId" TEXT NOT NULL,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "avgQaScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "acceptanceRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromptPerformance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FindingStatus" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'not_started',
    "notes" TEXT,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FindingStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientMessage" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewSnapshot" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rating" DOUBLE PRECISION NOT NULL,
    "count" INTEGER NOT NULL,
    "source" TEXT NOT NULL,

    CONSTRAINT "ReviewSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureFlag" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationState" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "history" JSONB NOT NULL DEFAULT '[]',
    "objectionsRaised" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "questionsAsked" INTEGER NOT NULL DEFAULT 0,
    "sentimentScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "engagementScore" INTEGER NOT NULL DEFAULT 0,
    "escalated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ObjectionLog" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "prospectText" TEXT NOT NULL,
    "agentResponse" TEXT NOT NULL,
    "escalated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ObjectionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailSequence" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "industry" TEXT,
    "role" TEXT,
    "sizeScope" TEXT,
    "emails" JSONB NOT NULL DEFAULT '[]',
    "analytics" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailSequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneratedArtifact" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "artifactType" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "validationResults" JSONB NOT NULL DEFAULT '[]',
    "confidenceLevel" TEXT,
    "estimatedImpact" TEXT,
    "installationInstructions" TEXT,
    "beforePreview" TEXT,
    "afterPreview" TEXT,
    "wordpressPlugin" TEXT,
    "humanReviewFlag" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GeneratedArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryBundle" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "zipUrl" TEXT,
    "readmeContent" TEXT,
    "artifactCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'assembling',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryBundle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdversarialQARun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "auditId" TEXT,
    "proposalId" TEXT,
    "runType" TEXT NOT NULL,
    "hallucinationFlags" JSONB NOT NULL DEFAULT '[]',
    "consistencyFlags" JSONB NOT NULL DEFAULT '[]',
    "competitorFlags" JSONB NOT NULL DEFAULT '[]',
    "totalClaimsChecked" INTEGER NOT NULL DEFAULT 0,
    "totalFlagged" INTEGER NOT NULL DEFAULT 0,
    "hardenedContent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdversarialQARun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HallucinationLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "auditId" TEXT,
    "proposalId" TEXT,
    "category" TEXT NOT NULL,
    "flaggedText" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HallucinationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HumanReviewFlag" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "artifactId" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HumanReviewFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'KICKOFF',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NPSSurvey" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "score" INTEGER,
    "feedback" TEXT,
    "surveyDay" INTEGER NOT NULL,
    "status" "NPSSurveyStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NPSSurvey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QATelemetry" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "graphName" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "qaScore" DOUBLE PRECISION NOT NULL,
    "hallucinationCount" INTEGER NOT NULL,
    "unsupportedCount" INTEGER NOT NULL,
    "consistencyCount" INTEGER NOT NULL,
    "hallucinations" JSONB NOT NULL,
    "unsupportedClaims" JSONB NOT NULL,
    "retryTriggered" BOOLEAN NOT NULL DEFAULT false,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "tenantId" TEXT,
    "auditId" TEXT,
    "proposalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QATelemetry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromptPromotionLog" (
    "id" TEXT NOT NULL,
    "promptId" TEXT NOT NULL,
    "winnerVariantId" TEXT NOT NULL,
    "loserVariantId" TEXT NOT NULL,
    "winnerAvgQuality" DOUBLE PRECISION NOT NULL,
    "loserAvgQuality" DOUBLE PRECISION NOT NULL,
    "qualityDeltaPct" DOUBLE PRECISION NOT NULL,
    "winnerAvgLatencyMs" DOUBLE PRECISION NOT NULL,
    "loserAvgLatencyMs" DOUBLE PRECISION NOT NULL,
    "latencyIncreasePct" DOUBLE PRECISION NOT NULL,
    "winnerSampleSize" INTEGER NOT NULL,
    "loserSampleSize" INTEGER NOT NULL,
    "promotedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "PromptPromotionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Metric" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "labels" JSONB NOT NULL DEFAULT '{}',
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Metric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitoringConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonitoringConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocationGroup" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "locations" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocationGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plugin" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "version" TEXT NOT NULL,
    "author" TEXT,
    "config" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plugin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Audit_status_idx" ON "Audit"("status");

-- CreateIndex
CREATE INDEX "Audit_createdAt_idx" ON "Audit"("createdAt");

-- CreateIndex
CREATE INDEX "Audit_tenantId_idx" ON "Audit"("tenantId");

-- CreateIndex
CREATE INDEX "Audit_batchId_idx" ON "Audit"("batchId");

-- CreateIndex
CREATE INDEX "Finding_auditId_idx" ON "Finding"("auditId");

-- CreateIndex
CREATE INDEX "Finding_type_idx" ON "Finding"("type");

-- CreateIndex

-- CreateIndex
CREATE UNIQUE INDEX "Proposal_webLinkToken_key" ON "Proposal"("webLinkToken");

-- CreateIndex
CREATE INDEX "Proposal_auditId_idx" ON "Proposal"("auditId");

-- CreateIndex
CREATE INDEX "Proposal_webLinkToken_idx" ON "Proposal"("webLinkToken");

-- CreateIndex
CREATE INDEX "Proposal_status_idx" ON "Proposal"("status");

-- CreateIndex

-- CreateIndex
CREATE INDEX "Proposal_clientScore_idx" ON "Proposal"("clientScore");

-- CreateIndex
CREATE INDEX "Proposal_replyReceivedAt_idx" ON "Proposal"("replyReceivedAt");

-- CreateIndex
CREATE INDEX "Proposal_meetingBookedAt_idx" ON "Proposal"("meetingBookedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProposalAcceptance_proposalId_key" ON "ProposalAcceptance"("proposalId");

-- CreateIndex
CREATE INDEX "ProposalView_proposalId_idx" ON "ProposalView"("proposalId");

-- CreateIndex
CREATE INDEX "ProposalView_sessionId_idx" ON "ProposalView"("sessionId");

-- CreateIndex
CREATE INDEX "ContactRequest_proposalId_idx" ON "ContactRequest"("proposalId");

-- CreateIndex
CREATE INDEX "ContactRequest_tenantId_idx" ON "ContactRequest"("tenantId");

-- CreateIndex
CREATE INDEX "ProposalFollowUp_proposalId_idx" ON "ProposalFollowUp"("proposalId");

-- CreateIndex
CREATE INDEX "ProposalFollowUp_tenantId_idx" ON "ProposalFollowUp"("tenantId");

-- CreateIndex
CREATE INDEX "ProposalFollowUp_status_idx" ON "ProposalFollowUp"("status");

-- CreateIndex
CREATE INDEX "ProposalFollowUp_scheduledAt_idx" ON "ProposalFollowUp"("scheduledAt");

-- CreateIndex
CREATE INDEX "EvidenceSnapshot_auditId_idx" ON "EvidenceSnapshot"("auditId");

-- CreateIndex

-- CreateIndex
CREATE INDEX "ProposalTemplate_industry_idx" ON "ProposalTemplate"("industry");

-- CreateIndex
CREATE INDEX "ProposalTemplate_createdAt_idx" ON "ProposalTemplate"("createdAt");

-- CreateIndex

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "User"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "User_subscriptionId_key" ON "User"("subscriptionId");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_subscriptionTier_idx" ON "User"("subscriptionTier");

-- CreateIndex

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_domain_key" ON "Tenant"("domain");

-- CreateIndex
CREATE INDEX "Tenant_domain_idx" ON "Tenant"("domain");

-- CreateIndex
CREATE INDEX "Tenant_isActive_idx" ON "Tenant"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_token_key" ON "Invitation"("token");

-- CreateIndex
CREATE INDEX "Invitation_tenantId_idx" ON "Invitation"("tenantId");

-- CreateIndex
CREATE INDEX "Invitation_token_idx" ON "Invitation"("token");

-- CreateIndex
CREATE INDEX "Playbook_industry_idx" ON "Playbook"("industry");

-- CreateIndex
CREATE INDEX "Playbook_tenantId_idx" ON "Playbook"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Playbook_tenantId_industry_key" ON "Playbook"("tenantId", "industry");

-- CreateIndex
CREATE INDEX "AuditSchedule_tenantId_idx" ON "AuditSchedule"("tenantId");

-- CreateIndex
CREATE INDEX "AuditSchedule_nextRunAt_idx" ON "AuditSchedule"("nextRunAt");

-- CreateIndex
CREATE INDEX "AuditSchedule_isActive_idx" ON "AuditSchedule"("isActive");

-- CreateIndex
CREATE INDEX "AuditTarget_placeId_idx" ON "AuditTarget"("placeId");

-- CreateIndex
CREATE INDEX "AuditTarget_vertical_idx" ON "AuditTarget"("vertical");

-- CreateIndex
CREATE INDEX "AuditTarget_source_idx" ON "AuditTarget"("source");

-- CreateIndex
CREATE INDEX "ProspectDiscoveryJob_tenantId_status_nextRunAt_idx" ON "ProspectDiscoveryJob"("tenantId", "status", "nextRunAt");

-- CreateIndex
CREATE INDEX "ProspectDiscoveryJob_city_vertical_idx" ON "ProspectDiscoveryJob"("city", "vertical");

-- CreateIndex
CREATE INDEX "ProspectDiscoveryJob_createdAt_idx" ON "ProspectDiscoveryJob"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProspectLead_scorecardToken_key" ON "ProspectLead"("scorecardToken");

-- CreateIndex
CREATE INDEX "ProspectLead_tenantId_status_idx" ON "ProspectLead"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ProspectLead_city_vertical_idx" ON "ProspectLead"("city", "vertical");

-- CreateIndex
CREATE INDEX "ProspectLead_painScore_idx" ON "ProspectLead"("painScore");

-- CreateIndex
CREATE INDEX "ProspectLead_discoveryJobId_idx" ON "ProspectLead"("discoveryJobId");

-- CreateIndex
CREATE INDEX "ProspectLead_createdAt_idx" ON "ProspectLead"("createdAt");

-- CreateIndex
CREATE INDEX "ProspectLead_tenantId_outreachStage_outreachNextActionAt_idx" ON "ProspectLead"("tenantId", "outreachStage", "outreachNextActionAt");

-- CreateIndex
CREATE INDEX "ProspectLead_pipelineStatus_idx" ON "ProspectLead"("pipelineStatus");

-- CreateIndex
CREATE INDEX "ProspectLead_engagementScore_idx" ON "ProspectLead"("engagementScore");

-- CreateIndex
CREATE UNIQUE INDEX "ProspectLead_tenantId_source_sourceExternalId_key" ON "ProspectLead"("tenantId", "source", "sourceExternalId");

-- CreateIndex
CREATE INDEX "ProspectEnrichmentRun_tenantId_provider_status_idx" ON "ProspectEnrichmentRun"("tenantId", "provider", "status");

-- CreateIndex
CREATE INDEX "ProspectEnrichmentRun_leadId_createdAt_idx" ON "ProspectEnrichmentRun"("leadId", "createdAt");

-- CreateIndex
CREATE INDEX "OutreachSendingDomain_tenantId_isActive_idx" ON "OutreachSendingDomain"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "OutreachSendingDomain_tenantId_fromEmail_key" ON "OutreachSendingDomain"("tenantId", "fromEmail");

-- CreateIndex
CREATE INDEX "OutreachDomainDailyStat_tenantId_day_idx" ON "OutreachDomainDailyStat"("tenantId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "OutreachDomainDailyStat_domainId_day_key" ON "OutreachDomainDailyStat"("domainId", "day");

-- CreateIndex
CREATE INDEX "OutreachEmail_tenantId_status_createdAt_idx" ON "OutreachEmail"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "OutreachEmail_leadId_createdAt_idx" ON "OutreachEmail"("leadId", "createdAt");

-- CreateIndex
CREATE INDEX "OutreachEmail_domainId_createdAt_idx" ON "OutreachEmail"("domainId", "createdAt");

-- CreateIndex
CREATE INDEX "OutreachEmail_type_status_idx" ON "OutreachEmail"("type", "status");

-- CreateIndex
CREATE INDEX "OutreachEmail_scheduledAt_status_idx" ON "OutreachEmail"("scheduledAt", "status");

-- CreateIndex
CREATE INDEX "OutreachEmailEvent_tenantId_type_occurredAt_idx" ON "OutreachEmailEvent"("tenantId", "type", "occurredAt");

-- CreateIndex
CREATE INDEX "OutreachEmailEvent_leadId_occurredAt_idx" ON "OutreachEmailEvent"("leadId", "occurredAt");

-- CreateIndex
CREATE INDEX "OutreachEmailEvent_emailId_occurredAt_idx" ON "OutreachEmailEvent"("emailId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "ApiKey_tenantId_idx" ON "ApiKey"("tenantId");

-- CreateIndex
CREATE INDEX "ApiKey_keyHash_idx" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE UNIQUE INDEX "TenantBranding_tenantId_key" ON "TenantBranding"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantBranding_customDomain_key" ON "TenantBranding"("customDomain");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE INDEX "ProspectStateTransition_leadId_createdAt_idx" ON "ProspectStateTransition"("leadId", "createdAt");

-- CreateIndex
CREATE INDEX "ProspectStateTransition_tenantId_createdAt_idx" ON "ProspectStateTransition"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "DeliveryTask_tenantId_status_idx" ON "DeliveryTask"("tenantId", "status");

-- CreateIndex
CREATE INDEX "DeliveryTask_proposalId_idx" ON "DeliveryTask"("proposalId");

-- CreateIndex
CREATE INDEX "DeliveryTask_estimatedCompletionDate_idx" ON "DeliveryTask"("estimatedCompletionDate");

-- CreateIndex
CREATE UNIQUE INDEX "PipelineConfig_tenantId_key" ON "PipelineConfig"("tenantId");

-- CreateIndex
CREATE INDEX "PipelineConfig_tenantId_idx" ON "PipelineConfig"("tenantId");

-- CreateIndex
CREATE INDEX "PipelineErrorLog_tenantId_stage_createdAt_idx" ON "PipelineErrorLog"("tenantId", "stage", "createdAt");

-- CreateIndex
CREATE INDEX "PipelineErrorLog_createdAt_idx" ON "PipelineErrorLog"("createdAt");

-- CreateIndex
CREATE INDEX "OutreachTemplatePerformance_vertical_idx" ON "OutreachTemplatePerformance"("vertical");

-- CreateIndex
CREATE UNIQUE INDEX "OutreachTemplatePerformance_templateId_vertical_city_key" ON "OutreachTemplatePerformance"("templateId", "vertical", "city");

-- CreateIndex
CREATE INDEX "WinLossRecord_tenantId_vertical_outcome_idx" ON "WinLossRecord"("tenantId", "vertical", "outcome");

-- CreateIndex
CREATE INDEX "WinLossRecord_createdAt_idx" ON "WinLossRecord"("createdAt");

-- CreateIndex
CREATE INDEX "PreWarmingAction_tenantId_platform_scheduledAt_idx" ON "PreWarmingAction"("tenantId", "platform", "scheduledAt");

-- CreateIndex
CREATE INDEX "PreWarmingAction_leadId_idx" ON "PreWarmingAction"("leadId");

-- CreateIndex
CREATE INDEX "DetectedSignal_tenantId_signalType_detectedAt_idx" ON "DetectedSignal"("tenantId", "signalType", "detectedAt");

-- CreateIndex
CREATE INDEX "DetectedSignal_leadId_idx" ON "DetectedSignal"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "DetectedSignal_tenantId_leadId_signalType_detectedAt_key" ON "DetectedSignal"("tenantId", "leadId", "signalType", "detectedAt");

-- CreateIndex
CREATE INDEX "ChatConversation_tenantId_proposalId_idx" ON "ChatConversation"("tenantId", "proposalId");

-- CreateIndex
CREATE INDEX "ChatConversation_sessionId_idx" ON "ChatConversation"("sessionId");

-- CreateIndex
CREATE INDEX "AgencyPartner_isActive_idx" ON "AgencyPartner"("isActive");

-- CreateIndex
CREATE INDEX "PartnerDeliveredLead_partnerId_status_idx" ON "PartnerDeliveredLead"("partnerId", "status");

-- CreateIndex
CREATE INDEX "PartnerDeliveredLead_leadId_idx" ON "PartnerDeliveredLead"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "SharedIntelligenceModel_version_key" ON "SharedIntelligenceModel"("version");

-- CreateIndex
CREATE INDEX "SharedIntelligenceModel_version_idx" ON "SharedIntelligenceModel"("version");

-- CreateIndex
CREATE INDEX "SharedIntelligenceModel_isActive_idx" ON "SharedIntelligenceModel"("isActive");

-- CreateIndex
CREATE INDEX "ProposalOutreach_proposalId_idx" ON "ProposalOutreach"("proposalId");

-- CreateIndex
CREATE INDEX "ProposalOutreach_recipientEmail_idx" ON "ProposalOutreach"("recipientEmail");

-- CreateIndex

-- CreateIndex
CREATE INDEX "FollowUpEmailSend_auditId_idx" ON "FollowUpEmailSend"("auditId");

-- CreateIndex
CREATE INDEX "FollowUpEmailSend_proposalId_idx" ON "FollowUpEmailSend"("proposalId");

-- CreateIndex
CREATE INDEX "FollowUpEmailSend_recipientEmail_idx" ON "FollowUpEmailSend"("recipientEmail");

-- CreateIndex

-- CreateIndex
CREATE UNIQUE INDEX "EmailBlocklist_email_key" ON "EmailBlocklist"("email");

-- CreateIndex
CREATE INDEX "EmailBlocklist_email_idx" ON "EmailBlocklist"("email");

-- CreateIndex
CREATE INDEX "UsageRecord_tenantId_idx" ON "UsageRecord"("tenantId");

-- CreateIndex
CREATE INDEX "UsageRecord_timestamp_idx" ON "UsageRecord"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "failed_webhook_events_eventId_key" ON "failed_webhook_events"("eventId");

-- CreateIndex
CREATE INDEX "failed_webhook_events_eventId_idx" ON "failed_webhook_events"("eventId");

-- CreateIndex
CREATE INDEX "failed_webhook_events_resolved_createdAt_idx" ON "failed_webhook_events"("resolved", "createdAt");

-- CreateIndex
CREATE INDEX "cart_abandonment_events_sessionId_timestamp_idx" ON "cart_abandonment_events"("sessionId", "timestamp");

-- CreateIndex
CREATE INDEX "cart_abandonment_events_proposalId_timestamp_idx" ON "cart_abandonment_events"("proposalId", "timestamp");

-- CreateIndex
CREATE INDEX "cart_abandonment_events_checkoutType_timestamp_idx" ON "cart_abandonment_events"("checkoutType", "timestamp");

-- CreateIndex
CREATE INDEX "cart_abandonment_events_step_timestamp_idx" ON "cart_abandonment_events"("step", "timestamp");

-- CreateIndex
CREATE INDEX "pricing_plans_type_status_idx" ON "pricing_plans"("type", "status");

-- CreateIndex
CREATE INDEX "pricing_plans_stripeProductId_idx" ON "pricing_plans"("stripeProductId");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_stripeSubscriptionId_key" ON "subscriptions"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "subscriptions_tenantId_idx" ON "subscriptions"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_stripeInvoiceId_key" ON "payments"("stripeInvoiceId");

-- CreateIndex
CREATE INDEX "payments_tenantId_idx" ON "payments"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "checkout_attempts_stripeSessionId_key" ON "checkout_attempts"("stripeSessionId");

-- CreateIndex

-- CreateIndex
CREATE INDEX "checkout_attempts_proposalId_idx" ON "checkout_attempts"("proposalId");

-- CreateIndex
CREATE UNIQUE INDEX "BenchmarkStats_industry_city_key" ON "BenchmarkStats"("industry", "city");

-- CreateIndex
CREATE UNIQUE INDEX "FindingEffectiveness_findingType_key" ON "FindingEffectiveness"("findingType");

-- CreateIndex
CREATE UNIQUE INDEX "PromptPerformance_promptId_key" ON "PromptPerformance"("promptId");

-- CreateIndex
CREATE INDEX "FindingStatus_auditId_idx" ON "FindingStatus"("auditId");

-- CreateIndex
CREATE UNIQUE INDEX "FindingStatus_auditId_findingId_key" ON "FindingStatus"("auditId", "findingId");

-- CreateIndex
CREATE INDEX "ClientMessage_auditId_idx" ON "ClientMessage"("auditId");

-- CreateIndex
CREATE INDEX "ReviewSnapshot_auditId_idx" ON "ReviewSnapshot"("auditId");

-- CreateIndex
CREATE UNIQUE INDEX "FeatureFlag_key_key" ON "FeatureFlag"("key");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationState_proposalId_key" ON "ConversationState"("proposalId");

-- CreateIndex
CREATE INDEX "ConversationState_proposalId_idx" ON "ConversationState"("proposalId");

-- CreateIndex
CREATE INDEX "ConversationState_sessionId_idx" ON "ConversationState"("sessionId");

-- CreateIndex
CREATE INDEX "ObjectionLog_proposalId_idx" ON "ObjectionLog"("proposalId");

-- CreateIndex
CREATE INDEX "ObjectionLog_category_idx" ON "ObjectionLog"("category");

-- CreateIndex
CREATE UNIQUE INDEX "EmailSequence_proposalId_key" ON "EmailSequence"("proposalId");

-- CreateIndex
CREATE INDEX "EmailSequence_proposalId_idx" ON "EmailSequence"("proposalId");

-- CreateIndex
CREATE INDEX "GeneratedArtifact_tenantId_proposalId_idx" ON "GeneratedArtifact"("tenantId", "proposalId");

-- CreateIndex
CREATE INDEX "GeneratedArtifact_findingId_idx" ON "GeneratedArtifact"("findingId");

-- CreateIndex
CREATE INDEX "GeneratedArtifact_status_idx" ON "GeneratedArtifact"("status");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryBundle_proposalId_key" ON "DeliveryBundle"("proposalId");

-- CreateIndex
CREATE INDEX "DeliveryBundle_tenantId_idx" ON "DeliveryBundle"("tenantId");

-- CreateIndex
CREATE INDEX "DeliveryBundle_proposalId_idx" ON "DeliveryBundle"("proposalId");

-- CreateIndex
CREATE INDEX "AdversarialQARun_tenantId_auditId_idx" ON "AdversarialQARun"("tenantId", "auditId");

-- CreateIndex
CREATE INDEX "AdversarialQARun_proposalId_idx" ON "AdversarialQARun"("proposalId");

-- CreateIndex
CREATE INDEX "AdversarialQARun_createdAt_idx" ON "AdversarialQARun"("createdAt");

-- CreateIndex
CREATE INDEX "HallucinationLog_tenantId_weekStart_idx" ON "HallucinationLog"("tenantId", "weekStart");

-- CreateIndex
CREATE INDEX "HallucinationLog_auditId_idx" ON "HallucinationLog"("auditId");

-- CreateIndex
CREATE INDEX "HallucinationLog_category_idx" ON "HallucinationLog"("category");

-- CreateIndex
CREATE INDEX "HumanReviewFlag_tenantId_status_idx" ON "HumanReviewFlag"("tenantId", "status");

-- CreateIndex
CREATE INDEX "HumanReviewFlag_artifactId_idx" ON "HumanReviewFlag"("artifactId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_proposalId_key" ON "Project"("proposalId");

-- CreateIndex
CREATE INDEX "Project_tenantId_idx" ON "Project"("tenantId");

-- CreateIndex
CREATE INDEX "Project_status_idx" ON "Project"("status");

-- CreateIndex
CREATE INDEX "NPSSurvey_projectId_idx" ON "NPSSurvey"("projectId");

-- CreateIndex
CREATE INDEX "NPSSurvey_tenantId_idx" ON "NPSSurvey"("tenantId");

-- CreateIndex
CREATE INDEX "NPSSurvey_surveyDay_status_idx" ON "NPSSurvey"("surveyDay", "status");

-- CreateIndex
CREATE UNIQUE INDEX "QATelemetry_runId_key" ON "QATelemetry"("runId");

-- CreateIndex
CREATE INDEX "QATelemetry_graphName_createdAt_idx" ON "QATelemetry"("graphName", "createdAt");

-- CreateIndex

-- CreateIndex
CREATE INDEX "QATelemetry_qaScore_idx" ON "QATelemetry"("qaScore");

-- CreateIndex
CREATE INDEX "PromptPromotionLog_promptId_idx" ON "PromptPromotionLog"("promptId");

-- CreateIndex
CREATE INDEX "PromptPromotionLog_promotedAt_idx" ON "PromptPromotionLog"("promotedAt");

-- CreateIndex
CREATE INDEX "Metric_name_timestamp_idx" ON "Metric"("name", "timestamp");

-- CreateIndex
CREATE INDEX "Metric_name_idx" ON "Metric"("name");

-- CreateIndex
CREATE INDEX "MonitoringConfig_tenantId_idx" ON "MonitoringConfig"("tenantId");

-- CreateIndex
CREATE INDEX "LocationGroup_tenantId_idx" ON "LocationGroup"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Plugin_slug_key" ON "Plugin"("slug");

-- AddForeignKey
ALTER TABLE "Audit" ADD CONSTRAINT "Audit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "Audit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ProposalTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "Audit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalAcceptance" ADD CONSTRAINT "ProposalAcceptance_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalView" ADD CONSTRAINT "ProposalView_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactRequest" ADD CONSTRAINT "ContactRequest_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactRequest" ADD CONSTRAINT "ContactRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalFollowUp" ADD CONSTRAINT "ProposalFollowUp_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalFollowUp" ADD CONSTRAINT "ProposalFollowUp_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceSnapshot" ADD CONSTRAINT "EvidenceSnapshot_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "Audit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Playbook" ADD CONSTRAINT "Playbook_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditSchedule" ADD CONSTRAINT "AuditSchedule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProspectDiscoveryJob" ADD CONSTRAINT "ProspectDiscoveryJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProspectLead" ADD CONSTRAINT "ProspectLead_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProspectLead" ADD CONSTRAINT "ProspectLead_discoveryJobId_fkey" FOREIGN KEY ("discoveryJobId") REFERENCES "ProspectDiscoveryJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProspectEnrichmentRun" ADD CONSTRAINT "ProspectEnrichmentRun_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProspectEnrichmentRun" ADD CONSTRAINT "ProspectEnrichmentRun_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "ProspectLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachSendingDomain" ADD CONSTRAINT "OutreachSendingDomain_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachDomainDailyStat" ADD CONSTRAINT "OutreachDomainDailyStat_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachDomainDailyStat" ADD CONSTRAINT "OutreachDomainDailyStat_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "OutreachSendingDomain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachEmail" ADD CONSTRAINT "OutreachEmail_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachEmail" ADD CONSTRAINT "OutreachEmail_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "ProspectLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachEmail" ADD CONSTRAINT "OutreachEmail_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "OutreachSendingDomain"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachEmailEvent" ADD CONSTRAINT "OutreachEmailEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachEmailEvent" ADD CONSTRAINT "OutreachEmailEvent_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "ProspectLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachEmailEvent" ADD CONSTRAINT "OutreachEmailEvent_emailId_fkey" FOREIGN KEY ("emailId") REFERENCES "OutreachEmail"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantBranding" ADD CONSTRAINT "TenantBranding_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProspectStateTransition" ADD CONSTRAINT "ProspectStateTransition_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "ProspectLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineConfig" ADD CONSTRAINT "PipelineConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerDeliveredLead" ADD CONSTRAINT "PartnerDeliveredLead_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "ProspectLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerDeliveredLead" ADD CONSTRAINT "PartnerDeliveredLead_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "AgencyPartner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalOutreach" ADD CONSTRAINT "ProposalOutreach_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageRecord" ADD CONSTRAINT "UsageRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FindingStatus" ADD CONSTRAINT "FindingStatus_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "Audit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FindingStatus" ADD CONSTRAINT "FindingStatus_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "Finding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientMessage" ADD CONSTRAINT "ClientMessage_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "Audit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewSnapshot" ADD CONSTRAINT "ReviewSnapshot_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "Audit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationState" ADD CONSTRAINT "ConversationState_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObjectionLog" ADD CONSTRAINT "ObjectionLog_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailSequence" ADD CONSTRAINT "EmailSequence_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NPSSurvey" ADD CONSTRAINT "NPSSurvey_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringConfig" ADD CONSTRAINT "MonitoringConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationGroup" ADD CONSTRAINT "LocationGroup_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

