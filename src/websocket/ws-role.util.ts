import { WsException } from '@nestjs/websockets';
import type { Socket } from 'socket.io';

/** Сокеты `/game` должны пройти handshake (см. GameGateway.afterInit). */
export function requireSessionMember(client: Socket): void {
  const role = client.data.role;
  const sid = client.data.sessionId;
  if ((role !== 'host' && role !== 'player') || !sid) {
    throw new WsException({ code: 'UNAUTHORIZED', message: 'not authenticated' });
  }
}

export function requireHost(client: Socket): void {
  requireSessionMember(client);
  if (client.data.role !== 'host') {
    throw new WsException({ code: 'FORBIDDEN', message: 'host only' });
  }
}

export function requirePlayer(client: Socket): void {
  requireSessionMember(client);
  if (client.data.role !== 'player' || !client.data.playerId) {
    throw new WsException({ code: 'FORBIDDEN', message: 'player only' });
  }
}

export function socketSessionId(client: Socket): string {
  requireSessionMember(client);
  return client.data.sessionId;
}
