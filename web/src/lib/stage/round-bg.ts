/** Фон раунда; если не задан — заставка квиза. */
export function resolveStageBackground(
  roundBackground?: string | null,
  quizBackground?: string | null,
): string | null {
  const round = (roundBackground || '').trim();
  if (round) return round;
  const quiz = (quizBackground || '').trim();
  return quiz || null;
}

/** Убрать полноэкранный фон раунда (вернуть градиент body из CSS). */
export function clearViewportRoundBg() {
  const el = document.querySelector('#viewportRoundBg') as HTMLElement | null;
  if (el) el.style.backgroundImage = '';
  document.body.classList.remove('viewport-round-active');
}

/**
 * Фон раунда на весь экран: одна картинка без градиента поверх.
 * Пустой url — сброс.
 */
export function applyViewportRoundBg(url: string | null | undefined) {
  clearViewportRoundBg();
  if (!url || !String(url).trim()) return;
  const u = String(url).trim();
  const el = document.querySelector('#viewportRoundBg') as HTMLElement | null;
  if (!el) return;
  if (u.indexOf('gradient:') === 0) {
    el.style.backgroundImage = u.slice('gradient:'.length);
  } else {
    el.style.backgroundImage = `url(${JSON.stringify(u)})`;
  }
  document.body.classList.add('viewport-round-active');
}
