/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { QUIZ_STAGE_FONT_VAR, applyQuizStageFont, stageFontVarStyle } from './quiz-stage-font';

describe('stageFontVarStyle', () => {
  it('sets the CSS variable for a valid family', () => {
    expect(stageFontVarStyle('Georgia, serif')).toEqual({
      [QUIZ_STAGE_FONT_VAR]: 'Georgia, serif',
    });
  });

  it('ignores empty and unsafe values', () => {
    expect(stageFontVarStyle('')).toBeUndefined();
    expect(stageFontVarStyle('foo; background:red')).toBeUndefined();
  });
});

describe('applyQuizStageFont', () => {
  it('writes and clears the document variable', () => {
    const el = document.createElement('div');
    applyQuizStageFont('Arial', el);
    expect(el.style.getPropertyValue(QUIZ_STAGE_FONT_VAR)).toBe('Arial');
    applyQuizStageFont(null, el);
    expect(el.style.getPropertyValue(QUIZ_STAGE_FONT_VAR)).toBe('');
  });
});
