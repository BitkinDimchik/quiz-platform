export const PLAYER_SESSION_ID = 'PLAYER_SESSION_ID';
export const PLAYER_RECONNECT_TOKEN = 'PLAYER_RECONNECT_TOKEN';
export const PLAYER_DISPLAY_NAME = 'PLAYER_DISPLAY_NAME';
export const PLAYER_ROOM_CODE = 'PLAYER_ROOM_CODE';

export type PlayerIdentity = {
  sessionId: string;
  reconnectToken: string;
  displayName: string;
  roomCode: string;
};

export function normRoomCode(c: string | null | undefined): string {
  return String(c || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

export function clearPlayerIdentity() {
  localStorage.removeItem(PLAYER_SESSION_ID);
  localStorage.removeItem(PLAYER_RECONNECT_TOKEN);
  localStorage.removeItem(PLAYER_DISPLAY_NAME);
  localStorage.removeItem(PLAYER_ROOM_CODE);
}

export function readPlayerIdentity(): Partial<PlayerIdentity> {
  return {
    sessionId: localStorage.getItem(PLAYER_SESSION_ID) || undefined,
    reconnectToken: localStorage.getItem(PLAYER_RECONNECT_TOKEN) || undefined,
    displayName: localStorage.getItem(PLAYER_DISPLAY_NAME) || undefined,
    roomCode: localStorage.getItem(PLAYER_ROOM_CODE) || undefined,
  };
}

export function savePlayerIdentity(parts: {
  sessionId: string;
  reconnectToken: string;
  displayName: string;
  roomCode: string;
}) {
  localStorage.setItem(PLAYER_SESSION_ID, parts.sessionId);
  localStorage.setItem(PLAYER_RECONNECT_TOKEN, parts.reconnectToken);
  localStorage.setItem(PLAYER_DISPLAY_NAME, parts.displayName);
  localStorage.setItem(PLAYER_ROOM_CODE, normRoomCode(parts.roomCode));
}

export function hasSavedReconnectTokens(): boolean {
  return !!(localStorage.getItem(PLAYER_SESSION_ID) && localStorage.getItem(PLAYER_RECONNECT_TOKEN));
}
