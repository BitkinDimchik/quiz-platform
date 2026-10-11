import { describe, expect, it } from 'vitest';
import { applyStageLayoutToDraft, builderQuestionLayoutIds, draftLayoutPatchTargets } from './apply-stage-layout';
import { defaultQuestion, defaultRound } from './defaults';
import type { QuizDraft } from './types';

function layout(promptX: number, optionId: string) {
  return {
    v: 1 as const,
    prompt: { x: promptX, y: 10, w: 80, h: 20 },
    answers: { [optionId]: { x: 10, y: 70, w: 30, h: 20 } },
  };
}

function draftWith(questions: ReturnType<typeof defaultQuestion>[]): QuizDraft {
  const round = defaultRound();
  round.questions = questions;
  return { title: 'T', description: '', background: null, finalMusic: null, rounds: [round] };
}

describe('applyStageLayoutToDraft', () => {
  it('writes layout onto the active question only', () => {
    const a = defaultQuestion();
    const b = defaultQuestion();
    a.options[0].id = 'optA';
    b.options[0].id = 'optB';
    const draft = draftWith([a, b]);
    const next = layout(12, 'optA');
    applyStageLayoutToDraft(draft, { roundIdx: 0, questionIdx: 0, layout: next, scope: 'this' });
    expect(draft.rounds[0].questions[0].stageLayout?.prompt?.x).toBe(12);
    expect(draft.rounds[0].questions[1].stageLayout).toBeUndefined();
  });

  it('copies layout onto every question and remaps answer ids', () => {
    const a = defaultQuestion();
    const b = defaultQuestion();
    a.options[0].id = 'optA';
    b.options[0].id = 'optB';
    const draft = draftWith([a, b]);
    applyStageLayoutToDraft(draft, {
      roundIdx: 0,
      questionIdx: 0,
      layout: layout(15, 'optA'),
      scope: 'all',
    });
    expect(draft.rounds[0].questions[0].stageLayout?.answers?.optA).toBeTruthy();
    expect(draft.rounds[0].questions[1].stageLayout?.prompt?.x).toBe(15);
    expect(draft.rounds[0].questions[1].stageLayout?.answers?.optB).toBeTruthy();
    expect(draft.rounds[0].questions[1].stageLayout?.answers?.optA).toBeUndefined();
  });

  it('clears layout when reset passes null', () => {
    const a = defaultQuestion();
    a.stageLayout = layout(8, a.options[0].id);
    const draft = draftWith([a]);
    applyStageLayoutToDraft(draft, { roundIdx: 0, questionIdx: 0, layout: null, scope: 'this' });
    expect(draft.rounds[0].questions[0].stageLayout).toBeNull();
  });
});

describe('draftLayoutPatchTargets', () => {
  it('skips questions without a server uuid', () => {
    const local = defaultQuestion();
    const saved = defaultQuestion();
    saved.id = '11111111-1111-4111-8111-111111111111';
    saved.stageLayout = layout(4, saved.options[0].id);
    const draft = draftWith([local, saved]);
    expect(draftLayoutPatchTargets(draft, { roundIdx: 0, questionIdx: 0, scope: 'this' })).toEqual([]);
    expect(draftLayoutPatchTargets(draft, { roundIdx: 0, questionIdx: 1, scope: 'this' })).toEqual([
      { kind: 'question', id: saved.id, layout: saved.stageLayout },
    ]);
  });

  it('lists every saved question for all-screens', () => {
    const a = defaultQuestion();
    const b = defaultQuestion();
    a.id = '11111111-1111-4111-8111-111111111111';
    b.id = '22222222-2222-4222-8222-222222222222';
    const draft = draftWith([a, b]);
    expect(draftLayoutPatchTargets(draft, { roundIdx: 0, questionIdx: 0, scope: 'all' }).map((t) => t.id)).toEqual([
      a.id,
      b.id,
    ]);
  });

  it('targets quiz and round intro layouts', () => {
    const q = defaultQuestion();
    const draft = draftWith([q]);
    draft.stageLayout = layout(1, q.options[0].id);
    draft.rounds[0].id = '33333333-3333-4333-8333-333333333333';
    draft.rounds[0].stageLayout = layout(2, q.options[0].id);
    expect(
      draftLayoutPatchTargets(draft, {
        roundIdx: 0,
        questionIdx: 0,
        scope: 'this',
        screen: 'quiz_intro',
        quizId: '44444444-4444-4444-8444-444444444444',
      }),
    ).toEqual([
      {
        kind: 'quiz',
        id: '44444444-4444-4444-8444-444444444444',
        layout: draft.stageLayout,
      },
    ]);
    expect(
      draftLayoutPatchTargets(draft, {
        roundIdx: 0,
        questionIdx: 0,
        scope: 'this',
        screen: 'round_intro',
      }),
    ).toEqual([{ kind: 'round', id: draft.rounds[0].id, layout: draft.rounds[0].stageLayout }]);
  });
});

describe('builderQuestionLayoutIds', () => {
  it('collects option ids', () => {
    const q = defaultQuestion();
    q.options[0].id = 'a1';
    q.options[1].id = 'a2';
    expect(builderQuestionLayoutIds(q).optionIds).toEqual(['a1', 'a2']);
  });
});
