import {
  DEFAULT_BETTING_SEC,
  bettingPhaseSec,
  isStakeAllowed,
  parseBettingOptions,
  parseStakePresets,
  resolveStakeBounds,
} from './betting-options';
import { validateStake } from './betting-policy';

describe('parseBettingOptions', () => {
  it('defaults to free mode without limits', () => {
    expect(parseBettingOptions(null)).toEqual({
      mode: 'free',
      minStake: 0,
      maxStake: null,
      presets: [],
      stakeSec: 0,
      maxFraction: null,
    });
  });

  it('reads stake time', () => {
    expect(parseBettingOptions({ bettingSec: 45 }).stakeSec).toBe(45);
    expect(parseBettingOptions({ bettingSec: 0 }).stakeSec).toBe(0);
    expect(parseBettingOptions({ bettingSec: 99999 }).stakeSec).toBe(600);
  });

  it('reads free-mode limits', () => {
    expect(parseBettingOptions({ bettingMinStake: 10, bettingMaxStake: 200 })).toMatchObject({
      mode: 'free',
      minStake: 10,
      maxStake: 200,
    });
  });

  it('clamps min to max', () => {
    expect(parseBettingOptions({ bettingMinStake: 500, bettingMaxStake: 100 }).minStake).toBe(100);
  });

  it('falls back to free mode when presets mode has no usable values', () => {
    expect(parseBettingOptions({ bettingMode: 'presets', bettingPresets: [0, -5] }).mode).toBe('free');
  });

  it('keeps legacy fraction as extra cap', () => {
    expect(parseBettingOptions({}, '0.5').maxFraction).toBe('0.5');
  });
});

describe('parseStakePresets', () => {
  it('sorts, dedupes and drops non-positive values', () => {
    expect(parseStakePresets([50, 10, '25', 10, 0, -3, 'x'])).toEqual([10, 25, 50]);
  });
});

describe('resolveStakeBounds', () => {
  it('free mode: min is 1 when no explicit min', () => {
    const o = parseBettingOptions({});
    expect(resolveStakeBounds(120, o)).toEqual({ min: 1, max: 120, presets: [], canBet: true });
  });

  it('free mode: author max is not clipped by current score', () => {
    const o = parseBettingOptions({ bettingMinStake: 10, bettingMaxStake: 100 });
    expect(resolveStakeBounds(1000, o).max).toBe(100);
    expect(resolveStakeBounds(0, o).max).toBe(100);
    expect(resolveStakeBounds(0, o).canBet).toBe(true);
  });

  it('free mode: empty max still follows the score', () => {
    const o = parseBettingOptions({ bettingMinStake: 50 });
    expect(resolveStakeBounds(20, o).canBet).toBe(false);
    expect(resolveStakeBounds(80, o).max).toBe(80);
  });

  it('presets mode: keeps author options even if score is lower', () => {
    const o = parseBettingOptions({ bettingMode: 'presets', bettingPresets: [10, 50, 100] });
    expect(resolveStakeBounds(5, o).presets).toEqual([10, 50, 100]);
    expect(resolveStakeBounds(5, o).canBet).toBe(true);
  });

  it('applies legacy fraction cap', () => {
    const o = parseBettingOptions({}, '0.5');
    expect(resolveStakeBounds(100, o).max).toBe(50);
  });
});

describe('bettingPhaseSec', () => {
  it('keeps base duration when betting is off', () => {
    expect(bettingPhaseSec(6, null)).toBe(6);
  });

  it('extends short phases to the default stake time', () => {
    expect(bettingPhaseSec(6, parseBettingOptions({}))).toBe(DEFAULT_BETTING_SEC);
  });

  it('uses the configured stake time', () => {
    expect(bettingPhaseSec(6, parseBettingOptions({ bettingSec: 45 }))).toBe(45);
  });

  it('never shortens a longer phase', () => {
    expect(bettingPhaseSec(60, parseBettingOptions({ bettingSec: 30 }))).toBe(60);
  });
});

describe('isStakeAllowed / validateStake', () => {
  it('always allows zero (play without a stake)', () => {
    const o = parseBettingOptions({ bettingMode: 'presets', bettingPresets: [100] });
    expect(isStakeAllowed(0, 0, o)).toBe(true);
    expect(() => validateStake(0, 0, o)).not.toThrow();
  });

  it('free mode: rejects out-of-range stakes', () => {
    const o = parseBettingOptions({ bettingMinStake: 10, bettingMaxStake: 100 });
    expect(() => validateStake(500, 10, o)).not.toThrow();
    expect(() => validateStake(500, 100, o)).not.toThrow();
    expect(() => validateStake(500, 9, o)).toThrow();
    expect(() => validateStake(500, 101, o)).toThrow();
    expect(() => validateStake(0, 80, o)).not.toThrow();
  });

  it('presets mode: only allows exact options', () => {
    const o = parseBettingOptions({ bettingMode: 'presets', bettingPresets: [10, 25] });
    expect(() => validateStake(100, 25, o)).not.toThrow();
    expect(() => validateStake(100, 20, o)).toThrow();
    expect(() => validateStake(0, 25, o)).not.toThrow();
  });

  it('rejects negative and fractional stakes', () => {
    const o = parseBettingOptions({});
    expect(() => validateStake(100, -1, o)).toThrow();
    expect(() => validateStake(100, 1.5, o)).toThrow();
  });
});
