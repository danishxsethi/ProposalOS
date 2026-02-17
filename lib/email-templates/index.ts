/**
 * Vertical-specific email templates for Saskatoon businesses.
 * Cold opener, follow-up with competitor hook, breakup with urgency.
 */
import type { EmailTemplate } from './types';
import { dentistEmailTemplates } from './dentist';
import { lawFirmEmailTemplates } from './law-firm';
import { hvacEmailTemplates } from './hvac';
import { restaurantEmailTemplates } from './restaurant';
import { realEstateEmailTemplates } from './real-estate';
import { gymEmailTemplates } from './gym';
import { veterinaryEmailTemplates } from './veterinary';
import { salonEmailTemplates } from './salon';
import { contractorEmailTemplates } from './contractor';
import { retailEmailTemplates } from './retail';

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

export function getEmailTemplate(vertical: string, stage: 'cold' | 'followup' | 'breakup'): EmailTemplate | undefined {
    return ALL_TEMPLATES.find((t) => t.vertical === vertical && t.stage === stage);
}

export function fillEmailTemplate(
    template: EmailTemplate,
    vars: { businessName?: string; finding?: string; competitorName?: string; metric?: string; proposalUrl?: string }
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
