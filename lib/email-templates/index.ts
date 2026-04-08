/**
 * Vertical-specific email templates for Saskatoon businesses.
 * Cold opener, follow-up with competitor hook, breakup with urgency.
 */
import { contractorEmailTemplates } from './contractor';
import { dentistEmailTemplates } from './dentist';
import { gymEmailTemplates } from './gym';
import { hvacEmailTemplates } from './hvac';
import { lawFirmEmailTemplates } from './law-firm';
import { realEstateEmailTemplates } from './real-estate';
import { restaurantEmailTemplates } from './restaurant';
import { retailEmailTemplates } from './retail';
import { salonEmailTemplates } from './salon';
import { veterinaryEmailTemplates } from './veterinary';

import type { EmailTemplate } from './types';

const ALL_TEMPLATES: EmailTemplate[] = [
  ...dentistEmailTemplates,
  ...lawFirmEmailTemplates,
  ...hvacEmailTemplates,
  ...restaurantEmailTemplates,
  ...realEstateEmailTemplates,
  ...gymEmailTemplates,
  ...veterinaryEmailTemplates,
  ...salonEmailTemplates,
  ...contractorEmailTemplates,
  ...retailEmailTemplates,
];

export function getEmailTemplatesForVertical(vertical: string): EmailTemplate[] {
  return ALL_TEMPLATES.filter((t) => t.vertical === vertical);
}

export function getEmailTemplate(
  vertical: string,
  stage: 'cold' | 'followup' | 'breakup'
): EmailTemplate | undefined {
  return ALL_TEMPLATES.find((t) => t.vertical === vertical && t.stage === stage);
}

export function fillEmailTemplate(
  template: EmailTemplate,
  vars: {
    businessName?: string;
    finding?: string;
    competitorName?: string;
    metric?: string;
    proposalUrl?: string;
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
