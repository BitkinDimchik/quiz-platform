import { emptyQuizDraft, emptyUi, normalizeOptionShape, STORAGE_KEY } from './defaults';
import type { BuilderUi, QuizDraft, StoredBuilderDraft } from './types';

export function saveDraftToStorage(quizDraft: QuizDraft, ui: BuilderUi): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ quizDraft, ui } satisfies StoredBuilderDraft));
}

export function clearDraftStorage(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function loadDraftFromStorage(): { quizDraft: QuizDraft; ui: BuilderUi } | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw) as Partial<StoredBuilderDraft>;
    if (!obj?.quizDraft?.rounds) return null;
    const quizDraft = obj.quizDraft;
    if (typeof quizDraft.description !== 'string') quizDraft.description = '';
    const ui = { ...emptyUi(), ...(obj.ui || {}) };
    if (ui.step < 1 || ui.step > 4) ui.step = 1;
    (quizDraft.rounds || []).forEach((r) => {
      (r.questions || []).forEach((q) => {
        (q.options || []).forEach((o) => normalizeOptionShape(o));
      });
    });
    return { quizDraft, ui };
  } catch {
    return null;
  }
}

export function patchStoredDraftStageLayout(
  questionId: string,
  layout: import('../host/stage-layout').StageLayout | null,
): void {
  const loaded = loadDraftFromStorage();
  if (!loaded) return;
  let hit = false;
  for (const round of loaded.quizDraft.rounds || []) {
    for (const q of round.questions || []) {
      if (q.id === questionId) {
        q.stageLayout = layout;
        hit = true;
      }
    }
  }
  if (hit) saveDraftToStorage(loaded.quizDraft, loaded.ui);
}

export function resetEmptyDraft(): { quizDraft: QuizDraft; ui: BuilderUi } {
  clearDraftStorage();
  return { quizDraft: emptyQuizDraft(), ui: emptyUi() };
}
