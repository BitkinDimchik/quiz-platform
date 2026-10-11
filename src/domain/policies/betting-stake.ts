import type { Repository } from 'typeorm';
import { SessionRoundStake } from '../../entities/session-round-stake.entity';
import { SessionQuestionStake } from '../../entities/session-question-stake.entity';
import type { BettingScope } from './betting-scope';

export async function loadBettingStakeAmount(
  scope: BettingScope,
  roundStakes: Repository<SessionRoundStake>,
  questionStakes: Repository<SessionQuestionStake>,
  sessionId: string,
  playerId: string,
): Promise<number> {
  if (scope.kind === 'round') {
    const row = await roundStakes.findOne({
      where: { sessionId, playerId, roundId: scope.roundId },
    });
    return row?.stake ?? 0;
  }
  if (scope.kind === 'question') {
    const row = await questionStakes.findOne({
      where: { sessionId, playerId, questionId: scope.questionId },
    });
    return row?.stake ?? 0;
  }
  return 0;
}
