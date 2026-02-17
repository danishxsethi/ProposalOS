import type { EmailTemplate } from './types';

export const veterinaryEmailTemplates: EmailTemplate[] = [
    {
        id: 'veterinary-cold-1',
        vertical: 'veterinary',
        stage: 'cold',
        subjectTemplate: '{{businessName}} — emergency info and online booking',
        bodyTemplate: `Hi {{businessName}},

Pet owners in distress need to find emergency info immediately. I checked Saskatoon vet sites and many hide after-hours info or don't offer online booking — meaning lost appointments when the office is closed.

Your audit shows {{finding}}. We help Saskatchewan vet clinics with emergency visibility, online scheduling, and service pages. Interested in the full report?

{{proposalUrl}}

Best,
[Your name]`,
    },
    {
        id: 'veterinary-followup-1',
        vertical: 'veterinary',
        stage: 'followup',
        subjectTemplate: 'How {{competitorName}} is capturing pet owners',
        bodyTemplate: `Hi {{businessName}},

Following up — I compared your site to {{competitorName}}. They have emergency info above the fold, online booking, a complete services page, and vet bios with credentials. They're capturing "vet Saskatoon" searches you're missing.

Your audit: {{finding}}. We've helped 35+ Saskatchewan vet clinics. Full report:

{{proposalUrl}}

[Your name]`,
    },
    {
        id: 'veterinary-breakup-1',
        vertical: 'veterinary',
        stage: 'breakup',
        subjectTemplate: '{{competitorName}} just added online booking',
        bodyTemplate: `Hi {{businessName}},

{{competitorName}} recently added online appointment booking and moved their emergency info above the fold. They're likely capturing more pet owners as a result.

Your audit is here if you'd like to revisit: {{proposalUrl}}

[Your name]`,
    },
];
