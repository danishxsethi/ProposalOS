import { Finding, EvidenceSnapshot } from '@prisma/client';

// Define the shape of data available to plugins
export interface PluginInput {
    businessName: string;
    businessUrl?: string;
    city: string;
    industry: string;
    config: Record<string, any>; // User-defined settings

    // Tools provided to the plugin
    tools: {
        log: (msg: string) => void;
        fetch: (url: string, options?: any) => Promise<any>;
    };
}

export interface PluginOutput {
    findings: Partial<Finding>[];
    evidence: Partial<EvidenceSnapshot>[];
    metrics?: Record<string, number>;
}

export interface ProposalOSPlugin {
    id: string;
    version: string;

    // The main execution function
    run: (input: PluginInput) => Promise<PluginOutput>;
}
