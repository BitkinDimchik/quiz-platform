import { io, Socket } from 'socket.io-client';

export type HostAuth = { sessionId: string; hostSecret: string };
export type PlayerAuth = { sessionId: string; reconnectToken: string };

export function connectGameSocket(auth: HostAuth | PlayerAuth): Socket {
  return io('/game', {
    transports: ['websocket'],
    auth,
  });
}
