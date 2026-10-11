/** Question media that players must hear/watch before the answer timer starts. */

export function questionHasListenMedia(
  q: { audioUrl?: string | null; videoUrl?: string | null } | null | undefined,
): boolean {
  if (!q) return false;
  return !!(String(q.audioUrl || '').trim() || String(q.videoUrl || '').trim());
}

/** Explanation video shown on answer reveal / round summary. */
export function questionHasExplanationVideo(
  q: { explanationVideoUrl?: string | null } | null | undefined,
): boolean {
  if (!q) return false;
  return !!String(q.explanationVideoUrl || '').trim();
}
