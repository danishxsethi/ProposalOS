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
    deliveryTime: string; // e.g., "1-2 weeks"
    price?: number; // Will be set by pricing logic
}

export interface ProposalPricing {
    essentials: number;
    growth: number;
    premium: number;
    currency: string;
}

export interface ProposalResult {
    executiveSummary: string;
    painClusters: PainCluster[];
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
