/**
 * Follow-up email sequence — 3 emails triggered after an in-person meeting.
 * CAN-SPAM compliant: physical address, unsubscribe mechanism.
 * Variables: {{businessName}}, {{proposalUrl}}, {{finding}}, {{metric}}, {{recipientName}}
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

One documented observation was: {{finding}} {{metric}}

The proposal explains the supporting observation and the recommended next steps.

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
    name: 'The Final Check-In',
    subjectTemplate: "Final check-in on {{businessName}}'s website audit",
    bodyTemplate: `Hi {{recipientName}},

I wanted to make one final check-in about the audit for {{businessName}}.

The report documents: {{finding}} {{metric}}

You can review the proposal here: {{proposalUrl}}

If you would like to discuss the documented findings or next steps, reply to this email and a
team member can help.

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
