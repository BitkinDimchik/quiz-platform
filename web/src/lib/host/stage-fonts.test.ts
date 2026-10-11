import { describe, expect, it } from 'vitest';
import {
  formatFontFamilyCss,
  mergeFontFamilyOptions,
  parsePrimaryFontFamily,
  parseStageFontFamily,
} from './stage-fonts';

describe('stage-fonts', () => {
  it('formats family names for CSS', () => {
    expect(formatFontFamilyCss('Arial')).toBe('Arial');
    expect(formatFontFamilyCss('Times New Roman')).toBe('"Times New Roman"');
  });

  it('parses primary family from stack', () => {
    expect(parsePrimaryFontFamily('"Times New Roman", Times, serif')).toBe('Times New Roman');
    expect(parsePrimaryFontFamily('Arial, Helvetica, sans-serif')).toBe('Arial');
  });

  it('parses and rejects invalid font stacks', () => {
    expect(parseStageFontFamily('Arial, Helvetica, sans-serif')).toBe('Arial, Helvetica, sans-serif');
    expect(parseStageFontFamily('<script>')).toBeUndefined();
  });

  it('merges current font into installed list', () => {
    const merged = mergeFontFamilyOptions(['Arial', 'Georgia'], '"Some Rare Font"');
    expect(merged).toContain('Some Rare Font');
    expect(merged).toContain('Arial');
  });
});
