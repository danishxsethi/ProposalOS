/**
 * Email generation types — shared across generator, qualityCheck, followUp.
 */

export interface AuditForEmail {
  id: string;
  businessName: string;
  businessCity: string | null;
  businessUrl: string | null;
  businessIndustry: string | null;
  verticalPlaybookId: string | null;
  overallScore: number | null;
  findings: FindingForEmail[];
}

export interface FindingForEmail {
  id: string;
  module: string;
  category: string;
  type: 'PAINKILLER' | 'VITAMIN';
  title: string;
  description: string | null;
  metrics: Record<string, unknown>;
  impactScore: number;
}

export interface ProposalForEmail {
  id: string;
  executiveSummary: string | null;
  webLinkToken: string;
  pricing: { starter?: number; growth?: number; premium?: number; essentials?: number } | null;
  comparisonReport: ComparisonReportForEmail | null;
}

export interface ComparisonReportForEmail {
  prospectRank: number;
  summaryStatement: string;
  positiveStatement: string;
  urgencyStatement: string;
  winningCategories: string[];
  losingCategories: string[];
  competitors?: Array<{ name?: string; performanceScore?: number; rating?: number; reviewCount?: number }>;
  biggestGap?: {
    category: string;
    competitorName: string;
    prospectScore: number;
    bestCompetitorScore: number;
  } | null;
}

export interface PlaybookForEmail {
  id: string;
  name: string;
  proposalLanguage?: {
    painPoints?: string[];
    valueProps?: string[];
    urgencyHook?: string;
  };
}

export interface EmailSequence {
  emails: {
    dayOffset: number;
    subject: string;
    body: string;
    previewText: string;
    personalizationScore: number;
  }[];
  metadata: {
    businessName: string;
    vertical: string;
    topFinding: string;
    generatedAt: string;
  };
}

export interface FollowUpSequence {
  emails: {
    dayOffset: number;
    subject: string;
    body: string;
    previewText: string;
  }[];
  metadata: {
    businessName: string;
    meetingContext?: string;
    generatedAt: string;
  };
}
