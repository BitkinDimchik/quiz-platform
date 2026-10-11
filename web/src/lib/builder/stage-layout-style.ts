import { parseStageBox, type StageBox, type StageLayout } from '../host/stage-layout';
import { parseStageFontFamily } from '../host/stage-fonts';

/** Маркер «только стиль», без смещения раскладки — позиция берётся с экрана. */
export const STYLE_ONLY_BOX: StageBox = { x: 0, y: 0, w: 1, h: 1 };

function baseLayout(layout: StageLayout | null | undefined): StageLayout {
  return layout?.v === 1 ? { ...layout } : { v: 1 };
}

function slotBox(layout: StageLayout, slot: keyof StageLayout): StageBox {
  const raw = layout[slot];
  return parseStageBox(raw) || { ...STYLE_ONLY_BOX };
}

export function getStageSlotFontFamily(
  layout: StageLayout | null | undefined,
  slot: 'prompt' | 'explanation' | 'meta' | 'textHint',
): string | undefined {
  const box = layout?.[slot];
  if (!box || typeof box !== 'object') return undefined;
  return parseStageFontFamily((box as StageBox).fontFamily);
}

export function getStageAnswerFontFamily(
  layout: StageLayout | null | undefined,
  optionId: string,
): string | undefined {
  const box = layout?.answers?.[optionId];
  return box ? parseStageFontFamily(box.fontFamily) : undefined;
}

export function setStageSlotFontFamily(
  layout: StageLayout | null | undefined,
  slot: 'prompt' | 'explanation' | 'meta' | 'textHint',
  fontFamily: string | undefined,
): StageLayout {
  const next = baseLayout(layout);
  const prev = slotBox(next, slot);
  const parsed = parseStageFontFamily(fontFamily);
  const merged = { ...prev, fontFamily: parsed };
  if (!parsed) delete merged.fontFamily;
  const box = parseStageBox(merged);
  if (box) (next as Record<string, unknown>)[slot] = box;
  return next;
}

export function setStageAnswerFontFamily(
  layout: StageLayout | null | undefined,
  optionId: string,
  fontFamily: string | undefined,
): StageLayout {
  const next = baseLayout(layout);
  const prev = next.answers?.[optionId] || { ...STYLE_ONLY_BOX };
  const parsed = parseStageFontFamily(fontFamily);
  const merged = { ...prev, fontFamily: parsed };
  if (!parsed) delete merged.fontFamily;
  const box = parseStageBox(merged);
  if (!box) return next;
  next.answers = { ...(next.answers || {}), [optionId]: box };
  return next;
}

export function getStageCorrectTextFontFamily(
  layout: StageLayout | null | undefined,
  index: number,
): string | undefined {
  const box = layout?.correctTexts?.[String(index)];
  return box ? parseStageFontFamily(box.fontFamily) : undefined;
}

export function setStageCorrectTextFontFamily(
  layout: StageLayout | null | undefined,
  index: number,
  fontFamily: string | undefined,
): StageLayout {
  const next = baseLayout(layout);
  const key = String(index);
  const prev = next.correctTexts?.[key] || { ...STYLE_ONLY_BOX };
  const parsed = parseStageFontFamily(fontFamily);
  const merged = { ...prev, fontFamily: parsed };
  if (!parsed) delete merged.fontFamily;
  const box = parseStageBox(merged);
  if (!box) return next;
  next.correctTexts = { ...(next.correctTexts || {}), [key]: box };
  return next;
}
