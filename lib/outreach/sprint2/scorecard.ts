import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';

export interface PainComponentShape {
    weight?: number;
    score?: number;
    detail?: string;
}

export interface PainBreakdownShape {
    websiteSpeed?: PainComponentShape;
    mobileBroken?: PainComponentShape;
    gbpNeglected?: PainComponentShape;
    noSsl?: PainComponentShape;
    zeroReviewResponses?: PainComponentShape;
    socialDead?: PainComponentShape;
    competitorsOutperforming?: PainComponentShape;
    accessibilityViolations?: PainComponentShape;
}

export function toObject<T extends Record<string, unknown>>(value: unknown, fallback: T): T {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as T;
    }
    return fallback;
}

export function toStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean);
}

export function ensureBaseUrl(): string {
    return (
        process.env.NEXT_PUBLIC_APP_URL ||
        process.env.BASE_URL ||
        'http://localhost:3000'
    ).replace(/\/$/, '');
}

export function scorecardUrlForToken(token: string, baseUrl = ensureBaseUrl()): string {
    return `${baseUrl}/outreach/scorecard/${token}`;
}

export async function ensureLeadScorecardToken(leadId: string): Promise<string> {
    const lead = await prisma.prospectLead.findUnique({
        where: { id: leadId },
        select: { scorecardToken: true },
    });
    if (!lead) {
        throw new Error(`Lead ${leadId} not found`);
    }
    if (lead.scorecardToken) return lead.scorecardToken;

    const token = randomUUID();
    const updated = await prisma.prospectLead.update({
        where: { id: leadId },
        data: { scorecardToken: token },
        select: { scorecardToken: true },
    });
    return updated.scorecardToken || token;
}

