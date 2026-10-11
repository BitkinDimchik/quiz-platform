import 'dotenv/config';

export type CorsOriginSetting = true | string[];

/**
 * Origin для HTTP CORS и Socket.IO.
 * Пусто или `*` — любой origin (локальная LAN-игра с телефонов).
 * Иначе список через запятую.
 */
export function corsOriginFromEnv(): CorsOriginSetting {
  const raw = process.env.CORS_ORIGINS;
  if (!raw?.trim() || raw.trim() === '*') {
    return true;
  }
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
