import type { BuilderQuestion } from './types';

export function questionCreateBody(q: BuilderQuestion): {
  explanationText: string | null;
  explanationImageUrl: string | null;
  explanationVideoUrl: string | null;
} {
  const text = (q.explanation?.text || '').trim();
  const image = (q.explanation?.image || '').trim();
  const video = (q.explanation?.video || '').trim();
  return {
    explanationText: text || null,
    explanationImageUrl: image || null,
    explanationVideoUrl: video || null,
  };
}
