import type { EmailTemplate } from './types';

export const restaurantEmailTemplates: EmailTemplate[] = [
    {
        id: 'restaurant-cold-1',
        vertical: 'restaurant',
        stage: 'cold',
        subjectTemplate: '{{businessName}} — menu and Google hours',
        bodyTemplate: `Hi {{businessName}},

I checked Saskatoon restaurant sites and noticed many use PDF menus — Google can't index them, and hungry customers on mobile can't read them easily. Stale Google Business hours also cost you customers who show up when you're closed.

Your audit shows {{finding}}. We help Saskatchewan restaurants with HTML menus, accurate hours, and online ordering. Interested in the full report?

{{proposalUrl}}

Best,
[Your name]`,
    },
    {
        id: 'restaurant-followup-1',
        vertical: 'restaurant',
        stage: 'followup',
        subjectTemplate: 'How {{competitorName}} is capturing hungry diners',
        bodyTemplate: `Hi {{businessName}},

Following up — I compared your site to {{competitorName}}. They have an HTML menu, accurate Google hours, 15+ photos, and online ordering. When someone searches "restaurant Broadway Saskatoon," they're getting the click.

Your audit: {{finding}}. We've helped 60+ Saskatchewan restaurants. Full report:

{{proposalUrl}}

[Your name]`,
    },
    {
        id: 'restaurant-breakup-1',
        vertical: 'restaurant',
        stage: 'breakup',
        subjectTemplate: '{{competitorName}} just added online ordering',
        bodyTemplate: `Hi {{businessName}},

{{competitorName}} recently added online ordering and updated their Google photos. They're likely capturing more hungry diners as a result.

Your audit is here if you'd like to revisit: {{proposalUrl}}

[Your name]`,
    },
];
