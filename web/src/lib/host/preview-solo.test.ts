import { describe, expect, it } from 'vitest';
import { defaultQuestion, defaultRound } from '../builder/defaults';
import type { PreviewHostPayload, QuizDraft } from '../builder/types';
import {
  ensurePreviewQuiz,
  previewAdvance,
  previewCanSkip,
  previewRestart,
  previewSoloFromPayload,
  resolvePreviewStartPhase,
} from './preview-solo';
import { soloBuildQuestionView, soloCurrentQuestion } from './solo';

function payload(
  over: Partial<QuizDraft> & {
    activeRoundIdx?: number;
    activeQuestionIdx?: number;
    startPhase?: PreviewHostPayload['startPhase'];
  } = {},
): PreviewHostPayload {
  const r1 = defaultRound();
  r1.title = 'Раунд 1';
  r1.defaultTimer = 20;
  r1.defaultReadSec = 4;
  r1.summarySec = 2;
  const q1 = defaultQuestion();
  q1.text = 'Первый';
  q1.options[0].label = 'A';
  q1.options[1].label = 'B';
  q1.correct = [q1.options[0].id];
  const q2 = defaultQuestion();
  q2.text = 'Второй';
  q2.type = 'hidden';
  q2.hiddenAnswer = 'text';
  q2.correct = ['кот'];
  q2.media = { image: '/img.png', video: '', audio: '' };
  q2.imageHideRect = { x: 10, y: 20, w: 30, h: 40 };
  q2.useRoundTimer = true;
  r1.questions = [q1, q2];
  const quiz: QuizDraft = {
    title: 'T',
    description: '',
    background: null,
    finalMusic: null,
    rounds: [r1],
    ...over,
  };
  return {
    type: 'quiz_preview_host',
    quiz,
    activeRoundIdx: over.activeRoundIdx ?? 0,
    activeQuestionIdx: over.activeQuestionIdx ?? 0,
    startPhase: over.startPhase,
  };
}

describe('resolvePreviewStartPhase', () => {
  it('maps builder tabs to screens', () => {
    expect(resolvePreviewStartPhase(1)).toBe('quiz_intro');
    expect(resolvePreviewStartPhase(2)).toBe('quiz_intro');
    expect(resolvePreviewStartPhase(3)).toBe('round_intro');
    expect(resolvePreviewStartPhase(4)).toBe('question_read');
  });
});

describe('ensurePreviewQuiz', () => {
  it('adds a stub round/question when missing', () => {
    const out = ensurePreviewQuiz(
      { title: 'T', description: '', background: null, finalMusic: null, rounds: [] },
      0,
      0,
    );
    expect(out.quiz.rounds).toHaveLength(1);
    expect(out.quiz.rounds[0].questions).toHaveLength(1);
  });
});

describe('previewSoloFromPayload', () => {
  it('keeps only the active question and respects startPhase', () => {
    const solo = previewSoloFromPayload(payload({ activeQuestionIdx: 1, startPhase: 'quiz_intro' }));
    expect(solo).toBeTruthy();
    expect(solo!.payload?.rounds).toHaveLength(1);
    expect(solo!.payload?.rounds?.[0].questions).toHaveLength(1);
    expect(soloCurrentQuestion(solo!)?.text).toBe('Второй');
    expect(solo!.phase).toBe('quiz_intro');
  });

  it('starts on round intro when requested', () => {
    const solo = previewSoloFromPayload(payload({ startPhase: 'round_intro' }));
    expect(solo!.phase).toBe('round_intro');
  });

  it('starts on question read when requested', () => {
    const solo = previewSoloFromPayload(payload({ startPhase: 'question_read' }));
    expect(solo!.phase).toBe('question_read');
  });

  it('bakes round timer into the solo question', () => {
    const solo = previewSoloFromPayload(payload({ activeQuestionIdx: 0 }));
    const q = soloCurrentQuestion(solo!);
    expect(q?.timer).toBe(20);
    expect(q?.readSec).toBe(4);
  });

  it('works when there are no questions yet', () => {
    const empty = defaultRound();
    empty.questions = [];
    const solo = previewSoloFromPayload({
      type: 'quiz_preview_host',
      quiz: { title: 'T', description: '', background: null, finalMusic: null, rounds: [empty] },
      activeRoundIdx: 0,
      activeQuestionIdx: 0,
      startPhase: 'quiz_intro',
    });
    expect(solo).toBeTruthy();
    expect(solo!.phase).toBe('quiz_intro');
  });

  it('uses the quiz splash when the round has no background', () => {
    const r1 = defaultRound();
    r1.background = null;
    r1.questions = [defaultQuestion()];
    const solo = previewSoloFromPayload({
      type: 'quiz_preview_host',
      quiz: { title: 'T', description: '', background: '/quiz/cover.jpg', finalMusic: null, rounds: [r1] },
      activeRoundIdx: 0,
      activeQuestionIdx: 0,
    });
    expect(soloBuildQuestionView(solo!)?.roundBackgroundUrl).toBe('/quiz/cover.jpg');
  });
});

describe('previewAdvance', () => {
  it('plays intro → read → question → reveal and then stays', () => {
    const solo = previewSoloFromPayload(payload({ activeQuestionIdx: 1, startPhase: 'quiz_intro' }))!;
    expect(previewCanSkip(solo)).toBe(true);
    expect(previewAdvance(solo)).toBe(true);
    expect(solo.phase).toBe('round_intro');
    expect(previewAdvance(solo)).toBe(true);
    expect(solo.phase).toBe('question_read');
    expect(previewAdvance(solo)).toBe(true);
    expect(solo.phase).toBe('question');
    expect(previewAdvance(solo)).toBe(true);
    expect(solo.phase).toBe('answer_reveal');
    expect(previewCanSkip(solo)).toBe(false);
    expect(previewAdvance(solo)).toBe(false);
    expect(soloCurrentQuestion(solo)?.text).toBe('Второй');
  });

  it('restart returns to the requested start phase', () => {
    const solo = previewSoloFromPayload(payload({ activeQuestionIdx: 1, startPhase: 'round_intro' }))!;
    previewAdvance(solo);
    previewAdvance(solo);
    previewRestart(solo, 'round_intro');
    expect(solo.phase).toBe('round_intro');
    expect(soloCurrentQuestion(solo)?.text).toBe('Второй');
  });

  it('holds the answer timer when the preview question has audio', () => {
    const q2 = defaultQuestion();
    q2.text = 'Музыка';
    q2.media = { image: '', video: '', audio: 'https://x/a.mp3' };
    q2.timer = 15;
    q2.useRoundTimer = false;
    const r1 = defaultRound();
    r1.questions = [q2];
    const solo = previewSoloFromPayload({
      type: 'quiz_preview_host',
      quiz: { title: 'T', description: '', background: null, finalMusic: null, rounds: [r1] },
      activeRoundIdx: 0,
      activeQuestionIdx: 0,
      startPhase: 'question_read',
    })!;
    expect(previewAdvance(solo)).toBe(true);
    expect(solo.phase).toBe('question');
    expect(solo.phaseDeadlineAt).toBeNull();
  });
});
