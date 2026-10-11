import { describe, expect, it } from 'vitest';
import { markOwnAnswerCorrectIfDisputeApproved } from './dispute-feedback';
import type { PlayerQuestion } from './types';

const q = (over: Partial<PlayerQuestion> = {}): PlayerQuestion => ({
  id: 'q1',
  type: 'text_input',
  prompt: 'P',
  playerAnswer: { textAnswer: 'тисовая', isCorrect: false },
  ...over,
});

const dispute = {
  proposerPlayerId: 'p1',
  questionId: 'q1',
  status: 'approved' as const,
};

describe('markOwnAnswerCorrectIfDisputeApproved', () => {
  it('turns the proposer answer green after approval', () => {
    const next = markOwnAnswerCorrectIfDisputeApproved(q(), dispute, 'p1');
    expect(next?.playerAnswer?.isCorrect).toBe(true);
    expect(next?.playerAnswer?.textAnswer).toBe('тисовая');
  });

  it('leaves other players unchanged', () => {
    const src = q();
    expect(markOwnAnswerCorrectIfDisputeApproved(src, dispute, 'p2')).toBe(src);
  });

  it('ignores a rejected dispute', () => {
    const src = q();
    expect(
      markOwnAnswerCorrectIfDisputeApproved(src, { ...dispute, status: 'rejected' }, 'p1'),
    ).toBe(src);
  });

  it('accepts outcome=approved even if status is still open on the payload', () => {
    const next = markOwnAnswerCorrectIfDisputeApproved(
      q(),
      { ...dispute, status: 'open' },
      'p1',
      'approved',
    );
    expect(next?.playerAnswer?.isCorrect).toBe(true);
  });

  it('ignores approval for another question', () => {
    const src = q();
    expect(
      markOwnAnswerCorrectIfDisputeApproved(src, { ...dispute, questionId: 'q2' }, 'p1'),
    ).toBe(src);
  });
});
