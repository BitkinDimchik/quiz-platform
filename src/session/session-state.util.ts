import { GameSession } from '../entities/game-session.entity';
import { SessionPlayer } from '../entities/session-player.entity';

/** Публичное состояние игры (без секретов хоста). */
export function toPublicSessionState(session: GameSession) {
  return {
    id: session.id,
    quizId: session.quizId,
    quizRevisionId: session.quizRevisionId,
    roomCode: session.roomCode,
    phase: session.phase,
    advanceMode: session.advanceMode,
    answerRevealMode: session.answerRevealMode,
    currentRoundId: session.currentRoundId,
    currentQuestionId: session.currentQuestionId,
    phaseDeadlineAt: session.phaseDeadlineAt,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    version: session.version,
    vipPlayerId: session.vipPlayerId,
    isPaused: session.isPaused,
    pausedRemainingMs: session.pausedRemainingMs,
  };
}

/** Публичные поля игрока после reconnect. */
export function toPublicPlayerState(player: SessionPlayer, vipPlayerId: string | null = null) {
  return {
    id: player.id,
    displayName: player.displayName,
    avatarUrl: player.avatarUrl,
    score: player.score,
    joinedAt: player.joinedAt,
    lastSeenAt: player.lastSeenAt,
    disconnectedAt: player.disconnectedAt,
    isConnected: player.isConnected,
    isVip: vipPlayerId != null && player.id === vipPlayerId,
  };
}
