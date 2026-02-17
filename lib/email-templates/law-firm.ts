import type { EmailTemplate } from './types';

export const lawFirmEmailTemplates: EmailTemplate[] = [
    {
        id: 'law-firm-cold-1',
        vertical: 'law-firm',
        stage: 'cold',
        subjectTemplate: '{{businessName}} — practice area pages and local SEO',
        bodyTemplate: `Hi {{businessName}},

I analysed law firm websites in Saskatoon and noticed many lack dedicated practice area pages. Clients searching "family lawyer Saskatoon" or "personal injury attorney Saskatoon" often land on firms with one generic page — and bounce.

Your site could capture more of these searches with practice-area-specific pages. Would you be open to a quick call to see your full audit?

{{proposalUrl}}

Best,
[Your name]`,
    },
    {
        id: 'law-firm-followup-1',
        vertical: 'law-firm',
        stage: 'followup',
        subjectTemplate: 'How {{competitorName}} ranks for "lawyer Saskatoon"',
        bodyTemplate: `Hi {{businessName}},

Following up — I compared your site to {{competitorName}}. They have dedicated pages for each practice area, attorney bios with Saskatchewan Law Society credentials, and a prominent free consultation CTA. They're ranking for "lawyer Saskatoon" searches you're missing.

Your audit shows {{finding}}. We've helped 30+ Saskatchewan law firms improve their online presence. Full report:

{{proposalUrl}}

[Your name]`,
    },
    {
        id: 'law-firm-breakup-1',
        vertical: 'law-firm',
        stage: 'breakup',
        subjectTemplate: '{{competitorName}} just updated their site',
        bodyTemplate: `Hi {{businessName}},

{{competitorName}} recently added new practice area pages and improved their attorney bios. They're likely capturing more "lawyer Saskatoon" traffic as a result.

Your audit is here if you'd like to revisit: {{proposalUrl}}

No pressure — just wanted you to have it.

[Your name]`,
    },
];
