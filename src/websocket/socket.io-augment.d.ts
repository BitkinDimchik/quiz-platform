import 'socket.io';

declare module 'socket.io' {
  interface SocketData {
    role: 'host' | 'player';
    sessionId: string;
    playerId?: string;
  }
}
