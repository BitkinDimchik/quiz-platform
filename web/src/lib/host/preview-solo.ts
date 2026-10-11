import {
  defaultQuestion,
  defaultRound,
  effectiveQuestionPoints,
  effectiveQuestionReadSec,
  effectiveQuestionTimer,
} from '../builder/defaults';
import type {
  BuilderQuestion,
  BuilderRound,
  PreviewHostPayload,
  PreviewStartPhase,
  QuizDraft,
} from '../builder/types';
import { isStageIntroPhase } from '../stage-intro-phase';
import {
  createInitialSoloState,
  soloApplyQuestionDeadline,
  soloCurrentQuestion,
  soloCurrentRound,
  soloRevealDurationMs,
  soloSetDeadline,
  soloSetPhase,
  type SoloState,
} from './solo';
import type { SoloQuestion, SoloRound } from './types';
import { parseStageLayout } from './stage-layout';

function clampIndex(i: number, len: number): number {
  if (!len) return 0;
  if (!Number.isFinite(i)) return 0;
  return Math.max(0, Math.min(Math.floor(i), len - 1));
}

function toSoloQuestion(round: BuilderRound, q: BuilderQuestion): SoloQuestion {
  return {
    id: q.id,
    type: q.type,
    hiddenAnswer: q.hiddenAnswer,
    text: q.text,
    timer: effectiveQuestionTimer(round, q),
    points: effectiveQuestionPoints(round, q),
    readSec: effectiveQuestionReadSec(round, q),
    music: q.music,
    musicCarry: q.musicCarry,
    media: q.media,
    options: q.options,
    correct: q.correct,
    matchLeft: q.matchLeft,
    matchRight: q.matchRight,
    matchCorrect: q.matchCorrect,
    explanation: q.explanation,
    stageLayout: q.stageLayout,
    imageHideRect: q.imageHideRect,
    imageHideRects: q.imageHideRects,
  };
}

function toSoloRound(quiz: QuizDraft, round: BuilderRound, q: BuilderQuestion): SoloRound {
  return {
    id: round.id,
    title: round.title,
    description: round.description,
    background: round.background || quiz.background || null,
    music: round.music,
    leaderboardMusic: round.leaderboardMusic,
    introSec: round.introSec,
    summarySec: round.summarySec,
    answerRevealMode: 'per_question',
    stageLayout: parseStageLayout(round.stageLayout),
    questions: [toSoloQuestion(round, q)],
  };
}

/** Clone draft and ensure there is a round + question so intro preview can run. */
export function ensurePreviewQuiz(
  draft: QuizDraft,
  activeRoundIdx: number,
  activeQuestionIdx: number,
): { quiz: QuizDraft; roundIdx: number; questionIdx: number } {
  const quiz = structuredClone(draft);
  if (!quiz.rounds.length) quiz.rounds.push(defaultRound());
  const roundIdx = clampIndex(activeRoundIdx, quiz.rounds.length);
  const round = quiz.rounds[roundIdx]!;
  if (!round.questions.length) {
    const stub = defaultQuestion();
    stub.text = '—';
    round.questions.push(stub);
  }
  const questionIdx = clampIndex(activeQuestionIdx, round.questions.length);
  return { quiz, roundIdx, questionIdx };
}

export function resolvePreviewStartPhase(step: number): PreviewStartPhase {
  if (step === 3) return 'round_intro';
  if (step === 4) return 'question_read';
  return 'quiz_intro';
}

/** Solo machine for builder preview: startPhase → advance through remaining stages. */
export function previewSoloFromPayload(payload: PreviewHostPayload): SoloState | null {
  const prepared = ensurePreviewQuiz(
    payload.quiz,
    payload.activeRoundIdx,
    payload.activeQuestionIdx,
  );
  const quiz = prepared.quiz;
  const round = quiz.rounds[prepared.roundIdx];
  const q = round?.questions?.[prepared.questionIdx];
  if (!round || !q) return null;

  const solo = createInitialSoloState();
  solo.on = true;
  solo.roundIdx = 0;
  solo.questionIdx = 0;
  solo.payload = {
    title: quiz.title,
    description: quiz.description,
    introSec: 6,
    background: round.background || quiz.background || null,
    fontFamily: quiz.fontFamily ?? null,
    stageTypeStyles: quiz.stageTypeStyles ?? null,
    stageLayout: parseStageLayout(quiz.stageLayout),
    rounds: [toSoloRound(quiz, round, q)],
  };
  previewRestart(solo, payload.startPhase || 'quiz_intro');
  return solo;
}

export function previewRestart(solo: SoloState, startPhase: PreviewStartPhase = 'quiz_intro'): void {
  const r = soloCurrentRound(solo);
  const q = soloCurrentQuestion(solo);
  if (startPhase === 'round_intro') {
    soloSetPhase(solo, 'round_intro');
    soloSetDeadline(solo, (r?.introSec || 6) * 1000);
    return;
  }
  if (startPhase === 'question_read') {
    soloSetPhase(solo, 'question_read');
    soloSetDeadline(solo, (q?.readSec || 3) * 1000);
    return;
  }
  soloSetPhase(solo, 'quiz_intro');
  soloSetDeadline(solo, (solo.payload?.introSec || 6) * 1000);
}

/** quiz_intro → round_intro → question_read → question → answer_reveal. */
export function previewAdvance(solo: SoloState): boolean {
  const r = soloCurrentRound(solo);
  if (solo.phase === 'quiz_intro') {
    soloSetPhase(solo, 'round_intro');
    soloSetDeadline(solo, (r?.introSec || 6) * 1000);
    return true;
  }
  if (solo.phase === 'round_intro') {
    const q = soloCurrentQuestion(solo);
    soloSetPhase(solo, 'question_read');
    soloSetDeadline(solo, (q?.readSec || 3) * 1000);
    return true;
  }
  if (solo.phase === 'question_read') {
    soloSetPhase(solo, 'question');
    soloApplyQuestionDeadline(solo);
    return true;
  }
  if (solo.phase === 'question') {
    soloSetPhase(solo, 'answer_reveal');
    soloSetDeadline(solo, soloRevealDurationMs(r));
    return true;
  }
  return false;
}

export function previewCanSkip(solo: SoloState): boolean {
  return (
    isStageIntroPhase(solo.phase) ||
    solo.phase === 'question_read' ||
    solo.phase === 'question'
  );
}
