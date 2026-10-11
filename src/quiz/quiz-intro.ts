/** Титульный экран квиза: название, описание и длительность показа. */
export function quizIntroPresentation(quiz: {
  title?: string | null;
  description?: string | null;
  meta?: Record<string, unknown> | null;
} | null | undefined): { title: string; description: string; introSec: number } {
  const title = (quiz?.title || '').trim() || 'Квиз';
  const description = typeof quiz?.description === 'string' ? quiz.description.trim() : '';
  const raw = quiz?.meta ? (quiz.meta as { introSec?: unknown }).introSec : undefined;
  const n = typeof raw === 'number' ? raw : parseInt(String(raw ?? ''), 10);
  const introSec = Number.isFinite(n) && n > 0 ? Math.floor(n) : 6;
  return { title, description, introSec };
}
