import type { EmailTemplate } from './types';

export const dentistEmailTemplates: EmailTemplate[] = [
    {
        id: 'dentist-cold-1',
        vertical: 'dentist',
        stage: 'cold',
        subjectTemplate: '{{businessName}} — quick note on your online booking',
        bodyTemplate: `Hi {{businessName}},

I ran a quick audit of dental practices in Saskatoon and noticed your site doesn't have online appointment booking yet. With 47+ dentists in the city, patients expect to book 24/7 — and many choose practices that let them schedule without calling.

We help Saskatchewan dental clinics add online booking, improve their Google presence, and fill more chairs. Would you be open to a 15-minute call to see if we could help?

{{proposalUrl}}

Best,
[Your name]`,
    },
    {
        id: 'dentist-followup-1',
        vertical: 'dentist',
        stage: 'followup',
        subjectTemplate: 'How {{competitorName}} is capturing your patients',
        bodyTemplate: `Hi {{businessName}},

Following up — I compared your online presence to a few other Saskatoon dental practices. {{competitorName}} has online booking, 10+ Google photos, and responds to every review. They're capturing patients who search at night or on weekends when your office is closed.

Your audit shows {{finding}}. We've helped 50+ Saskatchewan dental practices fix this. Happy to walk you through the full report:

{{proposalUrl}}

[Your name]`,
    },
    {
        id: 'dentist-breakup-1',
        vertical: 'dentist',
        stage: 'breakup',
        subjectTemplate: '{{competitorName}} just improved their site',
        bodyTemplate: `Hi {{businessName}},

I noticed {{competitorName}} recently added online booking and updated their Google Business photos. They're likely capturing more "dentist Saskatoon" searches as a result.

If you'd like to revisit your audit and see where you stand, the report is here: {{proposalUrl}}

No pressure — just wanted you to have it if the timing changes.

[Your name]`,
    },
];
