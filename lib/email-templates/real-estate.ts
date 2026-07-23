import type { EmailTemplate } from './types';

export const realEstateEmailTemplates: EmailTemplate[] = [
    {
        id: 'real-estate-cold-1',
        vertical: 'real-estate',
        stage: 'cold',
        subjectTemplate: '{{businessName}} — listing speed and neighbourhood pages',
        bodyTemplate: `Hi {{businessName}},

Saskatoon buyers spend 3+ hours online before contacting an agent. I analysed real estate sites and noticed many have slow listing pages (image-heavy, not optimised) and no neighbourhood content for "homes in Nutana" or "Stonebridge real estate."

Your audit shows {{finding}}. We help Saskatchewan agents with fast listings, neighbourhood pages, and lead capture. Interested in the full report?

{{proposalUrl}}

Best,
[Your name]`,
    },
    {
        id: 'real-estate-followup-1',
        vertical: 'real-estate',
        stage: 'followup',
        subjectTemplate: 'How {{competitorName}} is capturing Saskatoon buyers',
        bodyTemplate: `Hi {{businessName}},

Following up — I compared your site to {{competitorName}}. They have neighbourhood pages for Saskatoon areas, fast-loading listings, and lead capture on every property. They're ranking for "homes in Stonebridge" and similar searches you're missing.

Your audit: {{finding}}. We've helped 25+ Saskatchewan agents. Full report:

{{proposalUrl}}

[Your name]`,
    },
    {
        id: 'real-estate-breakup-1',
        vertical: 'real-estate',
        stage: 'breakup',
        subjectTemplate: '{{competitorName}} just added neighbourhood pages',
        bodyTemplate: `Hi {{businessName}},

{{competitorName}} recently added neighbourhood pages for Saskatoon areas and optimised their listing images. They're likely capturing more "homes in [area]" searches.

Your audit is here if you'd like to revisit: {{proposalUrl}}

[Your name]`,
    },
];
