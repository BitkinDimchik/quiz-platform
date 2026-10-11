import { formatFontFamilyCss, parseStageFontFamily } from './stage-fonts';

export const STAGE_TYPE_ROLES = ['heading', 'answers', 'labels'] as const;
export type StageTypeRole = (typeof STAGE_TYPE_ROLES)[number];

export type StageTypeStyle = {
  fontFamily?: string;
  fontSize?: number;
};

export type StageTypeStyles = Partial<Record<StageTypeRole, StageTypeStyle>>;

export const STAGE_TYPE_FONT_SIZE_MIN = 16;
export const STAGE_TYPE_FONT_SIZE_MAX = 72;

/** Целевые размеры по умолчанию (px) — крупнее прежних 25px. */
export const STAGE_TYPE_STYLE_DEFAULTS: Record<StageTypeRole, { fontSize: number }> = {
  heading: { fontSize: 34 },
  answers: { fontSize: 32 },
  labels: { fontSize: 30 },
};

export const STAGE_TYPE_ROLE_LABELS: Record<StageTypeRole, { title: string; hint: string; sample: string }> = {
  heading: {
    title: 'Заголовки',
    hint: 'Текст вопроса, название раунда, заголовок итогов',
    sample: 'Текст вопроса',
  },
  answers: {
    title: 'Ответы',
    hint: 'Варианты ответа и правильные текстовые ответы',
    sample: 'Лондон',
  },
  labels: {
    title: 'Подписи',
    hint: '«Правильный ответ», «Варианты ответа» и другие служебные строки',
    sample: 'Правильный ответ',
  },
};

export function stageTypeFontSizeVar(role: StageTypeRole): string {
  return `--stage-${role}-font-size`;
}

export function stageTypeFontFamilyVar(role: StageTypeRole): string {
  return `--stage-${role}-font-family`;
}

function clampSize(n: number): number {
  return Math.min(STAGE_TYPE_FONT_SIZE_MAX, Math.max(STAGE_TYPE_FONT_SIZE_MIN, n));
}

export function parseStageTypeStyle(raw: unknown): StageTypeStyle | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const rec = raw as Record<string, unknown>;
  const out: StageTypeStyle = {};
  const ff = parseStageFontFamily(rec.fontFamily);
  if (ff) out.fontFamily = ff;
  const fs = typeof rec.fontSize === 'number' ? rec.fontSize : Number(rec.fontSize);
  if (Number.isFinite(fs)) out.fontSize = clampSize(Math.round(fs));
  if (!out.fontFamily && out.fontSize == null) return undefined;
  return out;
}

export function parseStageTypeStyles(raw: unknown): StageTypeStyles | null {
  if (raw == null) return null;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  const out: StageTypeStyles = {};
  for (const role of STAGE_TYPE_ROLES) {
    const parsed = parseStageTypeStyle(rec[role]);
    if (parsed) out[role] = parsed;
  }
  return out;
}

export function roleFontSize(styles: StageTypeStyles | null | undefined, role: StageTypeRole): number {
  return styles?.[role]?.fontSize ?? STAGE_TYPE_STYLE_DEFAULTS[role].fontSize;
}

export function patchStageTypeStyles(
  prev: StageTypeStyles | null | undefined,
  role: StageTypeRole,
  patch: { fontFamily?: string | null; fontSize?: number },
): StageTypeStyles {
  const current: StageTypeStyles = { ...(prev || {}) };
  const merged: StageTypeStyle = { ...(current[role] || {}) };
  if (Object.prototype.hasOwnProperty.call(patch, 'fontFamily')) {
    const parsed = parseStageFontFamily(patch.fontFamily ?? undefined);
    if (parsed) merged.fontFamily = parsed;
    else delete merged.fontFamily;
  }
  if (typeof patch.fontSize === 'number' && Number.isFinite(patch.fontSize)) {
    merged.fontSize = clampSize(Math.round(patch.fontSize));
  }
  if (!merged.fontFamily && merged.fontSize == null) delete current[role];
  else current[role] = merged;
  return current;
}

/** Записать CSS-переменные ролей на корень сцены (все экраны квиза). */
export function applyQuizStageTypeStyles(
  styles: StageTypeStyles | null | undefined,
  el: HTMLElement = document.documentElement,
): void {
  const parsed = parseStageTypeStyles(styles ?? null) || {};
  for (const role of STAGE_TYPE_ROLES) {
    const sizeVar = stageTypeFontSizeVar(role);
    const familyVar = stageTypeFontFamilyVar(role);
    const style = parsed[role];
    if (style?.fontSize != null) el.style.setProperty(sizeVar, `${style.fontSize}px`);
    else el.style.removeProperty(sizeVar);
    if (style?.fontFamily) el.style.setProperty(familyVar, formatFontFamilyCss(style.fontFamily));
    else el.style.removeProperty(familyVar);
  }
}

export function clearQuizStageTypeStyles(el: HTMLElement = document.documentElement): void {
  applyQuizStageTypeStyles({}, el);
}
