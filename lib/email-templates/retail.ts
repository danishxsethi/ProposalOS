import type { EmailTemplate } from './types';

export const retailEmailTemplates: EmailTemplate[] = [
    {
        id: 'retail-cold-1',
        vertical: 'retail',
        stage: 'cold',
        subjectTemplate: '{{businessName}} — mobile checkout and product SEO',
        bodyTemplate: `Hi {{businessName}},

Saskatoon shoppers compare local retailers to Amazon. Your advantage is local trust — but only if your site converts. I checked retail sites and many have slow product pages, complex checkout, or duplicate manufacturer copy that hurts SEO.

Your audit shows {{finding}}. We help Saskatchewan retailers with mobile checkout, unique product descriptions, and payment options (e-transfer, Apple Pay). Interested in the full report?

{{proposalUrl}}

Best,
[Your name]`,
    },
    {
        id: 'retail-followup-1',
        vertical: 'retail',
        stage: 'followup',
        subjectTemplate: 'How {{competitorName}} is capturing mobile shoppers',
        bodyTemplate: `Hi {{businessName}},

Following up — I compared your site to {{competitorName}}. They have fast mobile checkout, unique product descriptions, multiple payment options (e-transfer, Apple Pay), and store hours/location clearly displayed. They're capturing "store Saskatoon" searches you're missing.

Your audit: {{finding}}. We've helped 45+ Saskatchewan retailers. Full report:

{{proposalUrl}}

[Your name]`,
    },
    {
        id: 'retail-breakup-1',
        vertical: 'retail',
        stage: 'breakup',
        subjectTemplate: '{{competitorName}} just improved their checkout',
        bodyTemplate: `Hi {{businessName}},

{{competitorName}} recently streamlined their mobile checkout and added Apple Pay. They're likely capturing more mobile shoppers as a result.

Your audit is here if you'd like to revisit: {{proposalUrl}}

[Your name]`,
    },
];
