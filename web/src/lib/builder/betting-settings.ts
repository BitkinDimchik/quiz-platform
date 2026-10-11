import type { BettingMode } from './types';

/** Настройки ставки, общие для раунда и вопроса. */
export type BettingSettingsValue = {
  bettingMode?: BettingMode;
  bettingMinStake?: number | null;
  bettingMaxStake?: number | null;
  bettingPresets?: number[];
  /** Сколько секунд даётся игрокам на ставку; пусто — значение по умолчанию. */
  bettingSec?: number | null;
};

export const MAX_BETTING_PRESETS = 10;
export const MAX_STAKE_VALUE = 1_000_000;
/** Должно совпадать с DEFAULT_BETTING_SEC на сервере. */
export const DEFAULT_BETTING_SEC = 20;
export const MAX_BETTING_SEC = 600;

/** Положительный размер ставки в очках; иначе null («не задано»). */
export function parseStakeLimit(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : parseInt(String(raw ?? '').trim(), 10);
  if (!Number.isFinite(n)) return null;
  const v = Math.floor(n);
  return v > 0 && v <= MAX_STAKE_VALUE ? v : null;
}

/** Время на ставку в секундах; null — «не задано». */
export function parseBettingSec(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : parseInt(String(raw ?? '').trim(), 10);
  if (!Number.isFinite(n)) return null;
  const v = Math.floor(n);
  return v > 0 ? Math.min(v, MAX_BETTING_SEC) : null;
}

export function normalizeStakePresets(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const uniq = new Set<number>();
  for (const item of raw) {
    const n = parseStakeLimit(item);
    if (n != null) uniq.add(n);
  }
  return [...uniq].sort((a, b) => a - b).slice(0, MAX_BETTING_PRESETS);
}

/** «10, 25 50» → [10, 25, 50] */
export function parseStakePresetsText(text: string): number[] {
  return normalizeStakePresets(String(text ?? '').split(/[^\d]+/));
}

export function formatStakePresetsText(presets: number[] | undefined): string {
  return normalizeStakePresets(presets).join(', ');
}

export function bettingModeOf(src: BettingSettingsValue): BettingMode {
  return src.bettingMode === 'presets' ? 'presets' : 'free';
}

/** Поля для meta раунда/вопроса при сохранении квиза. */
export function bettingMetaFields(src: BettingSettingsValue): Record<string, unknown> {
  const mode = bettingModeOf(src);
  const sec = parseBettingSec(src.bettingSec);
  const out: Record<string, unknown> = { bettingMode: mode };
  if (sec != null) out.bettingSec = sec;

  const presets = normalizeStakePresets(src.bettingPresets);
  // Без вариантов режим бессмысленен — падаем на свободный ввод.
  if (mode === 'presets' && presets.length) {
    out.bettingPresets = presets;
    return out;
  }
  out.bettingMode = 'free';
  const min = parseStakeLimit(src.bettingMinStake);
  const max = parseStakeLimit(src.bettingMaxStake);
  if (min != null) out.bettingMinStake = max != null ? Math.min(min, max) : min;
  if (max != null) out.bettingMaxStake = max;
  return out;
}

/** Разбор полей из GET /api/quizzes/:id. */
export function bettingFromServer(src: Record<string, unknown>): Required<BettingSettingsValue> {
  const presets = normalizeStakePresets(src.bettingPresets);
  const mode: BettingMode = src.bettingMode === 'presets' && presets.length ? 'presets' : 'free';
  return {
    bettingMode: mode,
    bettingMinStake: mode === 'free' ? parseStakeLimit(src.bettingMinStake) : null,
    bettingMaxStake: mode === 'free' ? parseStakeLimit(src.bettingMaxStake) : null,
    bettingPresets: mode === 'presets' ? presets : [],
    bettingSec: parseBettingSec(src.bettingSec),
  };
}

export function resetBettingSettings(target: BettingSettingsValue): void {
  target.bettingMode = 'free';
  target.bettingMinStake = null;
  target.bettingMaxStake = null;
  target.bettingPresets = [];
  target.bettingSec = null;
}
