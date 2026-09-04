import { describe, expect, it } from 'vitest';
import { evaluateSequenceBranching, BranchingEventHistory } from '../sprint2/sequenceBranching';
import { OutreachLeadStage } from '@prisma/client';

describe('Sequence Branching: Stop-on-Reply & Stop-on-Unsubscribe Logic', () => {
  const baseHistory: BranchingEventHistory = {
    totalOpens: 0,
    totalClicks: 0,
    totalReplies: 0,
    hasBounced: false,
    hasUnsubscribed: false,
    lastOpenedAt: null,
  };

  it('stops sequence immediately upon unsubscribe (doNotContact = true)', () => {
    const history: BranchingEventHistory = {
      ...baseHistory,
      hasUnsubscribed: true,
    };

    const action = evaluateSequenceBranching(OutreachLeadStage.CONTACTED, history);

    expect(action.kind).toBe('cancel_sequence');
    if (action.kind === 'cancel_sequence') {
      expect(action.doNotContact).toBe(true);
      expect(action.reason).toMatch(/unsubscribed/i);
    }
  });

  it('cancels sequence on hard bounce (badEmail = true)', () => {
    const history: BranchingEventHistory = {
      ...baseHistory,
      hasBounced: true,
    };

    const action = evaluateSequenceBranching(OutreachLeadStage.CONTACTED, history);

    expect(action.kind).toBe('cancel_sequence');
    if (action.kind === 'cancel_sequence') {
      expect(action.badEmail).toBe(true);
      expect(action.doNotContact).toBe(false);
    }
  });

  it('pauses sequence for review when prospect replies (stop-on-reply)', () => {
    const history: BranchingEventHistory = {
      ...baseHistory,
      totalOpens: 2,
      totalReplies: 1,
    };

    const action = evaluateSequenceBranching(OutreachLeadStage.CONTACTED, history);

    expect(action.kind).toBe('pause_for_review');
    expect(action.reason).toMatch(/replied/i);
  });

  it('triggers closing agent when prospect clicks proposal or scorecard link', () => {
    const history: BranchingEventHistory = {
      ...baseHistory,
      totalOpens: 3,
      totalClicks: 1,
    };

    const action = evaluateSequenceBranching(OutreachLeadStage.CONTACTED, history);

    expect(action.kind).toBe('trigger_closing_agent');
    expect(action.reason).toMatch(/clicked a link/i);
  });

  it('continues standard scheduled cadence when no interrupting events have occurred', () => {
    const history: BranchingEventHistory = {
      ...baseHistory,
      totalOpens: 0,
    };

    const action = evaluateSequenceBranching(OutreachLeadStage.CONTACTED, history);

    expect(action.kind).toBe('continue');
    expect(action.reason).toMatch(/No blocking actions detected/i);
  });
});
