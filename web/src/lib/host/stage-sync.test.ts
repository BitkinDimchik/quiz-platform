import { describe, expect, it } from 'vitest';
import { hostStageIdentity, hostUiSessionChanged, shouldRefreshHostRoomUi } from './stage-sync';

describe('hostStageIdentity', () => {
  it('ignores pause and vip so answers do not restage', () => {
    const a = hostStageIdentity({
      phase: 'question',
      currentQuestionId: 'q1',
      endedAt: null,
    });
    const b = hostStageIdentity({
      phase: 'question',
      currentQuestionId: 'q1',
      endedAt: null,
    });
    expect(a).toBe(b);
  });

  it('changes when phase or question changes', () => {
    const q = hostStageIdentity({ phase: 'question', currentQuestionId: 'q1', endedAt: null });
    const reveal = hostStageIdentity({
      phase: 'answer_reveal',
      currentQuestionId: 'q1',
      endedAt: null,
    });
    const next = hostStageIdentity({ phase: 'question', currentQuestionId: 'q2', endedAt: null });
    expect(q).not.toBe(reveal);
    expect(q).not.toBe(next);
  });
});

describe('hostUiSessionChanged', () => {
  it('false when only version-like noise differs', () => {
    expect(
      hostUiSessionChanged(
        { phase: 'question', currentQuestionId: 'q1', version: 1 },
        { phase: 'question', currentQuestionId: 'q1', version: 2 },
      ),
    ).toBe(false);
  });

  it('true when pause flips', () => {
    expect(
      hostUiSessionChanged({ phase: 'question', isPaused: false }, { phase: 'question', isPaused: true }),
    ).toBe(true);
  });
});

describe('shouldRefreshHostRoomUi', () => {
  it('skips mid-game', () => {
    expect(shouldRefreshHostRoomUi({ phase: 'question' })).toBe(false);
    expect(shouldRefreshHostRoomUi({ phase: 'answer_reveal' })).toBe(false);
  });

  it('runs in lobby or when ended', () => {
    expect(shouldRefreshHostRoomUi({ phase: 'lobby' })).toBe(true);
    expect(shouldRefreshHostRoomUi({ phase: 'question', endedAt: '2026-01-01' })).toBe(true);
  });
});
