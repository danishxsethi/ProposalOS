import type { EmailTemplate } from './types';

export const salonEmailTemplates: EmailTemplate[] = [
    {
        id: 'salon-cold-1',
        vertical: 'salon',
        stage: 'cold',
        subjectTemplate: '{{businessName}} — booking widget and portfolio',
        bodyTemplate: `Hi {{businessName}},

80% of salon clients book after seeing your work online. I checked Saskatoon salons and many have slow or broken booking widgets, no portfolio, or hidden pricing — which sends clients to competitors.

Your audit shows {{finding}}. We help Saskatchewan salons with fast booking (Vagaro, Booksy), portfolio galleries, and clear pricing. Interested in the full report?

{{proposalUrl}}

Best,
[Your name]`,
    },
    {
        id: 'salon-followup-1',
        vertical: 'salon',
        stage: 'followup',
        subjectTemplate: 'How {{competitorName}} is filling their books',
        bodyTemplate: `Hi {{businessName}},

Following up — I compared your site to {{competitorName}}. They have a fast booking widget, a strong portfolio, stylist pages, gift cards online, and 15+ Google photos. They're capturing "salon Saskatoon" searches you're missing.

Your audit: {{finding}}. We've helped 55+ Saskatchewan salons. Full report:

{{proposalUrl}}

[Your name]`,
    },
    {
        id: 'salon-breakup-1',
        vertical: 'salon',
        stage: 'breakup',
        subjectTemplate: '{{competitorName}} just improved their booking',
        bodyTemplate: `Hi {{businessName}},

{{competitorName}} recently upgraded their booking widget and added more portfolio photos. They're likely capturing more clients as a result.

Your audit is here if you'd like to revisit: {{proposalUrl}}

[Your name]`,
    },
];
