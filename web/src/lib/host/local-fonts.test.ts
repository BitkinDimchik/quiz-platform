import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchSystemFontFamilies = vi.fn<[boolean?], Promise<string[]>>();

vi.mock('./system-fonts-api', () => ({
  fetchSystemFontFamilies: (refresh?: boolean) => fetchSystemFontFamilies(refresh),
}));

const { FALLBACK_FONT_FAMILIES, getFallbackFontFamilies, loadInstalledFontFamilies } = await import(
  './local-fonts'
);

describe('local-fonts', () => {
  beforeEach(() => {
    fetchSystemFontFamilies.mockReset();
    fetchSystemFontFamilies.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('exposes fallback fonts synchronously', () => {
    expect(getFallbackFontFamilies()).toContain('Arial');
  });

  it('uses the full server list, including custom fonts', async () => {
    fetchSystemFontFamilies.mockResolvedValue([
      'Arial',
      'Gilroy ExtraBold',
      'Академия',
      ...Array.from({ length: 300 }, (_, i) => `Family ${i}`),
    ]);
    const { families, source } = await loadInstalledFontFamilies({ force: true });
    expect(source).toBe('system');
    expect(families).toContain('Gilroy ExtraBold');
    expect(families).toContain('Академия');
    expect(families.length).toBe(303);
  });

  it('merges browser API fonts with server fonts without duplicates', async () => {
    fetchSystemFontFamilies.mockResolvedValue(['Arial', 'Custom One']);
    vi.stubGlobal('window', {
      queryLocalFonts: vi.fn(async () => [{ family: 'Arial' }, { family: 'Browser Only' }]),
    });
    const { families } = await loadInstalledFontFamilies({ force: true });
    expect(families).toEqual(['Arial', 'Browser Only', 'Custom One']);
  });

  it('falls back when neither server nor browser returns fonts', async () => {
    const { families, source } = await loadInstalledFontFamilies({ force: true });
    expect(source).toBe('fallback');
    expect(families.length).toBe(FALLBACK_FONT_FAMILIES.length);
  });
});
