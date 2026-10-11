import { fetchSystemFontFamilies } from './system-fonts-api';

/** Минимальный список, пока не пришёл полный перечень. */
export const FALLBACK_FONT_FAMILIES = [
  'Arial',
  'Calibri',
  'Cambria',
  'Courier New',
  'Georgia',
  'Segoe UI',
  'Tahoma',
  'Times New Roman',
  'Verdana',
];

type FontData = {
  family: string;
};

export type FontListSource = 'system' | 'browser' | 'fallback';

export type FontListResult = {
  families: string[];
  source: FontListSource;
};

let cachedResult: FontListResult | null = null;
let loadPromise: Promise<FontListResult> | null = null;

function sortFamilies(families: string[]): string[] {
  return [...new Set(families.map((f) => f.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'ru', { sensitivity: 'base' }),
  );
}

export function canQueryLocalFonts(): boolean {
  return typeof window !== 'undefined' && typeof window.queryLocalFonts === 'function';
}

export function getFallbackFontFamilies(): string[] {
  return sortFamilies(FALLBACK_FONT_FAMILIES);
}

async function loadFromBrowserApi(): Promise<string[]> {
  if (!canQueryLocalFonts()) return [];
  try {
    const fonts = (await window.queryLocalFonts!()) as FontData[];
    return fonts.map((f) => f.family);
  } catch {
    // доступ не выдан или API заблокирован во встроенном браузере
    return [];
  }
}

export async function loadInstalledFontFamilies(options?: { force?: boolean }): Promise<FontListResult> {
  if (options?.force) {
    cachedResult = null;
    loadPromise = null;
  }
  if (cachedResult) return cachedResult;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const [systemFamilies, browserFamilies] = await Promise.all([
      fetchSystemFontFamilies(options?.force),
      loadFromBrowserApi(),
    ]);

    const merged = sortFamilies([...systemFamilies, ...browserFamilies]);
    if (merged.length) {
      cachedResult = {
        families: merged,
        source: systemFamilies.length ? 'system' : 'browser',
      };
      return cachedResult;
    }

    cachedResult = { families: getFallbackFontFamilies(), source: 'fallback' };
    return cachedResult;
  })();

  return loadPromise;
}
