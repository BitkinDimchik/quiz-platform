import { parseStageTypeStyles } from './stage-type-styles';

describe('parseStageTypeStyles', () => {
  it('keeps safe family and clamps size', () => {
    expect(
      parseStageTypeStyles({
        heading: { fontFamily: 'Georgia, serif', fontSize: 40 },
        answers: { fontSize: 99 },
        labels: { fontFamily: 'bad;color:red' },
      }),
    ).toEqual({
      heading: { fontFamily: 'Georgia, serif', fontSize: 40 },
      answers: { fontSize: 72 },
    });
  });

  it('returns null for missing or invalid values', () => {
    expect(parseStageTypeStyles(null)).toBeNull();
    expect(parseStageTypeStyles(undefined)).toBeNull();
    expect(parseStageTypeStyles([])).toBeNull();
  });
});
