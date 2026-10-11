/** Safe login redirect target. Rejects open redirects (//host, ://, /\). */
export function sanitizeNext(next: string | null | undefined, fallback = '/quizzes'): string {
  if (!next) return fallback;
  if (!next.startsWith('/')) return fallback;
  if (next.startsWith('//')) return fallback;
  if (next.includes('://')) return fallback;
  if (next[1] === '\\') return fallback;
  return next;
}
