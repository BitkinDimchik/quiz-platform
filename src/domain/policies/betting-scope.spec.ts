import { resolveBettingScope, bettingPhaseForScope } from './betting-scope';
import { defaultBettingOptions } from './betting-options';
import { SessionPhase } from '../../common/enums';

describe('resolveBettingScope', () => {
  const round = { id: 'r1', bettingEnabled: false, bettingMaxFraction: null };

  it('prefers round betting over question meta', () => {
    const scope = resolveBettingScope(
      { ...round, bettingEnabled: true, bettingMaxFraction: '0.5' },
      { bettingEnabled: true },
      'q1',
    );
    expect(scope.kind).toBe('round');
    expect(scope.kind === 'round' && scope.options.maxFraction).toBe('0.5');
  });

  it('reads round betting options from round meta', () => {
    const scope = resolveBettingScope(
      {
        ...round,
        bettingEnabled: true,
        meta: { bettingMode: 'presets', bettingPresets: [50, 10, 10, 25] },
      },
      {},
      'q1',
    );
    expect(scope.kind === 'round' && scope.options).toEqual({
      mode: 'presets',
      minStake: 0,
      maxStake: null,
      presets: [10, 25, 50],
      stakeSec: 0,
      maxFraction: null,
    });
  });

  it('uses question meta when round betting off', () => {
    const scope = resolveBettingScope(
      round,
      { bettingEnabled: true, bettingMinStake: 5, bettingMaxStake: 100 },
      'q1',
    );
    expect(scope).toEqual({
      kind: 'question',
      questionId: 'q1',
      options: {
        mode: 'free',
        minStake: 5,
        maxStake: 100,
        presets: [],
        stakeSec: 0,
        maxFraction: null,
      },
    });
  });

  it('returns none when disabled', () => {
    expect(resolveBettingScope(round, {}, 'q1').kind).toBe('none');
  });
});

describe('bettingPhaseForScope', () => {
  it('maps scope to phase', () => {
    const options = defaultBettingOptions();
    expect(bettingPhaseForScope({ kind: 'round', roundId: 'r', options })).toBe(
      SessionPhase.RoundIntro,
    );
    expect(bettingPhaseForScope({ kind: 'question', questionId: 'q', options })).toBe(
      SessionPhase.QuestionRead,
    );
    expect(bettingPhaseForScope({ kind: 'none' })).toBeNull();
  });
});
