import type { EmailTemplate } from './types';

export const gymEmailTemplates: EmailTemplate[] = [
    {
        id: 'gym-cold-1',
        vertical: 'gym',
        stage: 'cold',
        subjectTemplate: '{{businessName}} — class schedule and free trial CTA',
        bodyTemplate: `Hi {{businessName}},

73% of gym members research online before signing up. I checked Saskatoon fitness sites and many hide their class schedule, have no free trial CTA, or make mobile booking difficult.

Your audit shows {{finding}}. We help Saskatchewan gyms with class schedule UX, transparent pricing, and mobile-optimised signup. Interested in the full report?

{{proposalUrl}}

Best,
[Your name]`,
    },
    {
        id: 'gym-followup-1',
        vertical: 'gym',
        stage: 'followup',
        subjectTemplate: 'How {{competitorName}} is filling memberships',
        bodyTemplate: `Hi {{businessName}},

Following up — I compared your site to {{competitorName}}. They have a visible class schedule, free trial CTA above the fold, transformation stories, and 15+ Google photos. They're capturing "gym Saskatoon" searches you're missing.

Your audit: {{finding}}. We've helped 40+ Saskatchewan gyms. Full report:

{{proposalUrl}}

[Your name]`,
    },
    {
        id: 'gym-breakup-1',
        vertical: 'gym',
        stage: 'breakup',
        subjectTemplate: '{{competitorName}} just improved their signup flow',
        bodyTemplate: `Hi {{businessName}},

{{competitorName}} recently added online membership signup and a prominent free trial CTA. They're likely capturing more "gym Saskatoon" traffic.

Your audit is here if you'd like to revisit: {{proposalUrl}}

[Your name]`,
    },
];
