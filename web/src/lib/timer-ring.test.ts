import { describe, expect, it } from 'vitest';
import { timerRingDashoffset } from './timer-ring';

describe('timerRingDashoffset', () => {
  it('full remaining keeps the ring closed', () => {
    expect(timerRingDashoffset(100, 15000, 15000)).toBe(0);
  });

  it('zero remaining empties the ring', () => {
    expect(timerRingDashoffset(100, 0, 15000)).toBe(100);
  });

  it('midpoint is half the circumference', () => {
    expect(timerRingDashoffset(80, 5000, 10000)).toBe(40);
  });

  it('clamps overflow remaining', () => {
    expect(timerRingDashoffset(100, 20000, 10000)).toBe(0);
  });

  it('falls back to empty when total is missing', () => {
    expect(timerRingDashoffset(100, 4000, null)).toBe(100);
    expect(timerRingDashoffset(100, null, 10000)).toBe(100);
    expect(timerRingDashoffset(0, 4000, 10000)).toBe(0);
  });
});
