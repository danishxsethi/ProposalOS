import { PainCluster } from '../diagnosis/types';

export interface TierMapping {
    essentials: string[]; // Finding IDs
    growth: string[]; // Finding IDs
    premium: string[]; // Finding IDs
}

export interface TierConfig {
    name: string;
    description: string;
    findingIds: string[];
    deliveryTime: string; // e.g., "5 business days"
    price?: number;
    recommended?: boolean;
    features?: string[];
    /** Visual badge for display (e.g., "BEST VALUE", "MOST POPULAR") */
    badge?: string;
    roi?: {
        monthlyValue: number;
        ratio: number;
        scenarios?: {
            best: number;
            base: number;
            worst: number;
            assumptions: string[];
        };
    };
}

export interface ProposalPricing {
    essentials: number;
    growth: number;
    premium: number;
    currency: string;
}

export interface ComparisonTableRow {
    metric: string;
    prospectValue: string | number;
    prospectStatus: 'win' | 'lose' | 'tie';
    competitorValues: Array<{ name: string; value: string | number; status: 'win' | 'lose' | 'tie' }>;
}

export interface ComparisonReport {
    prospect: { name: string; performanceScore?: number; seoScore?: number; accessibilityScore?: number; mobileScore?: number; loadTimeSeconds?: number; rating?: number; reviewCount?: number };
    competitors: Array<{ name: string; performanceScore?: number; seoScore?: number; accessibilityScore?: number; mobileScore?: number; loadTimeSeconds?: number; rating?: number; reviewCount?: number }>;
    prospectRank: number;
    winningCategories: string[];
    losingCategories: string[];
    biggestGap: { category: string; prospectScore: number; bestCompetitorScore: number; competitorName: string; gap: number } | null;
    summaryStatement: string;
    positiveStatement: string;
    urgencyStatement: string;
    quickWins: Array<{ action: string; effortEstimate: string; expectedImpact: string }>;
    comparisonTableRows?: ComparisonTableRow[];
    summaryRow?: string;
    whereAhead?: string[];
    whereBehind?: string[];
}

export interface ProposalResult {
    executiveSummary: string;
    painClusters: PainCluster[];
    comparisonReport?: ComparisonReport | null;
    topActions?: Array<{
        findingId: string;
        title: string;
        impact: number;
        effort: string;
        timeline: string;
    }>;
    tiers: {
        essentials: TierConfig;
        growth: TierConfig;
        premium: TierConfig;
    };
    pricing: ProposalPricing;
    assumptions: string[];
    disclaimers: string[];
    nextSteps: string[];
}
