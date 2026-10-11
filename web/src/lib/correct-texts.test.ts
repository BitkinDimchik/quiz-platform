import { describe, expect, it } from 'vitest';
import { visibleCorrectTexts } from './correct-texts';

describe('visibleCorrectTexts', () => {
  it('returns only the first non-empty variant', () => {
    expect(visibleCorrectTexts(['Альбус Дамблдор', 'Дамблдор', 'Альбус'])).toEqual(['Альбус Дамблдор']);
  });

  it('skips blank entries', () => {
    expect(visibleCorrectTexts(['  ', '', 'Хедвиг', 'Букля'])).toEqual(['Хедвиг']);
  });

  it('returns empty when nothing is usable', () => {
    expect(visibleCorrectTexts(null)).toEqual([]);
    expect(visibleCorrectTexts(['', '  '])).toEqual([]);
  });
});
