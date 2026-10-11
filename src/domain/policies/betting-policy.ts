import { DomainError } from '../../common/domain-error';
import type { BettingOptions } from './betting-options';
import { resolveStakeBounds } from './betting-options';

/**
 * Ставка 0 означает «играю без ставки»: вопрос идёт по стандартной цене
 * и очки не могут уйти в минус, поэтому ноль разрешён всегда.
 */
export function validateStake(
  currentScore: number,
  stake: number,
  options: BettingOptions,
): void {
  if (!Number.isInteger(stake) || stake < 0) {
    throw DomainError.validation('stake must be a non-negative integer');
  }
  if (stake === 0) return;

  const bounds = resolveStakeBounds(currentScore, options);
  if (!bounds.canBet) throw DomainError.validation('stake not available for current score');

  if (options.mode === 'presets') {
    if (!bounds.presets.includes(stake)) {
      throw DomainError.validation('stake is not an allowed option');
    }
    return;
  }
  if (stake < bounds.min) throw DomainError.validation('stake below min');
  if (stake > bounds.max) throw DomainError.validation('stake exceeds max');
}
