/** Как игрок выбирает размер ставки: свободный ввод или заложенные варианты. */
export type BettingMode = 'free' | 'presets';

export type BettingConfig = {
  mode: BettingMode;
  /** Минимальная ставка в очках при свободном вводе; 0 — без явного минимума. */
  minStake: number;
  /** Максимальная ставка в очках; null — только в пределах счёта. */
  maxStake: number | null;
  /** Заложенные варианты ставки в очках. */
  presets: number[];
  /** Доля счёта из старых квизов; дополнительный потолок. */
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

export type BettingScope = 'round' | 'question' | null;

function positiveInt(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : parseInt(String(raw ?? '').trim(), 10);
  if (!Number.isFinite(n)) return null;
  const v = Math.floor(n);
  return v > 0 ? v : null;
}

export function defaultBettingConfig(): BettingConfig {
  return { mode: 'free', minStake: 0, maxStake: null, presets: [], maxFraction: null };
}

/** Настройки ставки из question_view. */
export function bettingConfigFromQuestion(
  q: {
    bettingMode?: string | null;
    bettingMinStake?: number | null;
    bettingMaxStake?: number | null;
    bettingPresets?: number[] | null;
    bettingMaxFraction?: string | null;
  } | null,
): BettingConfig {
  if (!q) return defaultBettingConfig();
  const presetsRaw = Array.isArray(q.bettingPresets) ? q.bettingPresets : [];
  const presets = [...new Set(presetsRaw.map(positiveInt).filter((v): v is number => v != null))].sort(
    (a, b) => a - b,
  );
  const mode: BettingMode = q.bettingMode === 'presets' && presets.length ? 'presets' : 'free';
  const maxStake = positiveInt(q.bettingMaxStake);
  const minStake = positiveInt(q.bettingMinStake) ?? 0;
  return {
    mode,
    minStake: mode === 'free' ? Math.min(minStake, maxStake ?? minStake) : 0,
    maxStake: mode === 'free' ? maxStake : null,
    presets: mode === 'presets' ? presets : [],
    maxFraction:
      typeof q.bettingMaxFraction === 'string' && q.bettingMaxFraction.trim()
        ? q.bettingMaxFraction.trim()
        : null,
  };
}

/** Максимум ставки: лимит квиза, иначе счёт (и старая доля, если есть). */
export function computeMaxStake(score: number, cfg: BettingConfig): number {
  const scoreCap = Math.max(0, Math.floor(Number.isFinite(score) ? score : 0));
  let max = cfg.maxStake ?? scoreCap;
  if (cfg.maxFraction) {
    const frac = Number(cfg.maxFraction);
    if (Number.isFinite(frac) && frac >= 0 && frac < 1) max = Math.min(max, Math.floor(scoreCap * frac));
  }
  return max;
}

/** Что доступно игроку: пределы автора, без обрезки вариантов по текущему счёту. */
export function resolveStakeBounds(score: number, cfg: BettingConfig): StakeBounds {
  const hardMax = computeMaxStake(score, cfg);
  if (cfg.mode === 'presets') {
    const presets = cfg.maxFraction ? cfg.presets.filter((v) => v <= hardMax) : cfg.presets;
    return {
      min: presets.length ? presets[0] : 0,
      max: presets.length ? presets[presets.length - 1] : 0,
      presets,
      canBet: presets.length > 0,
    };
  }
  const min = Math.max(1, cfg.minStake);
  return { min, max: hardMax, presets: [], canBet: hardMax >= min };
}

/** Ставка 0 («играю без ставки») допустима всегда. */
export function isStakeAllowed(stake: number, bounds: StakeBounds, mode: BettingMode): boolean {
  if (!Number.isInteger(stake) || stake < 0) return false;
  if (stake === 0) return true;
  if (!bounds.canBet) return false;
  if (mode === 'presets') return bounds.presets.includes(stake);
  return stake >= bounds.min && stake <= bounds.max;
}

export function isBettingUiPhase(phase: string | null, scope: BettingScope): boolean {
  if (!scope || !phase) return false;
  if (scope === 'round') return phase === 'round_intro';
  if (scope === 'question') return phase === 'question_read';
  return false;
}

/** Подпись с границами ставки под панелью. */
export function formatStakeLimits(bounds: StakeBounds, mode: BettingMode): string | null {
  if (!bounds.canBet) return null;
  if (mode === 'presets') return 'Выберите один из вариантов ставки';
  if (bounds.min > 1) return `Ставка от ${bounds.min} до ${bounds.max} очков`;
  return `Ставка от 1 до ${bounds.max} очков`;
}
