import type { QuestionView, SoloBuilderPayload, SoloPhase, SoloQuestion, SoloRound } from './types';
import { isQuestionUuid, parseStageLayout } from './stage-layout';
import { hideRectsFromQuestion } from './image-hide-rect';
import { questionHasListenMedia } from './listen-media';
import { remainingMs } from '../format';
import { resolveStageBackground } from '../stage/round-bg';

export type SoloState = {
  on: boolean;
  quizId: string;
  payload: SoloBuilderPayload | null;
  roundIdx: number;
  questionIdx: number;
  phase: SoloPhase;
  phaseDeadlineAt: string | null;
  paused: boolean;
  pausedRemainingMs: number | null;
};

export function createInitialSoloState(): SoloState {
  return {
    on: false,
    quizId: '',
    payload: null,
    roundIdx: 0,
    questionIdx: 0,
    phase: 'quiz_intro',
    phaseDeadlineAt: null,
    paused: false,
    pausedRemainingMs: null,
  };
}

export function soloCurrentRound(solo: SoloState): SoloRound | null {
  const p = solo.payload;
  if (!p?.rounds?.length) return null;
  return p.rounds[solo.roundIdx] || null;
}

export function soloCurrentQuestion(solo: SoloState): SoloQuestion | null {
  const r = soloCurrentRound(solo);
  if (!r?.questions?.length) return null;
  return r.questions[solo.questionIdx] || null;
}

export function soloAllQuestions(solo: SoloState): SoloQuestion[] {
  const out: SoloQuestion[] = [];
  for (const round of solo.payload?.rounds || []) {
    for (const q of round.questions || []) out.push(q);
  }
  return out;
}

export function soloQuestionLayoutIds(q: SoloQuestion): {
  optionIds: string[];
  matchLeftIds: string[];
  matchRightIds: string[];
} {
  return {
    optionIds: (q.options || []).map((o) => String(o.id || '').trim()).filter(Boolean),
    matchLeftIds: (q.matchLeft || []).map((o) => String(o.id || '').trim()).filter(Boolean),
    matchRightIds: (q.matchRight || []).map((o) => String(o.id || '').trim()).filter(Boolean),
  };
}

export function soloQuestionExplanation(q: SoloQuestion): {
  text: string | null;
  image: string | null;
  video: string | null;
} {
  const nested = q.explanation;
  const textNested = nested && typeof nested.text === 'string' ? nested.text.trim() : '';
  const imgNested = nested && typeof nested.image === 'string' ? nested.image.trim() : '';
  const vidNested = nested && typeof nested.video === 'string' ? nested.video.trim() : '';
  const textFlat = typeof q.explanationText === 'string' ? q.explanationText.trim() : '';
  const imgFlat = typeof q.explanationImageUrl === 'string' ? q.explanationImageUrl.trim() : '';
  const vidFlat = typeof q.explanationVideoUrl === 'string' ? q.explanationVideoUrl.trim() : '';
  return {
    text: textNested || textFlat || null,
    image: imgNested || imgFlat || null,
    video: vidNested || vidFlat || null,
  };
}

function soloMapType(t: string | undefined, hiddenAnswer?: string): string {
  if (t === 'multiple') return 'multiple_choice';
  if (t === 'text' || (t === 'hidden' && hiddenAnswer === 'text')) return 'text_input';
  if (t === 'matching') return 'matching';
  return 'single_choice';
}

export function soloRevealDurationMs(round: SoloRound | null): number {
  return Math.max(100, Math.floor(Number(round?.summarySec || 2) * 1000));
}

export function soloAnswerRevealMode(round: SoloRound | null): 'per_question' | 'end_of_round' {
  return round?.answerRevealMode === 'end_of_round' ? 'end_of_round' : 'per_question';
}

/** Solo shows the correct answer + explanation only in these phases. */
export function soloIsRevealPhase(phase: SoloPhase | string | null | undefined): boolean {
  return phase === 'answer_reveal' || phase === 'round_summary';
}

/** Stage timer ring belongs to question flow, not empty solo leaderboard. */
export function soloDrivesStageTimer(phase: SoloPhase | string | null | undefined): boolean {
  return (
    phase === 'question_read' ||
    phase === 'question' ||
    phase === 'answer_reveal' ||
    phase === 'round_summary'
  );
}

function soloIsLastRound(solo: SoloState): boolean {
  const n = solo.payload?.rounds?.length || 0;
  return n <= 0 || solo.roundIdx + 1 >= n;
}

function soloGoToRoundResults(solo: SoloState, r: SoloRound) {
  if (soloIsLastRound(solo)) {
    soloSetPhase(solo, 'finished');
    solo.phaseDeadlineAt = null;
    return;
  }
  soloSetPhase(solo, 'leaderboard');
  soloSetDeadline(solo, (r.leaderboardSec || 6) * 1000);
}

function soloGoToNextQuestionRead(solo: SoloState) {
  const r = soloCurrentRound(solo);
  if (!r?.questions?.length) return;
  if (solo.questionIdx + 1 >= r.questions.length) return;
  solo.questionIdx++;
  soloSetPhase(solo, 'question_read');
  const nq = soloCurrentQuestion(solo);
  soloSetDeadline(solo, ((nq && nq.readSec) ? nq.readSec : 3) * 1000);
}

function soloStartRoundSummary(solo: SoloState, r: SoloRound) {
  solo.questionIdx = 0;
  soloSetPhase(solo, 'round_summary');
  soloApplyRevealDeadline(solo);
}

export function soloSetDeadline(solo: SoloState, msFromNow: number) {
  if (!Number.isFinite(msFromNow) || msFromNow <= 0) {
    solo.phaseDeadlineAt = new Date(Date.now() + 1).toISOString();
  } else {
    solo.phaseDeadlineAt = new Date(Date.now() + Math.floor(msFromNow)).toISOString();
  }
}

export function soloApplyQuestionDeadline(solo: SoloState) {
  const q = soloCurrentQuestion(solo);
  if (questionHasListenMedia(q)) {
    solo.phaseDeadlineAt = null;
    return;
  }
  soloSetDeadline(solo, (q ? q.timer || 15 : 15) * 1000);
}

/** Hold reveal timer when the current question has an explanation video. */
export function soloApplyRevealDeadline(solo: SoloState) {
  const r = soloCurrentRound(solo);
  const q = soloCurrentQuestion(solo);
  if (q && soloQuestionExplanation(q).video) {
    solo.phaseDeadlineAt = null;
    return;
  }
  soloSetDeadline(solo, soloRevealDurationMs(r));
}

/** Freeze the answer timer while listen-media is playing. */
export function soloHoldQuestionTimer(solo: SoloState) {
  if (solo.phase !== 'question') return;
  if (solo.paused) return;
  if (!solo.phaseDeadlineAt) return;
  const rem = remainingMs(solo.phaseDeadlineAt);
  solo.pausedRemainingMs = typeof rem === 'number' ? rem : null;
  solo.phaseDeadlineAt = null;
}

/** Freeze reveal/summary timer while explanation video is playing. */
export function soloHoldRevealTimer(solo: SoloState) {
  if (solo.phase !== 'answer_reveal' && solo.phase !== 'round_summary') return;
  if (solo.paused) return;
  if (!solo.phaseDeadlineAt) return;
  const rem = remainingMs(solo.phaseDeadlineAt);
  solo.pausedRemainingMs = typeof rem === 'number' ? rem : null;
  solo.phaseDeadlineAt = null;
}

/** Start or resume the answer timer after listen-media stop/end. Idempotent. */
export function soloStartQuestionAnswerTimer(solo: SoloState) {
  if (solo.phase !== 'question') return;
  if (solo.phaseDeadlineAt) return;
  const q = soloCurrentQuestion(solo);
  const full = (q ? q.timer || 15 : 15) * 1000;
  if (solo.paused) {
    if (solo.pausedRemainingMs == null) solo.pausedRemainingMs = full;
    return;
  }
  const held = solo.pausedRemainingMs;
  solo.pausedRemainingMs = null;
  const ms = typeof held === 'number' && Number.isFinite(held) && held > 0 ? held : full;
  soloSetDeadline(solo, ms);
}

/** Start reveal/summary timer after explanation video stop/end. */
export function soloStartRevealTimer(solo: SoloState) {
  if (solo.phase !== 'answer_reveal' && solo.phase !== 'round_summary') return;
  if (solo.phaseDeadlineAt) return;
  const r = soloCurrentRound(solo);
  const full = soloRevealDurationMs(r);
  if (solo.paused) {
    if (solo.pausedRemainingMs == null) solo.pausedRemainingMs = full;
    return;
  }
  const held = solo.pausedRemainingMs;
  solo.pausedRemainingMs = null;
  const ms = typeof held === 'number' && Number.isFinite(held) && held > 0 ? held : full;
  soloSetDeadline(solo, ms);
}

export function soloResumeAfterPause(solo: SoloState) {
  solo.paused = false;
  const ms = solo.pausedRemainingMs;
  solo.pausedRemainingMs = null;
  if (typeof ms === 'number' && Number.isFinite(ms) && ms > 0) {
    soloSetDeadline(solo, ms);
    return;
  }
  solo.phaseDeadlineAt = null;
}

export function soloSetPhase(solo: SoloState, nextPhase: SoloPhase) {
  solo.phase = nextPhase;
  solo.paused = false;
  solo.pausedRemainingMs = null;
}

export function soloBuildQuestionView(solo: SoloState): QuestionView | null {
  const r = soloCurrentRound(solo);
  const q = soloCurrentQuestion(solo);
  if (!r || !q) return null;
  const exp = soloQuestionExplanation(q);
  const id = isQuestionUuid(q.id) ? String(q.id) : `solo_r${solo.roundIdx}_q${solo.questionIdx}`;
  const hideRects = hideRectsFromQuestion(q);
  const base: QuestionView = {
    id,
    type: soloMapType(q.type, q.hiddenAnswer),
    prompt: q.text || '',
    imageUrl: q.media?.image || null,
    videoUrl: q.media?.video || null,
    audioUrl: q.media?.audio || null,
    timeLimitSec: Number(q.timer || 15),
    basePoints: Number(q.points || 1),
    roundTitle: r.title || 'Раунд',
    roundDescription: r.description || '',
    quizTitle: solo.payload?.title || 'Квиз',
    quizDescription: solo.payload?.description || '',
    quizIntroSec: Number(solo.payload?.introSec || 6),
    roundBackgroundUrl: resolveStageBackground(r.background, solo.payload?.background),
    roundMusicUrl: r.music || null,
    roundLeaderboardMusicUrl: r.leaderboardMusic || null,
    roundIntroSec: Number(r.introSec || 6),
    roundSummarySec: Number(r.summarySec || 2),
    readTimeSec: Number(q.readSec || 3),
    questionMusicUrl: q.music || null,
    questionMusicCarry: Number(q.musicCarry || 0),
    options: (q.options || []).map((o, idx) => ({
      id: o.id || `o${idx}`,
      position: idx + 1,
      label: o.label || '',
      imageUrl: o.imageUrl || null,
    })),
    correctOptionIds: Array.isArray(q.correct) ? q.correct.slice() : undefined,
    correctTexts:
      (q.type === 'text' || (q.type === 'hidden' && q.hiddenAnswer === 'text')) &&
      Array.isArray(q.correct)
        ? q.correct.slice()
        : undefined,
    explanationText: exp.text,
    explanationImageUrl: exp.image,
    explanationVideoUrl: exp.video,
    stageLayout: parseStageLayout(q.stageLayout),
    quizStageLayout: parseStageLayout(solo.payload?.stageLayout),
    roundStageLayout: parseStageLayout(r.stageLayout),
    quizId: solo.quizId || undefined,
    roundId: typeof r.id === 'string' && r.id.trim() ? r.id.trim() : undefined,
    imageHideRect: hideRects?.[0] ?? null,
    imageHideRects: hideRects,
  };
  if (q.type === 'matching') {
    base.type = 'matching';
    base.options = [];
    base.match = {
      left: (q.matchLeft || []).map((row, i) => ({
        id: row.id || `ml${i}`,
        label: row.label != null ? String(row.label) : null,
        imageUrl: row.imageUrl || null,
      })),
      right: (q.matchRight || []).map((row, i) => ({
        id: row.id || `mr${i}`,
        label: row.label != null ? String(row.label) : null,
        imageUrl: row.imageUrl || null,
      })),
      correct: Array.isArray(q.matchCorrect) ? q.matchCorrect.slice() : [],
    };
  }
  return base;
}

/** Advance solo phase machine by one step. Mutates solo. */
export function soloAdvance(solo: SoloState) {
  const r = soloCurrentRound(solo);
  const q = soloCurrentQuestion(solo);
  if (!r) return;

  if (solo.phase === 'quiz_intro') {
    soloSetPhase(solo, 'round_intro');
    soloSetDeadline(solo, ((r.introSec || 6) * 1000));
    return;
  }

  if (solo.phase === 'round_intro') {
    soloSetPhase(solo, 'question_read');
    soloSetDeadline(solo, (q ? q.readSec || 3 : 3) * 1000);
    return;
  }
  if (solo.phase === 'question_read') {
    soloSetPhase(solo, 'question');
    soloApplyQuestionDeadline(solo);
    return;
  }
  if (solo.phase === 'question') {
    if (soloAnswerRevealMode(r) === 'end_of_round') {
      if (solo.questionIdx + 1 < (r.questions || []).length) {
        soloGoToNextQuestionRead(solo);
        return;
      }
      soloStartRoundSummary(solo, r);
      return;
    }
    soloSetPhase(solo, 'answer_reveal');
    soloApplyRevealDeadline(solo);
    return;
  }
  if (solo.phase === 'answer_reveal') {
    if (solo.questionIdx + 1 < (r.questions || []).length) {
      soloGoToNextQuestionRead(solo);
      return;
    }
    soloGoToRoundResults(solo, r);
    return;
  }
  if (solo.phase === 'round_summary') {
    if (solo.questionIdx + 1 < (r.questions || []).length) {
      solo.questionIdx++;
      soloApplyRevealDeadline(solo);
      return;
    }
    soloGoToRoundResults(solo, r);
    return;
  }
  if (solo.phase === 'leaderboard') {
    if (solo.roundIdx + 1 < (solo.payload?.rounds || []).length) {
      solo.roundIdx++;
      solo.questionIdx = 0;
      soloSetPhase(solo, 'round_intro');
      const nr = soloCurrentRound(solo);
      soloSetDeadline(solo, ((nr && nr.introSec) ? nr.introSec : 6) * 1000);
      return;
    }
    soloSetPhase(solo, 'finished');
    solo.phaseDeadlineAt = null;
  }
}

function soloRestartPhaseTimer(solo: SoloState) {
  const r = soloCurrentRound(solo);
  const q = soloCurrentQuestion(solo);
  if (solo.phase === 'round_intro') {
    soloSetDeadline(solo, ((r && r.introSec) ? r.introSec : 6) * 1000);
    return;
  }
  if (solo.phase === 'question_read') {
    soloSetDeadline(solo, ((q && q.readSec) ? q.readSec : 3) * 1000);
    return;
  }
  if (solo.phase === 'question') {
    soloApplyQuestionDeadline(solo);
    return;
  }
  if (solo.phase === 'answer_reveal' || solo.phase === 'round_summary') {
    soloApplyRevealDeadline(solo);
    return;
  }
  if (solo.phase === 'leaderboard') {
    soloSetDeadline(solo, ((r && r.leaderboardSec) ? r.leaderboardSec : 6) * 1000);
    return;
  }
  solo.phaseDeadlineAt = null;
}

export function soloCanBack(solo: SoloState): boolean {
  if (!solo.on) return false;
  return !(solo.phase === 'quiz_intro' && solo.roundIdx === 0);
}

/** Go back one solo phase. Mutates solo. No-op at the first round intro. */
export function soloBack(solo: SoloState) {
  if (!soloCanBack(solo)) return;
  const rounds = solo.payload?.rounds || [];
  const r = soloCurrentRound(solo);
  const endOfRound = soloAnswerRevealMode(r) === 'end_of_round';
  const lastQ = Math.max(0, (r?.questions || []).length - 1);

  if (solo.phase === 'finished') {
    const lastRound = rounds.length - 1;
    if (lastRound < 0) return;
    solo.roundIdx = lastRound;
    const prev = soloCurrentRound(solo);
    const prevLastQ = Math.max(0, (prev?.questions || []).length - 1);
    const prevEndOfRound = soloAnswerRevealMode(prev) === 'end_of_round';
    solo.questionIdx = prevLastQ;
    soloSetPhase(solo, prevEndOfRound ? 'round_summary' : 'answer_reveal');
    soloRestartPhaseTimer(solo);
    return;
  }
  if (solo.phase === 'leaderboard') {
    solo.questionIdx = lastQ;
    soloSetPhase(solo, endOfRound ? 'round_summary' : 'answer_reveal');
    soloRestartPhaseTimer(solo);
    return;
  }
  if (solo.phase === 'round_summary') {
    if (solo.questionIdx > 0) {
      solo.questionIdx--;
      solo.paused = false;
      solo.pausedRemainingMs = null;
      soloRestartPhaseTimer(solo);
      return;
    }
    solo.questionIdx = lastQ;
    soloSetPhase(solo, 'question');
    soloRestartPhaseTimer(solo);
    return;
  }
  if (solo.phase === 'answer_reveal') {
    soloSetPhase(solo, 'question');
    soloRestartPhaseTimer(solo);
    return;
  }
  if (solo.phase === 'question') {
    soloSetPhase(solo, 'question_read');
    soloRestartPhaseTimer(solo);
    return;
  }
  if (solo.phase === 'question_read') {
    if (solo.questionIdx > 0) {
      solo.questionIdx--;
      soloSetPhase(solo, endOfRound ? 'question' : 'answer_reveal');
      soloRestartPhaseTimer(solo);
      return;
    }
    soloSetPhase(solo, 'round_intro');
    soloRestartPhaseTimer(solo);
    return;
  }
  if (solo.phase === 'round_intro') {
    if (solo.roundIdx > 0) {
      solo.roundIdx--;
      solo.questionIdx = 0;
      soloSetPhase(solo, 'leaderboard');
      soloRestartPhaseTimer(solo);
      return;
    }
    soloSetPhase(solo, 'quiz_intro');
    soloRestartPhaseTimer(solo);
  }
}
