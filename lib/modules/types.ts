export interface AuditModuleResult {
    moduleId: string;
    status: 'success' | 'failed';
    data: any;
    error?: string;
    timestamp: string;
    costCents?: number; // Cost in cents (1/100 of a dollar)
}

export interface WebsiteModuleInput {
    url: string;
}

export interface GBPModuleInput {
    businessName: string;
    city: string;
}

export interface CompetitorModuleInput {
    keyword: string;
    location: string;
}
