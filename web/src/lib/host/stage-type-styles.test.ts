/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import {
  STAGE_TYPE_STYLE_DEFAULTS,
  applyQuizStageTypeStyles,
  parseStageTypeStyles,
  patchStageTypeStyles,
  roleFontSize,
  stageTypeFontFamilyVar,
  stageTypeFontSizeVar,
} from './stage-type-styles';

describe('parseStageTypeStyles', () => {
  it('reads family and clamped size per role', () => {
    expect(
      parseStageTypeStyles({
        heading: { fontFamily: 'Georgia, serif', fontSize: 40 },
        answers: { fontSize: 8 },
        labels: { fontFamily: 'foo; background:red' },
      }),
    ).toEqual({
      heading: { fontFamily: 'Georgia, serif', fontSize: 40 },
      answers: { fontSize: 16 },
    });
  });

  it('returns empty object for an empty payload and null for garbage', () => {
    expect(parseStageTypeStyles({})).toEqual({});
    expect(parseStageTypeStyles(null)).toBeNull();
    expect(parseStageTypeStyles('nope')).toBeNull();
  });
});

describe('patchStageTypeStyles', () => {
  it('sets and clears a role family without dropping size', () => {
    const withSize = patchStageTypeStyles({}, 'heading', { fontSize: 40 });
    expect(withSize.heading).toEqual({ fontSize: 40 });
    const withFamily = patchStageTypeStyles(withSize, 'heading', { fontFamily: 'Arial' });
    expect(withFamily.heading).toEqual({ fontSize: 40, fontFamily: 'Arial' });
    const cleared = patchStageTypeStyles(withFamily, 'heading', { fontFamily: null });
    expect(cleared.heading).toEqual({ fontSize: 40 });
  });
});

describe('roleFontSize', () => {
  it('falls back to the larger default', () => {
    expect(roleFontSize(null, 'heading')).toBe(STAGE_TYPE_STYLE_DEFAULTS.heading.fontSize);
    expect(roleFontSize({ heading: { fontSize: 48 } }, 'heading')).toBe(48);
  });
});

describe('applyQuizStageTypeStyles', () => {
  it('writes px size and quoted family variables', () => {
    const el = document.createElement('div');
    applyQuizStageTypeStyles(
      { heading: { fontSize: 36, fontFamily: 'Georgia, serif' }, answers: { fontSize: 28 } },
      el,
    );
    expect(el.style.getPropertyValue(stageTypeFontSizeVar('heading'))).toBe('36px');
    expect(el.style.getPropertyValue(stageTypeFontFamilyVar('heading'))).toBe('"Georgia, serif"');
    expect(el.style.getPropertyValue(stageTypeFontSizeVar('answers'))).toBe('28px');
    applyQuizStageTypeStyles(
      { answers: { fontFamily: 'Harry Potter (Russian Version of Gfdtk)' } },
      el,
    );
    expect(el.style.getPropertyValue(stageTypeFontFamilyVar('answers'))).toBe(
      '"Harry Potter (Russian Version of Gfdtk)"',
    );
    applyQuizStageTypeStyles({}, el);
    expect(el.style.getPropertyValue(stageTypeFontSizeVar('heading'))).toBe('');
  });
});
