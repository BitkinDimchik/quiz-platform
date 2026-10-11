import { createHash, randomBytes, randomInt, timingSafeEqual } from 'crypto';

const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function sha256(raw: string, salt: Buffer): Buffer {
  return createHash('sha256').update(salt).update(raw, 'utf8').digest();
}

export function randomSalt(len = 16): Buffer {
  return randomBytes(len);
}

export function randomTokenUrlSafe(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function randomRoomCode(length = 8): string {
  let s = '';
  for (let i = 0; i < length; i += 1) {
    s += ROOM_CHARS[randomInt(ROOM_CHARS.length)];
  }
  return s;
}

export function playerTokenSalt(sessionId: string): Buffer {
  return Buffer.from(sessionId, 'utf8');
}

/**
 * Сравнение дайджестов без утечки по времени.
 * При разной длине возвращает false (timingSafeEqual в Node бросает).
 */
export function timingSafeEqualDigest(a: Buffer | Uint8Array, b: Buffer | Uint8Array): boolean {
  const left = Buffer.isBuffer(a) ? a : Buffer.from(a);
  const right = Buffer.isBuffer(b) ? b : Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
