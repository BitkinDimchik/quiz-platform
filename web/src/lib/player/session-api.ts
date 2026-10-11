import { apiFetch } from '../api';
import type { ActiveSessionResponse } from './types';
import { normRoomCode } from './storage';

/** Verify saved room still maps to the same session. Network errors → true (retry via WS). */
export async function verifySavedRoomIsStillSameSession(
  savedRoomCode: string | null | undefined,
  savedSessionId: string | null | undefined,
): Promise<boolean> {
  const rc = normRoomCode(savedRoomCode || '');
  if (!rc || !savedSessionId) return true;
  try {
    const res = await apiFetch<ActiveSessionResponse>(`/api/session/active/${encodeURIComponent(rc)}`, {
      headers: {},
    });
    if (!res || !res.active || !res.sessionId) return false;
    return String(res.sessionId) === String(savedSessionId);
  } catch {
    return true;
  }
}
