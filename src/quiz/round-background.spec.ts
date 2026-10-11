import { resolveRoundBackground } from './round-background';

describe('resolveRoundBackground', () => {
  it('keeps the round background when set', () => {
    expect(resolveRoundBackground('/rounds/a.jpg', '/quiz/cover.jpg')).toBe('/rounds/a.jpg');
  });

  it('falls back to the quiz splash when the round has none', () => {
    expect(resolveRoundBackground(null, '/quiz/cover.jpg')).toBe('/quiz/cover.jpg');
    expect(resolveRoundBackground('  ', 'gradient:linear-gradient(red, blue)')).toBe(
      'gradient:linear-gradient(red, blue)',
    );
  });

  it('returns null when neither is set', () => {
    expect(resolveRoundBackground(undefined, null)).toBeNull();
  });
});
