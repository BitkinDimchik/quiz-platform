import { FALLBACK_FONT_FAMILIES } from './local-fonts';

/** Шрифт интерфейса — для пункта «По умолчанию». */
export const STAGE_FONT_DEFAULT = 'Figtree, system-ui, sans-serif';

function normalizeFontKey(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** CSS font-family для одного семейства (с кавычками при необходимости). */
export function formatFontFamilyCss(family: string): string {
  const f = family.trim();
  if (!f) return '';
  if (/^["']/.test(f)) return f;
  if (/[\s,]/.test(f)) return `"${f.replace(/"/g, '')}"`;
  return f;
}

/** Первое семейство из сохранённого font-family. */
export function parsePrimaryFontFamily(stack: string | null | undefined): string | undefined {
  if (!stack) return undefined;
  const first = stack.split(',')[0]?.trim();
  if (!first) return undefined;
  if (
    (first.startsWith('"') && first.endsWith('"')) ||
    (first.startsWith("'") && first.endsWith("'"))
  ) {
    return first.slice(1, -1);
  }
  return first;
}

/**
 * Допускаем буквы любых алфавитов (шрифты бывают с русскими именами) и цифры,
 * но не пускаем символы, которыми можно сломать CSS: ; { } : < > \ /
 */
const FONT_FAMILY_RE = /^[\p{L}\p{M}\p{N}\s,.'"\-_&()+]+$/u;

export function parseStageFontFamily(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const s = raw.trim();
  if (!s || s.length > 160) return undefined;
  if (!FONT_FAMILY_RE.test(s)) return undefined;
  return s;
}

export function mergeFontFamilyOptions(
  installed: string[],
  currentStack: string | null | undefined,
): string[] {
  const current = parsePrimaryFontFamily(currentStack);
  const merged = current ? [current, ...installed] : installed;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of merged) {
    const key = normalizeFontKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(name.trim());
  }
  return out.sort((a, b) => a.localeCompare(b, 'ru', { sensitivity: 'base' }));
}

export { FALLBACK_FONT_FAMILIES };
