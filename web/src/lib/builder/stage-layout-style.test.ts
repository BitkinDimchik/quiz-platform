import { describe, expect, it } from 'vitest';
import {
  getStageAnswerFontFamily,
  getStageSlotFontFamily,
  setStageAnswerFontFamily,
  setStageSlotFontFamily,
} from './stage-layout-style';

describe('stage-layout-style', () => {
  it('sets and reads prompt font', () => {
    const layout = setStageSlotFontFamily(null, 'prompt', 'Arial, Helvetica, sans-serif');
    expect(getStageSlotFontFamily(layout, 'prompt')).toBe('Arial, Helvetica, sans-serif');
  });

  it('clears prompt font back to default', () => {
    const withFont = setStageSlotFontFamily(null, 'prompt', '"Times New Roman", Times, serif');
    const cleared = setStageSlotFontFamily(withFont, 'prompt', undefined);
    expect(getStageSlotFontFamily(cleared, 'prompt')).toBeUndefined();
  });

  it('sets font per answer option', () => {
    const layout = setStageAnswerFontFamily(null, 'opt-a', 'Georgia, "Times New Roman", serif');
    expect(getStageAnswerFontFamily(layout, 'opt-a')).toBe('Georgia, "Times New Roman", serif');
  });
});
