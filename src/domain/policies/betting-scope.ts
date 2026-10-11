import { SessionPhase } from '../../common/enums';
import type { BettingOptions } from './betting-options';
import { parseBettingOptions } from './betting-options';

export type BettingScope =
  | { kind: 'round'; roundId: string; options: BettingOptions }
  | { kind: 'question'; questionId: string; options: BettingOptions }
  | { kind: 'none' };

export function resolveBettingScope(
  round: {
    id: string;
    bettingEnabled: boolean;
    bettingMaxFraction: string | null;
    meta?: Record<string, unknown> | null;
  },
  questionMeta: Record<string, unknown> | null | undefined,
  questionId: string,
): BettingScope {
  if (round.bettingEnabled) {
    return {
      kind: 'round',
      roundId: round.id,
      options: parseBettingOptions(round.meta, round.bettingMaxFraction ?? null),
    };
  }
  const meta = questionMeta ?? {};
  if (meta.bettingEnabled === true) {
    return { kind: 'question', questionId, options: parseBettingOptions(meta) };
  }
  return { kind: 'none' };
}

/** Настройки ставки раунда или null, если ставки на раунд выключены. */
export function roundBettingOptions(round: {
  id: string;
  bettingEnabled: boolean;
  bettingMaxFraction: string | null;
  meta?: Record<string, unknown> | null;
}): BettingOptions | null {
  if (!round.bettingEnabled) return null;
  return parseBettingOptions(round.meta, round.bettingMaxFraction ?? null);
}

export function bettingPhaseForScope(scope: BettingScope): SessionPhase | null {
  if (scope.kind === 'round') return SessionPhase.RoundIntro;
  if (scope.kind === 'question') return SessionPhase.QuestionRead;
  return null;
}

export function bettingOptionsForScope(scope: BettingScope): BettingOptions | null {
  if (scope.kind === 'none') return null;
  return scope.options;
}

export function bettingMaxFractionForScope(scope: BettingScope): string | null {
  if (scope.kind === 'none') return null;
  return scope.options.maxFraction;
}
