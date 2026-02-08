
import { prisma } from '@/lib/prisma';
import { unstable_cache } from 'next/cache';

export interface PlaybookConfig {
    name: string;
    industry: string;
    moduleConfig: any;
    pricingConfig: any;
    promptOverrides: any;
    customFindings: any[];
    proposalLanguage: any;
}

const GENERIC_PLAYBOOK: PlaybookConfig = {
    name: 'Generic Business',
    industry: 'generic',
    moduleConfig: {},
    pricingConfig: {
        starter: 499,
        growth: 999,
        premium: 2499,
        currency: 'USD'
    },
    promptOverrides: {},
    customFindings: [],
    proposalLanguage: {
        valueProp: 'Improve your digital presence and attract more customers.',
        painPoints: ['Low visibility', 'Poor conversion', 'Tech debt'],
    }
};

export const getPlaybook = unstable_cache(
    async (industry: string | null, tenantId?: string | null): Promise<PlaybookConfig> => {
        if (!industry) return GENERIC_PLAYBOOK;
        const normalizedIndustry = industry.toLowerCase().trim();

        try {
            // 1. Check for Tenant-Specific Playbook
            if (tenantId) {
                const tenantPlaybook = await prisma.playbook.findFirst({
                    where: { tenantId, industry: normalizedIndustry }
                });
                if (tenantPlaybook) return {
                    ...GENERIC_PLAYBOOK,
                    ...tenantPlaybook,
                    moduleConfig: tenantPlaybook.moduleConfig as any,
                    pricingConfig: tenantPlaybook.pricingConfig as any,
                    promptOverrides: tenantPlaybook.promptOverrides as any,
                    customFindings: tenantPlaybook.customFindings as any,
                    proposalLanguage: tenantPlaybook.proposalLanguage as any,
                };
            }

            // 2. Check for System Default Playbook
            const systemPlaybook = await prisma.playbook.findFirst({
                where: { tenantId: null, industry: normalizedIndustry } // isDefault check redundant if tenantId is null implicitly
            });

            if (systemPlaybook) return {
                ...GENERIC_PLAYBOOK,
                ...systemPlaybook,
                moduleConfig: systemPlaybook.moduleConfig as any,
                pricingConfig: systemPlaybook.pricingConfig as any,
                promptOverrides: systemPlaybook.promptOverrides as any,
                customFindings: systemPlaybook.customFindings as any,
                proposalLanguage: systemPlaybook.proposalLanguage as any,
            };

            // 3. Fallback to Generic
            return GENERIC_PLAYBOOK;

        } catch (error) {
            console.error('Failed to fetch playbook:', error);
            return GENERIC_PLAYBOOK;
        }
    },
    ['playbook_config'],
    { revalidate: 300, tags: ['playbook'] }
);
