import { OutreachEmailType } from '@prisma/client';
import { composeSniperEmail, ComposeSniperEmailInput, ComposedSniperEmail } from './emailComposer';
import { checkSniperEmailQuality, SniperEmailQualityResult } from './emailQualityGate';

export interface SequenceEmailInfo {
    sequencePosition: number;
    scheduledHoursOffset: number;
    type: OutreachEmailType;
    composed: ComposedSniperEmail;
    quality: SniperEmailQualityResult;
}

export interface ComposeSequenceInput extends Omit<ComposeSniperEmailInput, 'type' | 'attempt'> {
    leadId: string;
    tenantId: string;
}

export function generateEmailSequence(input: ComposeSequenceInput): SequenceEmailInfo[] {
    const sequence: SequenceEmailInfo[] = [];

    const touchpoints = [
        { position: 1, type: OutreachEmailType.INITIAL, offsetHours: 0 },
        { position: 2, type: OutreachEmailType.FOLLOWUP_COMPETITOR, offsetHours: 24 * 3 }, // Day 3
        { position: 3, type: OutreachEmailType.FOLLOWUP_GBP, offsetHours: 24 * 7 }, // Day 7 
        { position: 4, type: OutreachEmailType.FOLLOWUP_RETRY, offsetHours: 24 * 14 }, // Day 14
        { position: 5, type: OutreachEmailType.FOLLOWUP_PROPOSAL, offsetHours: 24 * 21 }, // Day 21
    ];

    for (const touch of touchpoints) {
        let composed = composeSniperEmail({
            ...input,
            type: touch.type,
            attempt: 1,
        });

        let quality = checkSniperEmailQuality({
            subject: composed.subject,
            body: composed.body,
            requiredFindingSnippets: composed.requiredFindingSnippets,
        });

        // Retry logic for quality gate
        for (let attempt = 2; attempt <= 3 && !quality.pass; attempt += 1) {
            composed = composeSniperEmail({
                ...input,
                type: touch.type,
                attempt,
            });
            quality = checkSniperEmailQuality({
                subject: composed.subject,
                body: composed.body,
                requiredFindingSnippets: composed.requiredFindingSnippets,
            });
        }

        sequence.push({
            sequencePosition: touch.position,
            scheduledHoursOffset: touch.offsetHours,
            type: touch.type,
            composed,
            quality,
        });
    }

    return sequence;
}
