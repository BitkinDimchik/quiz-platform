/** Фон раунда; если не задан — заставка квиза. */
export function resolveRoundBackground(
  roundBackground: unknown,
  quizBackground: unknown,
): string | null {
  const round = typeof roundBackground === 'string' ? roundBackground.trim() : '';
  if (round) return round;
  const quiz = typeof quizBackground === 'string' ? quizBackground.trim() : '';
  return quiz || null;
}
