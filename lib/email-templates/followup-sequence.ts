/**
 * Follow-up email sequence — 3 emails triggered after an in-person meeting.
 * CAN-SPAM compliant: physical address, unsubscribe mechanism.
 * Variables: {{businessName}}, {{proposalUrl}}, {{finding}}, {{metric}}, {{competitorName}}, {{recipientName}}
 */

export interface FollowUpEmailTemplate {
    step: 1 | 2 | 3;
    name: string;
    subjectTemplate: string;
    bodyTemplate: string;
}

export const FOLLOWUP_SEQUENCE: FollowUpEmailTemplate[] = [
    {
        step: 1,
        name: 'The Recap',
        subjectTemplate: 'Your {{businessName}} website audit — as promised',
        bodyTemplate: `Hi {{recipientName}},

Great meeting you today. As promised, here's your website audit for {{businessName}}.

I've put together a detailed proposal with our findings and recommendations. The #1 issue we found: {{finding}}

You can review everything here: {{proposalUrl}}

If you have any questions, just reply to this email. I'm happy to walk you through it or schedule a quick call.

Best,
[Your name]
[Your contact info]

---
{{physicalAddress}}
Unsubscribe: {{unsubscribeUrl}}`,
    },
    {
        step: 2,
        name: 'The Nudge',
        subjectTemplate: "Quick question about {{businessName}}'s website",
        bodyTemplate: `Hi {{recipientName}},

Just checking in — have you had a chance to review the audit I sent?

One thing that stood out: {{finding}} — {{metric}}

This is likely costing you visitors and leads. I'd be happy to show you how we've helped similar businesses fix this.

Here's the proposal again: {{proposalUrl}}

Let me know if you have any questions.

Best,
[Your name]

---
{{physicalAddress}}
Unsubscribe: {{unsubscribeUrl}}`,
    },
    {
        step: 3,
        name: 'The Competitor Hook',
        subjectTemplate: '{{competitorName}} just improved their website',
        bodyTemplate: `Hi {{recipientName}},

I noticed {{competitorName}} recently updated their website — they've improved their {{metric}} and are likely capturing more local searches as a result.

If you'd like to stay ahead, we can help. Your audit is ready: {{proposalUrl}}

We're offering [limited-time offer, e.g. "a 15% discount on our Growth package"] for the next 7 days if you'd like to move forward.

No pressure — the audit is yours to keep either way. But if you want to discuss next steps, I'm here.

Best,
[Your name]

---
{{physicalAddress}}
Unsubscribe: {{unsubscribeUrl}}`,
    },
];

export function getFollowUpTemplate(step: 1 | 2 | 3): FollowUpEmailTemplate | undefined {
    return FOLLOWUP_SEQUENCE.find((t) => t.step === step);
}

export function fillFollowUpTemplate(
    template: FollowUpEmailTemplate,
    vars: {
        businessName?: string;
        proposalUrl?: string;
        finding?: string;
        metric?: string;
        competitorName?: string;
        recipientName?: string;
        physicalAddress?: string;
        unsubscribeUrl?: string;
    }
): { subject: string; body: string } {
    let subject = template.subjectTemplate;
    let body = template.bodyTemplate;
    for (const [key, value] of Object.entries(vars)) {
        const placeholder = `{{${key}}}`;
        const replacement = value ?? '';
        subject = subject.split(placeholder).join(replacement);
        body = body.split(placeholder).join(replacement);
    }
    return { subject, body };
}
