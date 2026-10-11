/** Question media that players must hear/watch before the answer timer starts. */

export function questionHasListenMedia(
  q:
    | {
        audioUrl?: string | null;
        videoUrl?: string | null;
        media?: { audio?: string | null; video?: string | null } | null;
      }
    | null
    | undefined,
): boolean {
  if (!q) return false;
  const audio = String(q.audioUrl || q.media?.audio || '').trim();
  const video = String(q.videoUrl || q.media?.video || '').trim();
  return !!(audio || video);
}
