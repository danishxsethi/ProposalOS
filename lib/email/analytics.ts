import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

export type EmailEventType = 'open' | 'click' | 'reply';

export async function logEmailEvent(proposalId: string, emailStep: number, variant: 'A' | 'B', eventType: EmailEventType) {
    const sequence = await prisma.emailSequence.findUnique({
        where: { proposalId }
    });

    if (!sequence) return false;

    // Expected JSON structure: { "openRates": { "step_1": { "A": 5, "B": 2 } } }
    const analyticsData = (sequence.analytics as Record<string, any>) || { openRates: {}, clickRates: {}, replyRates: {} };

    const stepKey = `step_${emailStep}`;
    const targetMapName = eventType === 'open' ? 'openRates' : eventType === 'click' ? 'clickRates' : 'replyRates';

    // Ensure nested objects exist
    if (!analyticsData[targetMapName]) analyticsData[targetMapName] = {};
    if (!analyticsData[targetMapName][stepKey]) analyticsData[targetMapName][stepKey] = { A: 0, B: 0 };

    // Increment the specific variant counter
    analyticsData[targetMapName][stepKey][variant] = (analyticsData[targetMapName][stepKey][variant] || 0) + 1;

    await prisma.emailSequence.update({
        where: { proposalId },
        data: { analytics: analyticsData as Prisma.InputJsonValue }
    });

    return true;
}
