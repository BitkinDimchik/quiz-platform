import { describe, expect, it } from 'vitest';
import {
  bettingConfigFromQuestion,
  formatStakeLimits,
  isBettingUiPhase,
  isStakeAllowed,
  resolveStakeBounds,
} from './betting';

describe('bettingConfigFromQuestion', () => {
  it('defaults to free mode without limits', () => {
    expect(bettingConfigFromQuestion(null)).toEqual({
      mode: 'free',
      minStake: 0,
      maxStake: null,
      presets: [],
      maxFraction: null,
    });
  });

  it('reads free-mode limits', () => {
    expect(
      bettingConfigFromQuestion({ bettingMode: 'free', bettingMinStake: 10, bettingMaxStake: 200 }),
    ).toMatchObject({ mode: 'free', minStake: 10, maxStake: 200 });
  });

  it('sorts and dedupes presets', () => {
    expect(
      bettingConfigFromQuestion({ bettingMode: 'presets', bettingPresets: [50, 10, 10, 25] }),
    ).toMatchObject({ mode: 'presets', presets: [10, 25, 50] });
  });

  it('falls back to free mode when presets are empty', () => {
    expect(bettingConfigFromQuestion({ bettingMode: 'presets', bettingPresets: [] }).mode).toBe('free');
  });
});

describe('resolveStakeBounds', () => {
  it('free mode: min 1, max is the score', () => {
    const cfg = bettingConfigFromQuestion({});
    expect(resolveStakeBounds(100, cfg)).toEqual({ min: 1, max: 100, presets: [], canBet: true });
  });

  it('free mode: author max is not clipped by current score', () => {
    const cfg = bettingConfigFromQuestion({ bettingMinStake: 10, bettingMaxStake: 100 });
    expect(resolveStakeBounds(1000, cfg).max).toBe(100);
    expect(resolveStakeBounds(0, cfg).max).toBe(100);
    expect(resolveStakeBounds(0, cfg).canBet).toBe(true);
  });

  it('presets mode: keeps author options even if score is lower', () => {
    const cfg = bettingConfigFromQuestion({ bettingMode: 'presets', bettingPresets: [10, 50, 100] });
    expect(resolveStakeBounds(5, cfg).presets).toEqual([10, 50, 100]);
    expect(resolveStakeBounds(5, cfg).canBet).toBe(true);
  });

  it('applies legacy fraction cap', () => {
    const cfg = bettingConfigFromQuestion({ bettingMaxFraction: '0.5' });
    expect(resolveStakeBounds(99, cfg).max).toBe(49);
  });

  it('never returns negative max', () => {
    expect(resolveStakeBounds(-5, bettingConfigFromQuestion({})).max).toBe(0);
  });
});

describe('isStakeAllowed', () => {
  it('always allows zero', () => {
    const cfg = bettingConfigFromQuestion({ bettingMode: 'presets', bettingPresets: [100] });
    expect(isStakeAllowed(0, resolveStakeBounds(0, cfg), cfg.mode)).toBe(true);
  });

  it('free mode: respects range', () => {
    const cfg = bettingConfigFromQuestion({ bettingMinStake: 10, bettingMaxStake: 100 });
    const bounds = resolveStakeBounds(500, cfg);
    expect(isStakeAllowed(10, bounds, cfg.mode)).toBe(true);
    expect(isStakeAllowed(9, bounds, cfg.mode)).toBe(false);
    expect(isStakeAllowed(101, bounds, cfg.mode)).toBe(false);
  });

  it('presets mode: only exact options', () => {
    const cfg = bettingConfigFromQuestion({ bettingMode: 'presets', bettingPresets: [10, 25] });
    const bounds = resolveStakeBounds(100, cfg);
    expect(isStakeAllowed(25, bounds, cfg.mode)).toBe(true);
    expect(isStakeAllowed(20, bounds, cfg.mode)).toBe(false);
  });
});

describe('isBettingUiPhase', () => {
  it('matches scope to phase', () => {
    expect(isBettingUiPhase('round_intro', 'round')).toBe(true);
    expect(isBettingUiPhase('question_read', 'question')).toBe(true);
    expect(isBettingUiPhase('question', 'question')).toBe(false);
    expect(isBettingUiPhase('round_intro', 'question')).toBe(false);
  });
});

describe('formatStakeLimits', () => {
  it('describes free range and presets', () => {
    const free = bettingConfigFromQuestion({ bettingMinStake: 10, bettingMaxStake: 100 });
    expect(formatStakeLimits(resolveStakeBounds(500, free), 'free')).toBe('Ставка от 10 до 100 очков');
    const presets = bettingConfigFromQuestion({ bettingMode: 'presets', bettingPresets: [10] });
    expect(formatStakeLimits(resolveStakeBounds(100, presets), 'presets')).toBe(
      'Выберите один из вариантов ставки',
    );
  });

  it('returns null when betting is impossible', () => {
    const cfg = bettingConfigFromQuestion({ bettingMinStake: 50 });
    expect(formatStakeLimits(resolveStakeBounds(10, cfg), 'free')).toBeNull();
  });
});
