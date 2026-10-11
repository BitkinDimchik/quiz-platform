import {
  copyStageLayoutToTarget,
  isQuestionUuid,
  type StageLayout,
  type StageLayoutIdSets,
} from '../host/stage-layout';
import type { LayoutScreen } from '../host/useStageLayoutEditor';
import type { BuilderQuestion, QuizDraft } from './types';

export type DraftLayoutScope = 'this' | 'all';

export function builderQuestionLayoutIds(q: BuilderQuestion): StageLayoutIdSets {
  return {
    optionIds: (q.options || []).map((o) => String(o.id || '').trim()).filter(Boolean),
    matchLeftIds: (q.matchLeft || []).map((o) => String(o.id || '').trim()).filter(Boolean),
    matchRightIds: (q.matchRight || []).map((o) => String(o.id || '').trim()).filter(Boolean),
  };
}

export function applyStageLayoutToDraft(
  draft: QuizDraft,
  opts: {
    roundIdx: number;
    questionIdx: number;
    layout: StageLayout | null;
    scope: DraftLayoutScope;
    screen?: LayoutScreen;
  },
): void {
  const screen = opts.screen || 'question';
  if (screen === 'quiz_intro') {
    draft.stageLayout = opts.layout;
    return;
  }
  if (screen === 'round_intro') {
    if (opts.scope === 'all') {
      for (const round of draft.rounds) round.stageLayout = opts.layout;
      return;
    }
    const round = draft.rounds[opts.roundIdx];
    if (round) round.stageLayout = opts.layout;
    return;
  }
  const source = draft.rounds[opts.roundIdx]?.questions[opts.questionIdx];
  if (!source) return;
  if (opts.scope !== 'all') {
    source.stageLayout = opts.layout;
    return;
  }
  const from = builderQuestionLayoutIds(source);
  for (const round of draft.rounds) {
    for (const q of round.questions || []) {
      q.stageLayout =
        q === source ? opts.layout : copyStageLayoutToTarget(opts.layout, from, builderQuestionLayoutIds(q));
    }
  }
}

export function draftLayoutPatchTargets(
  draft: QuizDraft,
  opts: {
    roundIdx: number;
    questionIdx: number;
    scope: DraftLayoutScope;
    screen?: LayoutScreen;
    quizId?: string | null;
  },
): { kind: 'question' | 'quiz' | 'round'; id: string; layout: StageLayout | null }[] {
  const out: { kind: 'question' | 'quiz' | 'round'; id: string; layout: StageLayout | null }[] = [];
  const screen = opts.screen || 'question';
  if (screen === 'quiz_intro') {
    if (isQuestionUuid(opts.quizId)) {
      out.push({ kind: 'quiz', id: opts.quizId!, layout: draft.stageLayout ?? null });
    }
    return out;
  }
  if (screen === 'round_intro') {
    const visit = (round: QuizDraft['rounds'][number] | undefined) => {
      if (!round || !isQuestionUuid(round.id)) return;
      out.push({ kind: 'round', id: round.id, layout: round.stageLayout ?? null });
    };
    if (opts.scope === 'all') {
      for (const round of draft.rounds) visit(round);
      return out;
    }
    visit(draft.rounds[opts.roundIdx]);
    return out;
  }
  const visitQ = (q: BuilderQuestion | undefined) => {
    if (!q || !isQuestionUuid(q.id)) return;
    out.push({ kind: 'question', id: q.id, layout: q.stageLayout ?? null });
  };
  if (opts.scope === 'all') {
    for (const round of draft.rounds) {
      for (const q of round.questions || []) visitQ(q);
    }
    return out;
  }
  visitQ(draft.rounds[opts.roundIdx]?.questions[opts.questionIdx]);
  return out;
}
