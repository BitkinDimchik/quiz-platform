import { isStageIntroPhase } from '../stage-intro-phase';
import { applyStageLayout, parseStageLayout, type StageLayout } from './stage-layout';
import { setStageMeta, type StageDom } from './stage-render';
import type { QuestionView } from './types';

function paintLayout(layout: StageLayout | null, lockKey?: string) {
  const el = document.querySelector('#stageCard .stage-center');
  if (el instanceof HTMLElement) applyStageLayout(el, layout, lockKey);
}

/** Active host layout for the current solo/live phase. */
export function stageLayoutForPhase(
  phase: string | null | undefined,
  q: QuestionView | null | undefined,
): StageLayout | null {
  if (!q) return null;
  if (phase === 'quiz_intro') return parseStageLayout(q.quizStageLayout ?? null);
  if (phase === 'round_intro') return parseStageLayout(q.roundStageLayout ?? null);
  return parseStageLayout(q.stageLayout ?? null);
}

export function introLayoutLockKey(
  phase: string | null | undefined,
  q: QuestionView | null | undefined,
  quizId?: string,
): string {
  if (phase === 'quiz_intro') return `quiz:${quizId || q?.quizId || 'intro'}`;
  if (phase === 'round_intro') return `round:${q?.roundId || 'intro'}`;
  return String(q?.id || '');
}

/** Paint quiz/round intro title + meta and apply saved layout. */
export function paintIntroStage(
  dom: Pick<StageDom, 'stageQuestion' | 'stageMeta' | 'stageAnswers'>,
  opts: {
    phase: string;
    q: QuestionView;
    quizId?: string;
    editing?: boolean;
    paintWorking?: () => void;
  },
): void {
  if (!isStageIntroPhase(opts.phase)) return;
  const isQuizIntro = opts.phase === 'quiz_intro';
  const qEl = dom.stageQuestion;
  if (qEl) {
    try {
      qEl.classList.add('stage-title');
      qEl.classList.remove('stage-q');
    } catch {
      /* ignore */
    }
    qEl.textContent = isQuizIntro ? opts.q.quizTitle || 'Квиз' : opts.q.roundTitle || 'Раунд';
    qEl.setAttribute('data-stage-key', 'prompt');
  }
  const meta = isQuizIntro
    ? null
    : (opts.q.roundDescription || '').trim() || 'Правила раунда';
  setStageMeta(dom.stageMeta, meta);
  if (dom.stageMeta && !meta) dom.stageMeta.removeAttribute('data-stage-key');
  if (dom.stageAnswers) dom.stageAnswers.innerHTML = '';
  if (opts.editing && opts.paintWorking) opts.paintWorking();
  else {
    paintLayout(
      stageLayoutForPhase(opts.phase, opts.q),
      introLayoutLockKey(opts.phase, opts.q, opts.quizId),
    );
  }
}
