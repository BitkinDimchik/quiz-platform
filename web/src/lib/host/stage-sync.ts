import type { HostSession } from './types';

/** Stage content identity: pause/VIP/version must not retrigger question_view. */
export function hostStageIdentity(
  s: {
    phase?: string | null;
    currentQuestionId?: string | null;
    endedAt?: string | null;
  } | null | undefined,
): string {
  if (!s) return '';
  return `${s.phase || ''}|${s.currentQuestionId || ''}|${s.endedAt || ''}`;
}

export function hostUiSessionChanged(
  prev: HostSession | null | undefined,
  next: HostSession | null | undefined,
): boolean {
  if (prev == null && next == null) return false;
  if (prev == null || next == null) return true;
  return (
    prev.phase !== next.phase ||
    (prev.endedAt || null) !== (next.endedAt || null) ||
    !!prev.isPaused !== !!next.isPaused ||
    (prev.vipPlayerId || null) !== (next.vipPlayerId || null) ||
    (prev.roomCode || null) !== (next.roomCode || null) ||
    (prev.quizId || null) !== (next.quizId || null)
  );
}

export function shouldRefreshHostRoomUi(s: HostSession | null | undefined): boolean {
  if (!s) return true;
  return !s.phase || s.phase === 'lobby' || !!s.endedAt;
}
