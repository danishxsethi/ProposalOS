import type { EmailTemplate } from './types';

export const contractorEmailTemplates: EmailTemplate[] = [
    {
        id: 'contractor-cold-1',
        vertical: 'contractor',
        stage: 'cold',
        subjectTemplate: '{{businessName}} — portfolio and quote form',
        bodyTemplate: `Hi {{businessName}},

Homeowners check 3-5 contractors online before calling. No portfolio = no call. I analysed Saskatoon contractor sites and many lack before/after photos, clear licensing/insurance, or a simple quote form.

Your audit shows {{finding}}. We help Saskatchewan contractors with portfolios, trust signals, and service area pages (Saskatoon + Martensville, Warman, etc.). Interested in the full report?

{{proposalUrl}}

Best,
[Your name]`,
    },
    {
        id: 'contractor-followup-1',
        vertical: 'contractor',
        stage: 'followup',
        subjectTemplate: 'How {{competitorName}} is winning Saskatoon jobs',
        bodyTemplate: `Hi {{businessName}},

Following up — I compared your site to {{competitorName}}. They have a project portfolio, licensing/insurance badges, a service area map, and a simple quote form. They're ranking for "plumber Saskatoon" and similar searches you're missing.

Your audit: {{finding}}. We've helped 60+ Saskatchewan contractors. Full report:

{{proposalUrl}}

[Your name]`,
    },
    {
        id: 'contractor-breakup-1',
        vertical: 'contractor',
        stage: 'breakup',
        subjectTemplate: '{{competitorName}} just added their portfolio',
        bodyTemplate: `Hi {{businessName}},

{{competitorName}} recently added a project portfolio with before/after photos and a service area page for Saskatoon. They're likely winning more jobs as a result.

Your audit is here if you'd like to revisit: {{proposalUrl}}

[Your name]`,
    },
];
