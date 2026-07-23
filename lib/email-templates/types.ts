/**
 * Email template types for vertical-specific outreach.
 * Used for cold email, follow-up, and breakup sequences.
 */

export interface EmailTemplate {
    id: string;
    vertical: string;
    stage: 'cold' | 'followup' | 'breakup';
    subjectTemplate: string;
    bodyTemplate: string;
    /** Placeholders: {{businessName}}, {{finding}}, {{competitorName}}, {{metric}}, {{proposalUrl}} */
}
