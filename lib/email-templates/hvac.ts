import type { EmailTemplate } from './types';

export const hvacEmailTemplates: EmailTemplate[] = [
    {
        id: 'hvac-cold-1',
        vertical: 'hvac',
        stage: 'cold',
        subjectTemplate: '{{businessName}} — furnace emergency visibility',
        bodyTemplate: `Hi {{businessName}},

When someone's furnace breaks at 10pm in -40°C, they're on their phone. I checked Saskatoon HVAC sites and many hide their emergency number below the fold — or don't load fast enough on mobile.

Your audit shows {{finding}}. We help Saskatchewan HVAC companies get more emergency calls with fast mobile sites and visible 24/7 numbers. Interested in the full report?

{{proposalUrl}}

Best,
[Your name]`,
    },
    {
        id: 'hvac-followup-1',
        vertical: 'hvac',
        stage: 'followup',
        subjectTemplate: '{{competitorName}} is winning emergency calls',
        bodyTemplate: `Hi {{businessName}},

Following up — I compared your site to {{competitorName}}. They have their emergency number in a sticky header, service area pages for Saskatoon neighbourhoods, and seasonal content (furnace tune-up, AC prep). They're capturing "HVAC Saskatoon" searches you're missing.

Your audit: {{finding}}. We've helped 40+ Saskatchewan HVAC companies. Full report:

{{proposalUrl}}

[Your name]`,
    },
    {
        id: 'hvac-breakup-1',
        vertical: 'hvac',
        stage: 'breakup',
        subjectTemplate: '{{competitorName}} just improved their emergency visibility',
        bodyTemplate: `Hi {{businessName}},

{{competitorName}} recently added a sticky emergency number and Saskatoon neighbourhood pages. They're likely capturing more furnace emergency calls as a result.

Your audit is here if you'd like to revisit: {{proposalUrl}}

[Your name]`,
    },
];
