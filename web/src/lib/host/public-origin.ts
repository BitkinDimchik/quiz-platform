import { apiFetch } from '../api';

let publicOriginCache: string | null = null;
let publicOriginPromise: Promise<string> | null = null;

function isLocalhostHost(h: string): boolean {
  const s = String(h || '').trim().toLowerCase();
  return s === 'localhost' || s === '127.0.0.1' || s === '::1';
}

/** LAN-friendly origin for QR when host is localhost (GET /ip). */
export function computePublicOrigin(): Promise<string> {
  if (publicOriginCache) return Promise.resolve(publicOriginCache);
  if (!isLocalhostHost(location.hostname)) {
    publicOriginCache = location.origin;
    return Promise.resolve(publicOriginCache);
  }
  if (publicOriginPromise) return publicOriginPromise;
  publicOriginPromise = apiFetch<{ ips?: string[] }>('/ip', { headers: {} })
    .then((res) => {
      const ips = res?.ips || [];
      const ip = ips[0] ? String(ips[0]) : '';
      if (!ip) return location.origin;
      const port = location.port ? `:${location.port}` : '';
      return `${location.protocol}//${ip}${port}`;
    })
    .catch(() => location.origin)
    .then((origin) => {
      publicOriginCache = origin;
      publicOriginPromise = null;
      return origin;
    });
  return publicOriginPromise;
}

/** Copy/share link with room code — canonical React path. */
export function playerJoinUrl(origin: string, roomCode: string): string {
  const o = String(origin || location.origin);
  return roomCode ? `${o}/player?code=${encodeURIComponent(roomCode)}` : '';
}

/** QR points at player page; code is entered from host screen. */
export function playerMenuUrl(origin: string): string {
  return `${String(origin || location.origin)}/player`;
}
