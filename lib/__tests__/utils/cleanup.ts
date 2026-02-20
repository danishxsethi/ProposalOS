import { PrismaClient } from '@prisma/client';

export async function cleanupDb(prisma: PrismaClient) {
    // Enforce explicit reverse dependency depth order for Prisma to avoid P2003 Foreign Key Constraint violations during vitest resets

    const models = [
        // Group 1: Deepest child nodes (Events, Statuses, Metrics based on leads/emails/proposals)
        'outreachEmailEvent', 'proposalOutreach', 'followUpEmailSend', 'proposalAcceptance', 'proposalView',
        'contactRequest', 'partnerDeliveredLead', 'chatConversation', 'winLossRecord', 'detectedSignal',
        'preWarmingAction', 'prospectStateTransition', 'prospectEnrichmentRun', 'findingStatus', 'deliveryTask',
        'clientMessage', 'reviewSnapshot', 'evidenceSnapshot',

        // Group 2: Mid-level children dependent on Audits and Tenants
        'outreachEmail', 'proposalFollowUp', 'proposal', 'finding', 'audit', 'prospectLead',
        'prospectDiscoveryJob', 'outreachDomainDailyStat', 'outreachSendingDomain',

        // Group 3: Direct Tenant configs and relationships
        'tenantBranding', 'apiKey', 'playbook', 'auditSchedule', 'usageRecord', 'invitation',
        'pipelineConfig', 'pipelineErrorLog', 'proposalTemplate',

        // Group 4: Auth & Access
        'account', 'session', 'verificationToken', 'user',

        // Group 5: Core Entity Roots
        'tenant', 'agencyPartner',

        // Group 6: Independent Global Logs/Flags/Models
        'featureFlag', 'outreachTemplatePerformance', 'findingEffectiveness', 'benchmarkStats',
        'promptPerformance', 'emailBlocklist', 'auditTarget', 'sharedIntelligenceModel'
    ];

    for (const model of models) {
        try {
            await (prisma as any)[model].deleteMany();
        } catch (e: any) {
            if (e.code === 'P2003' || e.code === '40P01') {
                // Ignore deadlocks and foreign key issues on cleanup, we'll try again if needed next test
            } else {
                throw e;
            }
        }
    }
}
