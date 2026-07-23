export type ObjectionCategory = 'price' | 'timing' | 'trust' | 'scope' | 'competition' | 'in-house';

export interface ObjectionPattern {
    id: string;
    category: ObjectionCategory;
    patternDetails: string[]; // Keywords/phrases
    strategicResponseTemplate: string;
    requiresEscalation: boolean;
}

// Seed library simulating 50 common B2B objection states.
export const OBJECTION_LIBRARY: ObjectionPattern[] = [
    {
        id: 'obj_price_too_high',
        category: 'price',
        patternDetails: ['too expensive', 'price is high', 'cost too much', 'budget', 'can\'t afford', 'too high'],
        strategicResponseTemplate: "I understand the investment seems significant. Let's look at the ROI model we generated: if we fix [PAIN_POINT], the projected monthly revenue gain is [ROI_CALC]. We're essentially trading a fraction of that new revenue for this implementation.",
        requiresEscalation: false
    },
    {
        id: 'obj_timing_not_right',
        category: 'timing',
        patternDetails: ['not right now', 'maybe next quarter', 'too busy', 'bad time', 'check back later'],
        strategicResponseTemplate: "Timing is definitively critical here. However, every month [PAIN_POINT] persists, you're potentially losing [MONTHLY_LOSS]. Let's discuss a phased rollout that requires minimal bandwidth from your team right now to stop the bleeding.",
        requiresEscalation: false
    },
    {
        id: 'obj_in_house',
        category: 'in-house',
        patternDetails: ['we have an internal team', 'my nephew does this', 'we do this in house', 'our dev handles it'],
        strategicResponseTemplate: "It's fantastic that you have an internal team! Our goal isn't to replace them, but to empower them. This audit identified [FINDING_METRICS] that are currently slipping through the cracks. We can fix the architecture so your team gets better results from their daily work going forward.",
        requiresEscalation: false
    },
    {
        id: 'obj_competition_cheaper',
        category: 'competition',
        patternDetails: ['competitor is cheaper', 'other agency', 'found someone else', 'cheaper quote'],
        strategicResponseTemplate: "That's completely understandable. The difference you're seeing in quotes usually comes down to scope. While others might fix the surface-level issues, our audit uncovered [CRITICAL_FINDING] which requires structural repair. Without fixing that, the cheaper solution won't yield the ROI we modeled.",
        requiresEscalation: false
    },
    {
        id: 'obj_escalate_angry',
        category: 'trust',
        patternDetails: ['this is wrong', 'you don\'t understand my business', 'terrible', 'stop', 'fake'],
        strategicResponseTemplate: "I apologize if this audit missed the mark on your specific operational context. Let me have our Lead Strategist review these findings manually. They will reach out to you directly to ensure we have the full context.",
        requiresEscalation: true
    }
];

export function detectObjection(prospectMessage: string): ObjectionPattern | null {
    const lowerMessage = prospectMessage.toLowerCase();

    // Simple heuristic detection logic prioritizing exact phrase hits.
    for (const objection of OBJECTION_LIBRARY) {
        for (const pattern of objection.patternDetails) {
            if (lowerMessage.includes(pattern.toLowerCase())) {
                return objection;
            }
        }
    }
    return null; // No explicitly known objection detected
}
