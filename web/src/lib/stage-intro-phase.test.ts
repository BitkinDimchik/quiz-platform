import { describe, expect, it } from 'vitest';
import { isStageIntroPhase } from './stage-intro-phase';

describe('isStageIntroPhase', () => {
  it('matches quiz and round intros', () => {
    expect(isStageIntroPhase('quiz_intro')).toBe(true);
    expect(isStageIntroPhase('round_intro')).toBe(true);
    expect(isStageIntroPhase('question')).toBe(false);
    expect(isStageIntroPhase(null)).toBe(false);
  });
});
