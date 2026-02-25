import { OutreachEmailType, OutreachLeadStage, OutreachEmailStatus } from '@prisma/client';

export interface BranchingEventHistory {
    totalOpens: number;
    totalClicks: number;
    totalReplies: number;
    hasBounced: boolean;
    hasUnsubscribed: boolean;
    lastOpenedAt: Date | null;
}

export type BranchingAction =
    | { kind: 'continue'; reason: string }
    | { kind: 'trigger_closing_agent'; reason: string }
    | { kind: 'pause_for_review'; reason: string }
    | { kind: 'cancel_sequence'; reason: string; badEmail: boolean; doNotContact: boolean };

/**
 * Evaluate the prospect's engagement history to determine the next state machine action.
 */
export function evaluateSequenceBranching(
    stage: OutreachLeadStage,
    history: BranchingEventHistory,
    now = new Date()
): BranchingAction {
    // 1. Terminal states
    if (history.hasUnsubscribed) {
        return { kind: 'cancel_sequence', reason: 'Prospect unsubscribed', badEmail: false, doNotContact: true };
    }

    if (history.hasBounced) {
        return { kind: 'cancel_sequence', reason: 'Email bounced', badEmail: true, doNotContact: false };
    }

    // 2. High-Intent Positive Engagement
    if (history.totalReplies > 0) {
        return { kind: 'pause_for_review', reason: 'Prospect replied to an email' };
    }

    if (history.totalClicks > 0) {
        return { kind: 'trigger_closing_agent', reason: 'Prospect clicked a link (Scorecard/Proposal)' };
    }

    // 3. Passive Engagement (Opened)
    if (history.totalOpens > 0 && history.lastOpenedAt) {
        const hoursSinceLastOpen = (now.getTime() - history.lastOpenedAt.getTime()) / (1000 * 60 * 60);

        // Wait at least 48h after an open before proceeding to the next scheduled step
        if (hoursSinceLastOpen < 48) {
            // This implicitly keeps them in the sequence but their next scheduled action won't fire yet.
            // Currently, 'continue' proceeds, so the worker handles the logic of checking scheduledAt.
            return { kind: 'continue', reason: `Opened ${Math.round(hoursSinceLastOpen)}h ago, waiting for click` };
        }
    }

    // Default: Nothing special happened, continue the predefined schedule.
    return { kind: 'continue', reason: 'No blocking actions detected' };
}
