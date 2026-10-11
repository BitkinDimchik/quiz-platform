/** Как игрок выбирает размер ставки: свободный ввод или готовые варианты. */
export type BettingMode = 'free' | 'presets';

export type BettingOptions = {
  mode: BettingMode;
  /** Минимальная ставка в очках для свободного ввода; 0 — без явного минимума. */
  minStake: number;
  /** Максимальная ставка в очках; null — ограничена только счётом игрока. */
  maxStake: number | null;
  /** Готовые варианты ставки в очках (только для mode='presets'). */
  presets: number[];
  /** Сколько секунд даётся на ставку; 0 — значение по умолчанию. */
  stakeSec: number;
  /** Доля счёта из старых квизов; учитывается как дополнительный потолок. */
  maxFraction: string | null;
};

export type StakeBounds = {
  /** Минимальная ненулевая ставка, доступная игроку. */
  min: number;
  /** Максимальная ставка, доступная игроку. */
  max: number;
  /** Доступные варианты (пусто при свободном вводе). */
  presets: number[];
  /** Может ли игрок поставить хоть что-то кроме нуля. */
  canBet: boolean;
};

export const MAX_BETTING_PRESETS = 10;
export const MAX_STAKE_VALUE = 1_000_000;
/** Сколько секунд даётся на ставку, если автор не задал своё значение. */
export const DEFAULT_BETTING_SEC = 20;
export const MAX_BETTING_SEC = 600;

function toInt(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : parseInt(String(raw ?? '').trim(), 10);
  if (!Number.isFinite(n)) return null;
  return Math.floor(n);
}

/** Положительный лимит ставки в очках; всё остальное — null («не задано»). */
export function parseStakeLimit(raw: unknown): number | null {
  const n = toInt(raw);
  if (n == null || n <= 0 || n > MAX_STAKE_VALUE) return null;
  return n;
}

/** Время на ставку в секундах; 0 — «не задано». */
export function parseBettingSec(raw: unknown): number {
  const n = toInt(raw);
  if (n == null || n <= 0) return 0;
  return Math.min(n, MAX_BETTING_SEC);
}

export function parseStakePresets(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const uniq = new Set<number>();
  for (const item of raw) {
    const n = parseStakeLimit(item);
    if (n != null) uniq.add(n);
  }
  return [...uniq].sort((a, b) => a - b).slice(0, MAX_BETTING_PRESETS);
}

/**
 * Настройки ставки из meta раунда или вопроса.
 * `maxFractionRaw` — устаревшая колонка rounds.betting_max_fraction.
 */
export function parseBettingOptions(
  meta: Record<string, unknown> | null | undefined,
  maxFractionRaw?: unknown,
): BettingOptions {
  const m = meta ?? {};
  const presets = parseStakePresets((m as { bettingPresets?: unknown }).bettingPresets);
  const mode: BettingMode =
    (m as { bettingMode?: unknown }).bettingMode === 'presets' && presets.length ? 'presets' : 'free';
  const maxStake = parseStakeLimit((m as { bettingMaxStake?: unknown }).bettingMaxStake);
  const minRaw = parseStakeLimit((m as { bettingMinStake?: unknown }).bettingMinStake) ?? 0;
  const fracRaw = maxFractionRaw ?? (m as { bettingMaxFraction?: unknown }).bettingMaxFraction;
  const maxFraction = typeof fracRaw === 'string' && fracRaw.trim() ? fracRaw.trim() : null;
  return {
    mode,
    minStake: mode === 'free' ? Math.min(minRaw, maxStake ?? minRaw) : 0,
    maxStake: mode === 'free' ? maxStake : null,
    presets: mode === 'presets' ? presets : [],
    stakeSec: parseBettingSec((m as { bettingSec?: unknown }).bettingSec),
    maxFraction,
  };
}

/**
 * Длительность фазы, в которой игроки делают ставку: она не должна быть
 * короче, чем время, отведённое автором на саму ставку.
 */
export function bettingPhaseSec(baseSec: number, o: BettingOptions | null | undefined): number {
  if (!o) return baseSec;
  const wanted = o.stakeSec > 0 ? o.stakeSec : DEFAULT_BETTING_SEC;
  return Math.max(baseSec, wanted);
}

/** Обратное к parseBettingOptions: поля для meta раунда/вопроса. */
export function bettingOptionsToMeta(o: BettingOptions): Record<string, unknown> {
  const out: Record<string, unknown> = { bettingMode: o.mode };
  if (o.stakeSec > 0) out.bettingSec = o.stakeSec;
  if (o.mode === 'presets') {
    out.bettingPresets = o.presets;
    return out;
  }
  if (o.minStake > 0) out.bettingMinStake = o.minStake;
  if (o.maxStake != null) out.bettingMaxStake = o.maxStake;
  return out;
}

/** Плоские поля настроек ставки для билдера и паков. */
export function bettingOptionsPayload(o: BettingOptions): {
  bettingMode: BettingMode;
  bettingMinStake: number | null;
  bettingMaxStake: number | null;
  bettingPresets: number[];
  bettingSec: number | null;
} {
  return {
    bettingMode: o.mode,
    bettingMinStake: o.minStake > 0 ? o.minStake : null,
    bettingMaxStake: o.maxStake,
    bettingPresets: o.presets,
    bettingSec: o.stakeSec > 0 ? o.stakeSec : null,
  };
}

export function defaultBettingOptions(): BettingOptions {
  return { mode: 'free', minStake: 0, maxStake: null, presets: [], stakeSec: 0, maxFraction: null };
}

/**
 * Пределы ставки из настроек квиза.
 * Заданный максимум/варианты не режутся текущим счётом: ставка — цена вопроса.
 * Пустой максимум или старая доля счёта по-прежнему опираются на score.
 */
export function resolveStakeBounds(score: number, o: BettingOptions): StakeBounds {
  const scoreCap = Math.max(0, Math.floor(Number.isFinite(score) ? score : 0));
  let hardMax = o.maxStake ?? scoreCap;
  if (o.maxFraction) {
    const frac = Number(o.maxFraction);
    if (Number.isFinite(frac) && frac >= 0 && frac < 1) {
      hardMax = Math.min(hardMax, Math.floor(scoreCap * frac));
    }
  }

  if (o.mode === 'presets') {
    const presets = o.maxFraction ? o.presets.filter((v) => v <= hardMax) : o.presets;
    return {
      min: presets.length ? presets[0] : 0,
      max: presets.length ? presets[presets.length - 1] : 0,
      presets,
      canBet: presets.length > 0,
    };
  }

  const min = Math.max(1, o.minStake);
  return { min, max: hardMax, presets: [], canBet: hardMax >= min };
}

/** Ставка 0 («играю без ставки») допустима всегда. */
export function isStakeAllowed(score: number, stake: number, o: BettingOptions): boolean {
  if (!Number.isInteger(stake) || stake < 0) return false;
  if (stake === 0) return true;
  const bounds = resolveStakeBounds(score, o);
  if (!bounds.canBet) return false;
  if (o.mode === 'presets') return bounds.presets.includes(stake);
  return stake >= bounds.min && stake <= bounds.max;
}
