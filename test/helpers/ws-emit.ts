import type { Socket as IoSocket } from 'socket.io-client';

/** Ack с socket.io-client + .timeout(): (err, response). */
export function emitAck<TRes>(socket: IoSocket, event: string, data?: object): Promise<TRes> {
  return new Promise((resolve, reject) => {
    socket.timeout(8000).emit(event, data ?? {}, (err: unknown, res: TRes) => {
      if (err) reject(err);
      else resolve(res);
    });
  });
}
