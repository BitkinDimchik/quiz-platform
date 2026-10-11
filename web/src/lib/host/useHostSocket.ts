import QRCode from 'qrcode';
import { apiFetch } from '../api';
import { connectGameSocket } from '../game-socket';
import { toast } from '../toast';
import type { Socket } from 'socket.io-client';
import type { HostPlayer, HostSession } from './types';
import { computePublicOrigin, playerJoinUrl, playerMenuUrl } from './public-origin';
import { shouldRefreshHostRoomUi } from './stage-sync';

export type HostSocketCallbacks = {
  onWsStatus: (connected: boolean) => void;
  onConnect?: () => void;
  onSession: (session: HostSession | null) => void;
  onPlayers: (players: HostPlayer[]) => void;
  onDisputeOpen: (open: boolean) => void;
  onSessionAbandoned: (reason: string) => void;
  onSyncStage: () => void;
  onRoomUi: () => void;
  /** After session_ready — refresh lobby player list from REST. */
  onSessionReady: () => void;
  onStageVideoToggle?: () => void;
};

export function emitAck(
  socket: Socket,
  event: string,
  body: object,
  timeoutMs: number,
): Promise<{ err?: Error; res?: unknown }> {
  return new Promise((resolve) => {
    try {
      socket.timeout(timeoutMs).emit(event, body, (err: Error | null, res: unknown) => {
        resolve({ err: err || undefined, res });
      });
    } catch (e) {
      resolve({ err: e as Error });
    }
  });
}

export async function renderQrToEl(el: HTMLElement | null, url: string) {
  if (!el) return;
  el.innerHTML = '';
  if (!url) return;
  try {
    const dataUrl = await QRCode.toDataURL(url, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 280,
    });
    const img = document.createElement('img');
    img.src = dataUrl;
    img.alt = 'QR';
    el.appendChild(img);
  } catch (e) {
    console.warn('QR render failed', e);
  }
}

export async function applyLobbyLinks(opts: {
  roomCode: string;
  setRoomCodeText: (code: string) => void;
  setPlayerUrl: (url: string) => void;
  qrEl: HTMLElement | null;
  getCurrentRoomCode: () => string | null;
}) {
  opts.setRoomCodeText(opts.roomCode);
  opts.setPlayerUrl('…');
  const origin = await computePublicOrigin();
  if (!opts.getCurrentRoomCode()) return;
  const join = playerJoinUrl(origin, opts.getCurrentRoomCode()!);
  opts.setPlayerUrl(join);
  await renderQrToEl(opts.qrEl, playerMenuUrl(origin));
}

export function createHostSocket(
  sessionId: string,
  hostSecret: string,
  cb: HostSocketCallbacks,
): Socket {
  const socket = connectGameSocket({ sessionId, hostSecret });

  socket.on('connect', () => {
    cb.onWsStatus(true);
    cb.onConnect?.();
  });
  socket.on('disconnect', () => cb.onWsStatus(false));

  socket.on('session_ready', (payload: { session?: HostSession }) => {
    if (payload?.session) {
      cb.onSession(payload.session);
      cb.onRoomUi();
      cb.onSessionReady();
      cb.onSyncStage();
      if (payload.session.phase === 'answer_reveal') {
        refreshHostDisputeState(socket, payload.session, false, cb.onDisputeOpen);
      } else {
        cb.onDisputeOpen(false);
      }
    }
  });

  socket.on('players_update', (payload: { players?: HostPlayer[] }) => {
    cb.onPlayers(payload?.players || []);
  });

  socket.on('session_update', (s: HostSession) => {
    cb.onSession(s);
    if (!s || s.phase !== 'answer_reveal') cb.onDisputeOpen(false);
    if (shouldRefreshHostRoomUi(s)) cb.onRoomUi();
    cb.onSyncStage();
    if (s?.phase === 'answer_reveal') {
      refreshHostDisputeState(socket, s, false, cb.onDisputeOpen);
    }
  });

  socket.on(
    'dispute_update',
    (payload: { kind?: string; dispute?: { status?: string } | null }) => {
      try {
        if (!payload) return;
        if (payload.kind === 'closed' || !payload.dispute) {
          cb.onDisputeOpen(false);
          return;
        }
        cb.onDisputeOpen(payload.dispute.status === 'open');
      } catch {
        /* ignore */
      }
    },
  );

  socket.on('stage_video_control', (payload: { action?: string }) => {
    if (payload?.action === 'toggle') cb.onStageVideoToggle?.();
  });

  socket.on('session_abandoned', (payload: { reason?: string }) => {
    const r = payload?.reason ? String(payload.reason) : '';
    cb.onSessionAbandoned(r);
    toast(r === 'host_closed' ? 'Комната закрыта' : 'Комната закрыта');
  });

  socket.on('connect_error', (err: Error) => {
    toast((err && err.message) || 'ws connect error');
  });

  return socket;
}

export function refreshHostDisputeState(
  socket: Socket | null,
  session: HostSession | null,
  soloOn: boolean,
  setDispute: (open: boolean) => void,
) {
  if (soloOn || !socket || !session || session.phase !== 'answer_reveal') {
    setDispute(false);
    return;
  }
  socket.timeout(5000).emit(
    'dispute_state',
    {},
    (err: Error | null, res: { ok?: boolean; dispute?: { status?: string } }) => {
      if (err || !res || !res.ok) return;
      setDispute(!!(res.dispute && res.dispute.status === 'open'));
    },
  );
}

export async function loadHostSummary(sessionId: string, hostSecret: string) {
  return apiFetch<{ session: HostSession }>(
    `/api/session/${encodeURIComponent(sessionId)}/host-summary`,
    { headers: { 'X-Host-Secret': hostSecret } },
  );
}

export async function reopenSession(sessionId: string, hostSecret: string) {
  return apiFetch<{ session: HostSession }>(
    `/api/session/${encodeURIComponent(sessionId)}/reopen`,
    {
      method: 'POST',
      headers: { 'X-Host-Secret': hostSecret },
    },
  );
}

export async function loadPlayers(sessionId: string) {
  return apiFetch<{ players: HostPlayer[] }>(
    `/api/session/${encodeURIComponent(sessionId)}/players`,
    { headers: {} },
  );
}
