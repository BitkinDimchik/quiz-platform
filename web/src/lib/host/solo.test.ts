import { describe, expect, it } from 'vitest';
import {
  createInitialSoloState,
  soloAdvance,
  soloAllQuestions,
  soloAnswerRevealMode,
  soloBack,
  soloBuildQuestionView,
  soloCanBack,
  soloDrivesStageTimer,
  soloIsRevealPhase,
  soloQuestionExplanation,
  soloQuestionLayoutIds,
  soloRevealDurationMs,
  soloHoldQuestionTimer,
  soloResumeAfterPause,
  soloStartQuestionAnswerTimer,
  soloStartRevealTimer,
} from './solo';
import type { SoloQuestion } from './types';

describe('soloQuestionExplanation', () => {
  it('prefers nested builder explanation', () => {
    expect(
      soloQuestionExplanation({
        explanation: { text: '  why  ', image: ' data:image/gif;base64,xx ' },
        explanationText: 'flat',
      }),
    ).toEqual({ text: 'why', image: 'data:image/gif;base64,xx', video: null });
  });

  it('falls back to flat fields', () => {
    expect(
      soloQuestionExplanation({
        explanationText: ' flat why ',
        explanationImageUrl: 'https://x/e.png',
      }),
    ).toEqual({ text: 'flat why', image: 'https://x/e.png', video: null });
  });

  it('empty when missing', () => {
    expect(soloQuestionExplanation({})).toEqual({ text: null, image: null, video: null });
  });
});

describe('soloAllQuestions', () => {
  it('flattens questions across rounds', () => {
    const solo = createInitialSoloState();
    solo.payload = {
      rounds: [
        { questions: [{ id: 'a', text: 'A' }] },
        { questions: [{ id: 'b', text: 'B' }, { id: 'c', text: 'C' }] },
      ],
    };
    expect(soloAllQuestions(solo).map((q) => q.id)).toEqual(['a', 'b', 'c']);
  });

  it('lists option ids for layout copy', () => {
    expect(
      soloQuestionLayoutIds({
        options: [{ id: 'o1' }, { id: 'o2' }],
        matchLeft: [{ id: 'L1' }],
        matchRight: [{ id: 'R1' }],
      }),
    ).toEqual({
      optionIds: ['o1', 'o2'],
      matchLeftIds: ['L1'],
      matchRightIds: ['R1'],
    });
  });
});

describe('soloIsRevealPhase', () => {
  it('is true only for answer_reveal and round_summary', () => {
    expect(soloIsRevealPhase('answer_reveal')).toBe(true);
    expect(soloIsRevealPhase('round_summary')).toBe(true);
    expect(soloIsRevealPhase('question')).toBe(false);
    expect(soloIsRevealPhase('question_read')).toBe(false);
    expect(soloIsRevealPhase('leaderboard')).toBe(false);
  });
});

describe('soloDrivesStageTimer', () => {
  it('stops driving the stage ring on leaderboard after the only question', () => {
    expect(soloDrivesStageTimer('answer_reveal')).toBe(true);
    expect(soloDrivesStageTimer('round_summary')).toBe(true);
    expect(soloDrivesStageTimer('question')).toBe(true);
    expect(soloDrivesStageTimer('leaderboard')).toBe(false);
    expect(soloDrivesStageTimer('finished')).toBe(false);
  });
});

describe('soloRevealDurationMs', () => {
  it('defaults to 2 seconds', () => {
    expect(soloRevealDurationMs(null)).toBe(2000);
    expect(soloRevealDurationMs({ questions: [] })).toBe(2000);
  });

  it('uses round summarySec', () => {
    expect(soloRevealDurationMs({ summarySec: 4, questions: [] })).toBe(4000);
  });
});

describe('soloAnswerRevealMode', () => {
  it('defaults to per_question', () => {
    expect(soloAnswerRevealMode(null)).toBe('per_question');
    expect(soloAnswerRevealMode({ questions: [] })).toBe('per_question');
  });

  it('reads end_of_round from round config', () => {
    expect(soloAnswerRevealMode({ answerRevealMode: 'end_of_round', questions: [] })).toBe(
      'end_of_round',
    );
  });
});

describe('soloAdvance end_of_round', () => {
  it('skips per-question reveal and opens round summary after the last question', () => {
    const solo = createInitialSoloState();
    solo.payload = {
      rounds: [
        {
          answerRevealMode: 'end_of_round',
          summarySec: 3,
          questions: [
            { type: 'single', text: 'Q1', timer: 10 },
            { type: 'single', text: 'Q2', timer: 10 },
          ],
        },
      ],
    };
    solo.phase = 'question';
    solo.questionIdx = 1;
    soloAdvance(solo);
    expect(solo.phase).toBe('round_summary');
    expect(solo.questionIdx).toBe(0);
  });

  it('goes to the next question without reveal mid-round', () => {
    const solo = createInitialSoloState();
    solo.payload = {
      rounds: [
        {
          answerRevealMode: 'end_of_round',
          questions: [
            { type: 'single', text: 'Q1', timer: 10 },
            { type: 'single', text: 'Q2', timer: 10 },
          ],
        },
      ],
    };
    solo.phase = 'question';
    solo.questionIdx = 0;
    soloAdvance(solo);
    expect(solo.phase).toBe('question_read');
    expect(solo.questionIdx).toBe(1);
  });
});

function drainSoloPhases(solo: ReturnType<typeof createInitialSoloState>, max = 20): string[] {
  const phases: string[] = [];
  for (let i = 0; i < max; i++) {
    const prev = solo.phase;
    soloAdvance(solo);
    if (solo.phase === prev && solo.phase !== 'finished') break;
    phases.push(solo.phase);
    if (solo.phase === 'finished') break;
  }
  return phases;
}

describe('soloAdvance answer_reveal', () => {
  it('uses round summarySec for reveal deadline', () => {
    const solo = createInitialSoloState();
    solo.payload = {
      rounds: [
        {
          summarySec: 4,
          questions: [{ type: 'single', text: 'Q', timer: 10 }],
        },
      ],
    };
    solo.phase = 'question';
    soloAdvance(solo);
    expect(solo.phase).toBe('answer_reveal');
    const rem = new Date(solo.phaseDeadlineAt!).getTime() - Date.now();
    expect(rem).toBeGreaterThan(3500);
    expect(rem).toBeLessThanOrEqual(4000);
  });

  it('holds reveal deadline when explanation video is present', () => {
    const solo = createInitialSoloState();
    solo.payload = {
      rounds: [
        {
          summarySec: 4,
          questions: [
            {
              type: 'single',
              text: 'Q',
              timer: 10,
              explanation: { text: null, image: null, video: '/uploads/v/expl.mp4' },
            },
          ],
        },
      ],
    };
    solo.phase = 'question';
    soloAdvance(solo);
    expect(solo.phase).toBe('answer_reveal');
    expect(solo.phaseDeadlineAt).toBeNull();
    soloStartRevealTimer(solo);
    const rem = new Date(solo.phaseDeadlineAt!).getTime() - Date.now();
    expect(rem).toBeGreaterThan(3500);
    expect(rem).toBeLessThanOrEqual(4000);
  });

  it('shows a one-question round answer only once, with explanation still on the view', () => {
    const solo = createInitialSoloState();
    solo.payload = {
      rounds: [
        {
          summarySec: 3,
          leaderboardSec: 6,
          questions: [
            {
              type: 'single',
              text: 'Q',
              timer: 10,
              explanation: { text: 'Потому что', image: null },
            },
          ],
        },
      ],
    };
    solo.phase = 'round_intro';
    const phases = drainSoloPhases(solo);
    expect(phases.filter((p) => p === 'answer_reveal')).toHaveLength(1);
    expect(phases.filter((p) => p === 'round_summary')).toHaveLength(0);
    expect(phases).toEqual(['question_read', 'question', 'answer_reveal', 'finished']);
  });

  it('after the only question reveal goes to final results, not a second reveal', () => {
    const solo = createInitialSoloState();
    solo.payload = {
      rounds: [
        {
          questions: [
            { type: 'single', text: 'Q', timer: 10, explanation: { text: 'why', image: null } },
          ],
        },
      ],
    };
    solo.phase = 'answer_reveal';
    solo.questionIdx = 0;
    soloAdvance(solo);
    expect(solo.phase).toBe('finished');
    expect(soloIsRevealPhase(solo.phase)).toBe(false);
    expect(soloDrivesStageTimer(solo.phase)).toBe(false);
  });

  it('does not insert round_summary after per-question reveal', () => {
    const solo = createInitialSoloState();
    solo.payload = {
      rounds: [
        {
          questions: [
            { type: 'single', text: 'Q1', timer: 10, explanation: { text: 'why', image: null } },
            { type: 'single', text: 'Q2', timer: 10 },
          ],
        },
      ],
    };
    solo.phase = 'question';
    solo.questionIdx = 0;
    soloAdvance(solo);
    expect(solo.phase).toBe('answer_reveal');
    soloAdvance(solo);
    expect(solo.phase).toBe('question_read');
    expect(solo.questionIdx).toBe(1);
    soloAdvance(solo);
    expect(solo.phase).toBe('question');
    soloAdvance(solo);
    expect(solo.phase).toBe('answer_reveal');
    soloAdvance(solo);
    expect(solo.phase).toBe('finished');
  });

  it('shows a round leaderboard only when another round follows', () => {
    const solo = createInitialSoloState();
    solo.payload = {
      rounds: [
        { questions: [{ type: 'single', text: 'A', timer: 10 }] },
        { questions: [{ type: 'single', text: 'B', timer: 10 }] },
      ],
    };
    solo.phase = 'answer_reveal';
    solo.roundIdx = 0;
    solo.questionIdx = 0;
    soloAdvance(solo);
    expect(solo.phase).toBe('leaderboard');
    soloAdvance(solo);
    expect(solo.phase).toBe('round_intro');
    expect(solo.roundIdx).toBe(1);
    solo.phase = 'answer_reveal';
    soloAdvance(solo);
    expect(solo.phase).toBe('finished');
  });
});

describe('soloBuildQuestionView', () => {
  it('copies explanation onto the stage question', () => {
    const solo = createInitialSoloState();
    solo.payload = {
      rounds: [
        {
          title: 'R',
          questions: [
            {
              type: 'single',
              text: 'Q',
              explanation: { text: 'Потому что', image: null },
            } satisfies SoloQuestion,
          ],
        },
      ],
    };
    const qv = soloBuildQuestionView(solo);
    expect(qv?.explanationText).toBe('Потому что');
    expect(qv?.explanationImageUrl).toBeNull();
  });

  it('uses the quiz splash when the round has no background', () => {
    const solo = createInitialSoloState();
    solo.payload = {
      background: '/quiz/cover.jpg',
      rounds: [
        {
          title: 'R',
          background: null,
          questions: [{ type: 'single', text: 'Q' } satisfies SoloQuestion],
        },
      ],
    };
    expect(soloBuildQuestionView(solo)?.roundBackgroundUrl).toBe('/quiz/cover.jpg');
  });

  it('keeps the round background over the quiz splash', () => {
    const solo = createInitialSoloState();
    solo.payload = {
      background: '/quiz/cover.jpg',
      rounds: [
        {
          title: 'R',
          background: '/rounds/a.jpg',
          questions: [{ type: 'single', text: 'Q' } satisfies SoloQuestion],
        },
      ],
    };
    expect(soloBuildQuestionView(solo)?.roundBackgroundUrl).toBe('/rounds/a.jpg');
  });

  it('uses server uuid and stageLayout when present', () => {
    const solo = createInitialSoloState();
    const id = '11111111-1111-4111-8111-111111111111';
    solo.payload = {
      rounds: [
        {
          title: 'R',
          questions: [
            {
              id,
              type: 'single',
              text: 'Q',
              stageLayout: { v: 1, prompt: { x: 10, y: 10, w: 80, h: 20 } },
            } satisfies SoloQuestion,
          ],
        },
      ],
    };
    const qv = soloBuildQuestionView(solo);
    expect(qv?.id).toBe(id);
    expect(qv?.stageLayout?.prompt?.x).toBe(10);
  });

  it('copies imageHideRect and maps hidden+text to text_input', () => {
    const solo = createInitialSoloState();
    solo.payload = {
      rounds: [
        {
          title: 'R',
          questions: [
            {
              type: 'hidden',
              hiddenAnswer: 'text',
              text: 'Что скрыто?',
              correct: ['кот'],
              imageHideRect: { x: 12, y: 8, w: 40, h: 30 },
            } satisfies SoloQuestion,
          ],
        },
      ],
    };
    const qv = soloBuildQuestionView(solo);
    expect(qv?.type).toBe('text_input');
    expect(qv?.correctTexts).toEqual(['кот']);
    expect(qv?.imageHideRect).toEqual({ x: 12, y: 8, w: 40, h: 30 });
    expect(qv?.imageHideRects).toEqual([{ x: 12, y: 8, w: 40, h: 30 }]);
  });
});

describe('soloBack', () => {
  function twoQuestionQuiz(mode?: 'per_question' | 'end_of_round') {
    const solo = createInitialSoloState();
    solo.on = true;
    solo.payload = {
      rounds: [
        {
          introSec: 6,
          summarySec: 3,
          leaderboardSec: 5,
          answerRevealMode: mode,
          questions: [
            { type: 'single', text: 'Q1', timer: 10, readSec: 2 },
            { type: 'single', text: 'Q2', timer: 10, readSec: 2 },
          ],
        },
      ],
    };
    return solo;
  }

  it('does nothing on the first quiz intro', () => {
    const solo = twoQuestionQuiz();
    solo.phase = 'quiz_intro';
    expect(soloCanBack(solo)).toBe(false);
    soloBack(solo);
    expect(solo.phase).toBe('quiz_intro');
    expect(solo.roundIdx).toBe(0);
  });

  it('goes from first round intro back to quiz intro', () => {
    const solo = twoQuestionQuiz();
    solo.phase = 'round_intro';
    expect(soloCanBack(solo)).toBe(true);
    soloBack(solo);
    expect(solo.phase).toBe('quiz_intro');
    expect(solo.roundIdx).toBe(0);
  });

  it('walks back question_read → intro, question → read, reveal → question', () => {
    const solo = twoQuestionQuiz();
    solo.phase = 'question_read';
    soloBack(solo);
    expect(solo.phase).toBe('round_intro');

    solo.phase = 'question';
    soloBack(solo);
    expect(solo.phase).toBe('question_read');

    solo.phase = 'answer_reveal';
    soloBack(solo);
    expect(solo.phase).toBe('question');
    expect(solo.phaseDeadlineAt).toBeTruthy();
  });

  it('from the second question read returns to the previous reveal', () => {
    const solo = twoQuestionQuiz();
    solo.phase = 'question_read';
    solo.questionIdx = 1;
    soloBack(solo);
    expect(solo.phase).toBe('answer_reveal');
    expect(solo.questionIdx).toBe(0);
  });

  it('in end_of_round mode returns to the previous question, not a reveal', () => {
    const solo = twoQuestionQuiz('end_of_round');
    solo.phase = 'question_read';
    solo.questionIdx = 1;
    soloBack(solo);
    expect(solo.phase).toBe('question');
    expect(solo.questionIdx).toBe(0);
  });

  it('from leaderboard returns to the last question reveal', () => {
    const solo = twoQuestionQuiz();
    solo.phase = 'leaderboard';
    soloBack(solo);
    expect(solo.phase).toBe('answer_reveal');
    expect(solo.questionIdx).toBe(1);
  });

  it('from finished returns to the last question reveal', () => {
    const solo = twoQuestionQuiz();
    solo.phase = 'finished';
    soloBack(solo);
    expect(solo.phase).toBe('answer_reveal');
    expect(solo.roundIdx).toBe(0);
    expect(solo.questionIdx).toBe(1);
  });

  it('from the next round intro returns to the previous leaderboard', () => {
    const solo = createInitialSoloState();
    solo.on = true;
    solo.payload = {
      rounds: [
        { questions: [{ type: 'single', text: 'A', timer: 10 }] },
        { questions: [{ type: 'single', text: 'B', timer: 10 }] },
      ],
    };
    solo.roundIdx = 1;
    solo.phase = 'round_intro';
    expect(soloCanBack(solo)).toBe(true);
    soloBack(solo);
    expect(solo.roundIdx).toBe(0);
    expect(solo.phase).toBe('leaderboard');
  });

  it('steps back through end_of_round summary questions', () => {
    const solo = twoQuestionQuiz('end_of_round');
    solo.phase = 'round_summary';
    solo.questionIdx = 1;
    soloBack(solo);
    expect(solo.phase).toBe('round_summary');
    expect(solo.questionIdx).toBe(0);
    soloBack(solo);
    expect(solo.phase).toBe('question');
    expect(solo.questionIdx).toBe(1);
  });

  it('from end_of_round leaderboard returns to the last summary question', () => {
    const solo = twoQuestionQuiz('end_of_round');
    solo.phase = 'leaderboard';
    soloBack(solo);
    expect(solo.phase).toBe('round_summary');
    expect(solo.questionIdx).toBe(1);
  });

  it('after end_of_round summary of the last round goes to final results', () => {
    const solo = twoQuestionQuiz('end_of_round');
    solo.phase = 'round_summary';
    solo.questionIdx = 1;
    soloAdvance(solo);
    expect(solo.phase).toBe('finished');
  });

  it('undoes a single advance from question_read', () => {
    const solo = twoQuestionQuiz();
    solo.phase = 'question_read';
    soloAdvance(solo);
    expect(solo.phase).toBe('question');
    soloBack(solo);
    expect(solo.phase).toBe('question_read');
    expect(solo.questionIdx).toBe(0);
  });
});

describe('solo listen-media timer hold', () => {
  it('holds the answer deadline until the clip ends', () => {
    const solo = createInitialSoloState();
    solo.payload = {
      rounds: [
        {
          questions: [
            {
              type: 'single',
              text: 'Q',
              timer: 12,
              media: { audio: 'https://x/a.mp3' },
            },
          ],
        },
      ],
    };
    solo.phase = 'question_read';
    soloAdvance(solo);
    expect(solo.phase).toBe('question');
    expect(solo.phaseDeadlineAt).toBeNull();
    soloStartQuestionAnswerTimer(solo);
    expect(solo.phaseDeadlineAt).toBeTruthy();
    const rem = new Date(solo.phaseDeadlineAt!).getTime() - Date.now();
    expect(rem).toBeGreaterThan(11000);
    expect(rem).toBeLessThanOrEqual(12000);
    const first = solo.phaseDeadlineAt;
    soloStartQuestionAnswerTimer(solo);
    expect(solo.phaseDeadlineAt).toBe(first);
  });

  it('pauses a running timer on play and resumes remaining on stop', () => {
    const solo = createInitialSoloState();
    solo.payload = {
      rounds: [{ questions: [{ type: 'single', text: 'Q', timer: 20 }] }],
    };
    solo.phase = 'question';
    solo.phaseDeadlineAt = new Date(Date.now() + 8000).toISOString();
    soloHoldQuestionTimer(solo);
    expect(solo.phaseDeadlineAt).toBeNull();
    expect(solo.pausedRemainingMs).toBeGreaterThan(7000);
    expect(solo.pausedRemainingMs).toBeLessThanOrEqual(8000);
    soloStartQuestionAnswerTimer(solo);
    const rem = new Date(solo.phaseDeadlineAt!).getTime() - Date.now();
    expect(rem).toBeGreaterThan(7000);
    expect(rem).toBeLessThanOrEqual(8000);
  });

  it('does not invent a 1ms timer when resuming a listen hold', () => {
    const solo = createInitialSoloState();
    solo.payload = {
      rounds: [
        {
          questions: [{ type: 'single', text: 'Q', timer: 15, media: { video: 'https://x/v.mp4' } }],
        },
      ],
    };
    solo.phase = 'question';
    solo.phaseDeadlineAt = null;
    solo.paused = true;
    solo.pausedRemainingMs = null;
    soloResumeAfterPause(solo);
    expect(solo.paused).toBe(false);
    expect(solo.phaseDeadlineAt).toBeNull();
  });
});
