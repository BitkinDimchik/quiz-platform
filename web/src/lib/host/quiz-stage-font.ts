import { formatFontFamilyCss, parseStageFontFamily } from './stage-fonts';
import { applyQuizStageTypeStyles, type StageTypeStyles } from './stage-type-styles';

export const QUIZ_STAGE_FONT_VAR = '--stage-font-family';

/** Применить шрифт квиза ко всем сценам (через CSS-переменную). */
export function applyQuizStageFont(
  fontFamily: string | null | undefined,
  el: HTMLElement = document.documentElement,
): void {
  const parsed = parseStageFontFamily(fontFamily);
  if (parsed) el.style.setProperty(QUIZ_STAGE_FONT_VAR, formatFontFamilyCss(parsed));
  else el.style.removeProperty(QUIZ_STAGE_FONT_VAR);
}

export function clearQuizStageFont(el: HTMLElement = document.documentElement): void {
  el.style.removeProperty(QUIZ_STAGE_FONT_VAR);
}

/** Базовый шрифт квиза + размеры/семейства заголовков, ответов и подписей. */
export function applyQuizStageTypography(
  input: {
    fontFamily?: string | null;
    stageTypeStyles?: StageTypeStyles | null;
  },
  el: HTMLElement = document.documentElement,
): void {
  applyQuizStageFont(input.fontFamily, el);
  applyQuizStageTypeStyles(input.stageTypeStyles, el);
}

/** Переопределить шрифт конкретного блока, не ломая !important в теме. */
export function stageFontVarStyle(
  fontFamily: string | null | undefined,
): { [QUIZ_STAGE_FONT_VAR]: string } | undefined {
  const parsed = parseStageFontFamily(fontFamily);
  if (!parsed) return undefined;
  return { [QUIZ_STAGE_FONT_VAR]: formatFontFamilyCss(parsed) };
}
