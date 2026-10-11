import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GameSession } from '../entities/game-session.entity';
import { SessionPlayer } from '../entities/session-player.entity';
import { SessionRoundStake } from '../entities/session-round-stake.entity';
import { SessionQuestionStake } from '../entities/session-question-stake.entity';
import { SessionAnswer } from '../entities/session-answer.entity';
import { Question } from '../entities/question.entity';
import type { Round } from '../entities/round.entity';
import { SessionService } from '../session/session.service';
import { RevisionLayoutService } from '../quiz/revision-layout.service';
import { QuestionGradingService } from '../quiz/question-grading.service';
import { QuestionViewService } from '../quiz/question-view.service';
import { questionHasExplanationVideo, questionHasListenMedia } from '../quiz/listen-media';
import { SessionEventsService } from '../realtime/session-events.service';
import { DisputeService } from '../dispute/dispute.service';
import { DomainError } from '../common/domain-error';
import { isOptimisticLockVersionMismatchError } from '../common/typeorm-errors.util';
import { AdvanceMode, AnswerRevealMode, SessionPhase } from '../common/enums';
import {
  afterLeaderboard,
  afterReveal,
  firstQuestion,
  isLastQuestionInRound,
} from '../domain/game-navigation';
import { validateStake } from '../domain/policies/betting-policy';
import {
  bettingPhaseForScope,
  resolveBettingScope,
  roundBettingOptions,
} from '../domain/policies/betting-scope';
import { bettingPhaseSec } from '../domain/policies/betting-options';
import { rankPlayers } from '../domain/policies/leaderboard-ordering';

const PAUSE_PHASES = new Set<SessionPhase>([
  SessionPhase.QuizIntro,
  SessionPhase.RoundIntro,
  SessionPhase.QuestionRead,
  SessionPhase.Question,
  SessionPhase.AnswerReveal,
  SessionPhase.RoundReplay,
  SessionPhase.RoundSummary,
  SessionPhase.Leaderboard,
]);

@Injectable()
export class GameFlowService {
  private readonly maxSessionSaveAttempts = 5;

  constructor(
    @InjectRepository(GameSession)
    private readonly sessions: Repository<GameSession>,
    @InjectRepository(SessionPlayer)
    private readonly players: Repository<SessionPlayer>,
    @InjectRepository(SessionRoundStake)
    private readonly stakes: Repository<SessionRoundStake>,
    @InjectRepository(SessionQuestionStake)
    private readonly questionStakes: Repository<SessionQuestionStake>,
    @InjectRepository(SessionAnswer)
    private readonly answers: Repository<SessionAnswer>,
    @InjectRepository(Question)
    private readonly questions: Repository<Question>,
    private readonly sessionSvc: SessionService,
    private readonly layoutSvc: RevisionLayoutService,
    private readonly gradingSvc: QuestionGradingService,
    private readonly questionView: QuestionViewService,
    private readonly events: SessionEventsService,
    private readonly dispute: DisputeService,
  ) {}

  private phaseDeadline(mode: AdvanceMode, timeLimitSec: number): Date | null {
    if (mode === AdvanceMode.Manual) return null;
    return new Date(Date.now() + timeLimitSec * 1000);
  }

  /** Hold reveal/summary timer until explanation video is played (same gate as listen media). */
  private async applyRevealDeadline(
    s: GameSession,
    sec: number,
    questionId: string | null | undefined,
  ): Promise<void> {
    if (questionId) {
      const q = await this.questionView.getQuestionView(s.quizRevisionId, questionId, {
        includeCorrect: true,
      });
      if (questionHasExplanationVideo(q)) {
        s.phaseDeadlineAt = null;
        return;
      }
    }
    s.phaseDeadlineAt = this.phaseDeadline(s.advanceMode, sec);
  }

  private isMediaHoldablePhase(phase: SessionPhase): boolean {
    return (
      phase === SessionPhase.Question ||
      phase === SessionPhase.AnswerReveal ||
      phase === SessionPhase.RoundReplay ||
      phase === SessionPhase.RoundSummary
    );
  }

  private parsePositiveInt(v: unknown, fallback: number): number {
    const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
  }

  /** Intro раунда; со ставками на раунд фаза длится не меньше времени на ставку. */
  private roundIntroSec(round: Round | null | undefined): number {
    const base = this.parsePositiveInt((round?.meta as { introSec?: unknown } | undefined)?.introSec, 6);
    return round ? bettingPhaseSec(base, roundBettingOptions(round)) : base;
  }

  private async enterRoundIntro(s: GameSession, roundId: string, questionId: string): Promise<void> {
    const round = await this.layoutSvc.findRound(s.quizRevisionId, roundId);
    const introSec = this.roundIntroSec(round);
    if (round?.answerRevealMode) {
      s.answerRevealMode = round.answerRevealMode as any;
    }
    s.phase = SessionPhase.RoundIntro;
    s.currentRoundId = roundId;
    s.currentQuestionId = questionId;
    s.phaseDeadlineAt = this.phaseDeadline(s.advanceMode, introSec);
  }

  private async enterQuestionRead(s: GameSession, questionId: string): Promise<void> {
    const q = await this.questionView.getQuestionView(s.quizRevisionId, questionId, {
      includeCorrect: false,
    });
    s.phase = SessionPhase.QuestionRead;
    s.currentQuestionId = questionId;
    s.phaseDeadlineAt = this.phaseDeadline(s.advanceMode, q.readTimeSec);
  }

  private async enterQuestion(s: GameSession, questionId: string): Promise<void> {
    const qMeta = await this.questionView.getQuestionView(s.quizRevisionId, questionId, {
      includeCorrect: false,
    });
    s.phase = SessionPhase.Question;
    s.currentQuestionId = questionId;
    if (questionHasListenMedia(qMeta)) {
      s.phaseDeadlineAt = null;
    } else {
      s.phaseDeadlineAt = this.phaseDeadline(s.advanceMode, qMeta.timeLimitSec);
    }
  }

  /**
   * Сохранение GameSession с retry при гонках (VersionColumn).
   * После исчерпания попыток — CONFLICT.
   */
  private async saveSessionWithRetry(
    sessionId: string,
    mutate: (s: GameSession) => Promise<void>,
  ): Promise<GameSession> {
    for (let attempt = 0; attempt < this.maxSessionSaveAttempts; attempt += 1) {
      const s = await this.sessionSvc.findSession(sessionId);
      if (!s) throw DomainError.notFound('session');

      await mutate(s);

      try {
        const saved = await this.sessions.save(s);
        this.events.emitSessionUpdate(saved);
        void this.publishAnswerKeyIfReveal(saved);
        return saved;
      } catch (e: unknown) {
        if (isOptimisticLockVersionMismatchError(e) && attempt < this.maxSessionSaveAttempts - 1) {
          continue;
        }
        if (isOptimisticLockVersionMismatchError(e)) {
          throw DomainError.conflict('concurrent session update');
        }
        throw e;
      }
    }
    throw DomainError.conflict('concurrent session update');
  }

  private async publishAnswerKeyIfReveal(s: GameSession): Promise<void> {
    if (
      s.phase !== SessionPhase.AnswerReveal &&
      s.phase !== SessionPhase.RoundReplay &&
      s.phase !== SessionPhase.RoundSummary
    ) {
      return;
    }
    const qid = s.currentQuestionId;
    if (!qid) return;
    try {
      const q = await this.questionView.getQuestionView(s.quizRevisionId, qid, { includeCorrect: true });
      this.events.emitAnswerKey(s.id, {
        questionId: q.id,
        correctOptionIds: q.correctOptionIds ?? [],
        correctTexts: q.correctTexts ?? [],
        matchCorrect: q.match?.correct,
      });
    } catch {
      /* best-effort: players can still fetch question_view */
    }
  }

  /**
   * Старт игры. Роль хоста должна быть проверена на транспорте (например WS handshake).
   */
  async startGame(sessionId: string): Promise<GameSession> {
    return this.saveSessionWithRetry(sessionId, async (s) => {
      if (s.phase !== SessionPhase.Lobby) {
        throw DomainError.illegalState('session is not in lobby');
      }

      const layout = await this.layoutSvc.loadLayout(s.quizRevisionId);
      const fq = firstQuestion(layout);
      if (!fq) throw DomainError.validation('quiz has no questions');

      const qMeta = await this.gradingSvc.findForGrading(s.quizRevisionId, fq.questionId);
      if (!qMeta) throw DomainError.notFound('question');

      const round = await this.layoutSvc.findRound(s.quizRevisionId, fq.roundId);
      if (round?.answerRevealMode) {
        s.answerRevealMode = round.answerRevealMode as any;
      }

      const qv = await this.questionView.getQuestionView(s.quizRevisionId, fq.questionId, {
        includeCorrect: false,
      });
      s.phase = SessionPhase.QuizIntro;
      s.currentRoundId = fq.roundId;
      s.currentQuestionId = fq.questionId;
      s.startedAt = new Date();
      s.isPaused = false;
      s.pausedRemainingMs = null;
      s.phaseDeadlineAt = this.phaseDeadline(s.advanceMode, qv.quizIntroSec);
    });
  }

  async togglePause(sessionId: string): Promise<GameSession> {
    return this.saveSessionWithRetry(sessionId, async (s) => {
      if (!PAUSE_PHASES.has(s.phase)) {
        throw DomainError.illegalState('cannot pause in this phase');
      }
      if (!s.isPaused) {
        s.pausedRemainingMs = s.phaseDeadlineAt
          ? Math.max(0, s.phaseDeadlineAt.getTime() - Date.now())
          : null;
        s.phaseDeadlineAt = null;
        s.isPaused = true;
        return;
      }
      const remaining = s.pausedRemainingMs;
      s.isPaused = false;
      s.pausedRemainingMs = null;
      if (
        s.phase === SessionPhase.Question &&
        s.currentQuestionId &&
        (await this.allConnectedHaveAnswered(s.id, s.currentQuestionId))
      ) {
        await this.applyFinishQuestionEarly(s);
        return;
      }
      if (remaining != null) {
        s.phaseDeadlineAt = new Date(Date.now() + remaining);
      }
    });
  }

  async holdQuestionAnswerTimer(sessionId: string): Promise<GameSession> {
    return this.saveSessionWithRetry(sessionId, async (s) => {
      if (!this.isMediaHoldablePhase(s.phase)) return;
      if (s.isPaused) return;
      if (!s.phaseDeadlineAt) return;
      s.pausedRemainingMs = Math.max(0, s.phaseDeadlineAt.getTime() - Date.now());
      s.phaseDeadlineAt = null;
    });
  }

  async startQuestionAnswerTimer(sessionId: string): Promise<GameSession> {
    return this.saveSessionWithRetry(sessionId, async (s) => {
      if (!this.isMediaHoldablePhase(s.phase)) return;
      if (s.phaseDeadlineAt) return;
      const qid = s.currentQuestionId;
      if (!qid) return;

      let fullSec: number;
      if (s.phase === SessionPhase.Question) {
        const q = await this.questionView.getQuestionView(s.quizRevisionId, qid, {
          includeCorrect: false,
        });
        fullSec = q.timeLimitSec;
      } else {
        const round = s.currentRoundId
          ? await this.layoutSvc.findRound(s.quizRevisionId, s.currentRoundId)
          : null;
        fullSec = this.parsePositiveInt((round?.meta as { summarySec?: unknown } | undefined)?.summarySec, 2);
      }

      if (s.isPaused) {
        if (s.pausedRemainingMs == null) s.pausedRemainingMs = Math.max(0, fullSec * 1000);
        return;
      }
      let sec = fullSec;
      if (s.pausedRemainingMs != null) {
        sec = Math.max(1, Math.ceil(s.pausedRemainingMs / 1000));
        s.pausedRemainingMs = null;
      }
      s.phaseDeadlineAt = this.phaseDeadline(s.advanceMode, sec);
    });
  }

  async advanceAfterDeadline(sessionId: string): Promise<GameSession> {
    return this.saveSessionWithRetry(sessionId, async (s) => {
      if (s.isPaused) return;
      if (s.advanceMode !== AdvanceMode.Automatic) return;
      if (!s.phaseDeadlineAt) return;
      if (new Date() <= s.phaseDeadlineAt) return;

      const qid = s.currentQuestionId;
      const rid = s.currentRoundId;
      if (!qid) throw DomainError.illegalState('no current question');
      if (!rid) throw DomainError.illegalState('no current round');

      if (s.phase === SessionPhase.QuizIntro) {
        await this.enterRoundIntro(s, rid, qid);
        return;
      }

      if (s.phase === SessionPhase.RoundIntro) {
        await this.enterQuestionRead(s, qid);
        return;
      }

      if (s.phase === SessionPhase.QuestionRead) {
        await this.enterQuestion(s, qid);
        return;
      }

      if (s.phase === SessionPhase.AnswerReveal) {
        await this.dispute.expireStaleIfNeeded(sessionId, qid);
        if (await this.dispute.hasOpenDispute(sessionId, qid)) {
          s.phaseDeadlineAt = new Date(Date.now() + 15_000);
          return;
        }
        // auto-proceed after reveal timeout
        const layout = await this.layoutSvc.loadLayout(s.quizRevisionId);
        const step = afterReveal(qid, layout);

        if (step.kind === 'finished') {
          s.phase = SessionPhase.Finished;
          s.currentQuestionId = null;
          s.phaseDeadlineAt = null;
          return;
        }
        if (step.kind === 'leaderboard') {
          // end of round
          s.phase = SessionPhase.Leaderboard;
          s.currentRoundId = step.roundId;
          s.currentQuestionId = null;
          const round = await this.layoutSvc.findRound(s.quizRevisionId, step.roundId);
          const lbSec = this.parsePositiveInt((round?.meta as any)?.leaderboardSec, 6);
          s.phaseDeadlineAt = this.phaseDeadline(s.advanceMode, lbSec);
          return;
        }

        // go to next question (with read phase)
        const isNewRound = step.roundId !== s.currentRoundId;
        s.currentRoundId = step.roundId;
        s.currentQuestionId = step.questionId;
        if (isNewRound) {
          await this.enterRoundIntro(s, step.roundId, step.questionId);
          return;
        }
        const q = await this.questionView.getQuestionView(s.quizRevisionId, step.questionId, { includeCorrect: false });
        s.phase = SessionPhase.QuestionRead;
        s.phaseDeadlineAt = this.phaseDeadline(s.advanceMode, q.readTimeSec);
        return;
      }

      if (s.phase === SessionPhase.RoundReplay || s.phase === SessionPhase.RoundSummary) {
        await this.advanceRoundSummaryStep(s);
        return;
      }

      if (s.phase === SessionPhase.Leaderboard) {
        // auto-continue leaderboard in automatic mode
        const layout = await this.layoutSvc.loadLayout(s.quizRevisionId);
        await this.applyContinueFromLeaderboard(s, layout);
        return;
      }

      if (s.phase !== SessionPhase.Question) return;

      // question timer expired → next step
      // decide reveal mode by current round (fallback to session default)
      let mode = s.answerRevealMode;
      const roundForReveal = s.currentRoundId
        ? await this.layoutSvc.findRound(s.quizRevisionId, s.currentRoundId)
        : null;
      if (roundForReveal && (roundForReveal as any).answerRevealMode) {
        mode = (roundForReveal as any).answerRevealMode as AnswerRevealMode;
      }
      const answerRevealSec = this.parsePositiveInt((roundForReveal?.meta as any)?.summarySec, 2);

      if (mode === AnswerRevealMode.PerQuestion) {
        s.phase = SessionPhase.AnswerReveal;
        await this.applyRevealDeadline(s, answerRevealSec, qid);
        return;
      }

      // end_of_round: no reveal after each question
      const layout = await this.layoutSvc.loadLayout(s.quizRevisionId);

      if (isLastQuestionInRound(layout, qid)) {
        // go to round summary (fast replay) before moving to next round/leaderboard
        const rid2 = s.currentRoundId;
        if (!rid2) throw DomainError.illegalState('no current round');
        const roundLayout = layout.rounds.find((r) => r.round.id === rid2);
        const firstQ = roundLayout?.questionIds?.[0] ?? null;
        const round = await this.layoutSvc.findRound(s.quizRevisionId, rid2);
        const summarySec = this.parsePositiveInt((round?.meta as any)?.summarySec, 2);
        s.phase = SessionPhase.RoundSummary;
        s.currentQuestionId = firstQ;
        await this.applyRevealDeadline(s, summarySec, firstQ);
        return;
      }

      // not last in round → go to next question in same round (with read phase)
      const flatStep = afterReveal(qid, layout);
      if (flatStep.kind !== 'question') {
        // should not happen because not last in round, but keep safe fallback
        s.phase = SessionPhase.RoundSummary;
        await this.applyRevealDeadline(s, 2, qid);
        return;
      }
      s.currentRoundId = flatStep.roundId;
      s.currentQuestionId = flatStep.questionId;
      const qNext = await this.questionView.getQuestionView(s.quizRevisionId, flatStep.questionId, { includeCorrect: false });
      s.phase = SessionPhase.QuestionRead;
      s.phaseDeadlineAt = this.phaseDeadline(s.advanceMode, qNext.readTimeSec);
      return;
    });
  }

  /**
   * Step through end-of-round answer replay: next question, or leave summary when done.
   * Used by both server auto-advance and host_continue_round_summary.
   */
  private async advanceRoundSummaryStep(
    s: GameSession,
    layout?: Awaited<ReturnType<RevisionLayoutService['loadLayout']>>,
  ): Promise<void> {
    const l = layout ?? (await this.layoutSvc.loadLayout(s.quizRevisionId));
    const rid = s.currentRoundId;
    if (!rid) throw DomainError.illegalState('no current round');
    const round = await this.layoutSvc.findRound(s.quizRevisionId, rid);
    const summarySec = this.parsePositiveInt((round?.meta as any)?.summarySec, 2);
    const roundLayout = l.rounds.find((r) => r.round.id === rid);
    const ids = roundLayout?.questionIds ?? [];
    const cur = s.currentQuestionId;
    if (!cur) {
      await this.applyContinueAfterRoundSummary(s, l);
      return;
    }
    const idx = ids.indexOf(cur);
    const nextId = idx >= 0 ? (ids[idx + 1] ?? null) : (ids[0] ?? null);
    if (!nextId) {
      await this.applyContinueAfterRoundSummary(s, l);
      return;
    }
    s.phase = SessionPhase.RoundSummary;
    s.currentQuestionId = nextId;
    await this.applyRevealDeadline(s, summarySec, nextId);
  }

  private async applyContinueAfterRoundSummary(s: GameSession, layout?: Awaited<ReturnType<RevisionLayoutService['loadLayout']>>) {
    const rid = s.currentRoundId;
    if (!rid) throw DomainError.illegalState('no current round');
    const l = layout ?? (await this.layoutSvc.loadLayout(s.quizRevisionId));
    const rIdx = l.rounds.findIndex((r) => r.round.id === rid);
    if (rIdx < 0) {
      s.phase = SessionPhase.Finished;
      s.currentQuestionId = null;
      s.phaseDeadlineAt = null;
      return;
    }
    const next = l.rounds[rIdx + 1];
    if (!next || !next.questionIds?.[0]) {
      s.phase = SessionPhase.Finished;
      s.currentQuestionId = null;
      s.phaseDeadlineAt = null;
      return;
    }
    // After fast round summary replay, always show intermediate leaderboard for this round,
    // same screen as "final" leaderboard but with kind="round".
    s.phase = SessionPhase.Leaderboard;
    s.currentRoundId = rid;
    s.currentQuestionId = null;
    const round = await this.layoutSvc.findRound(s.quizRevisionId, rid);
    const lbSec = this.parsePositiveInt((round?.meta as any)?.leaderboardSec, 6);
    s.phaseDeadlineAt = this.phaseDeadline(s.advanceMode, lbSec);
  }

  private async applyContinueFromLeaderboard(
    s: GameSession,
    layout?: Awaited<ReturnType<RevisionLayoutService['loadLayout']>>,
  ) {
    const rid = s.currentRoundId;
    if (!rid) throw DomainError.illegalState('no current round');
    const l = layout ?? (await this.layoutSvc.loadLayout(s.quizRevisionId));
    const step = afterLeaderboard(rid, l);
    if (step.kind === 'finished') {
      s.phase = SessionPhase.Finished;
      s.currentQuestionId = null;
      s.phaseDeadlineAt = null;
      return;
    }
    if (step.kind !== 'question') {
      throw DomainError.illegalState('unexpected step after leaderboard');
    }
    await this.enterRoundIntro(s, step.roundId, step.questionId);
  }

  async continueAfterRoundSummary(sessionId: string): Promise<GameSession> {
    return this.saveSessionWithRetry(sessionId, async (s) => {
      if (s.isPaused) throw DomainError.illegalState('session is paused');
      if (s.phase !== SessionPhase.RoundSummary && s.phase !== SessionPhase.RoundReplay) {
        throw DomainError.illegalState('not in round summary phase');
      }
      // Same stepping as auto-advance: next summary question, or leave to leaderboard.
      await this.advanceRoundSummaryStep(s);
    });
  }

  async finishQuestionIfAllAnswered(sessionId: string): Promise<GameSession | null> {
    const s = await this.sessionSvc.findSession(sessionId);
    if (!s || s.phase !== SessionPhase.Question || !s.currentQuestionId) return null;
    if (!(await this.allConnectedHaveAnswered(s.id, s.currentQuestionId))) return null;
    return this.finishQuestionEarly(sessionId);
  }

  async finishQuestionEarly(sessionId: string): Promise<GameSession> {
    return this.saveSessionWithRetry(sessionId, async (s) => {
      await this.applyFinishQuestionEarly(s);
    });
  }

  private async allConnectedHaveAnswered(sessionId: string, questionId: string): Promise<boolean> {
    const activePlayers = await this.players.count({
      where: { sessionId, isConnected: true },
    });
    if (activePlayers <= 0) return false;

    const row = await this.answers
      .createQueryBuilder('a')
      .select('COUNT(DISTINCT a.player_id)', 'cnt')
      .innerJoin(SessionPlayer, 'p', 'p.id = a.player_id')
      .where('a.session_id = :sid', { sid: sessionId })
      .andWhere('a.question_id = :qid', { qid: questionId })
      .andWhere('p.session_id = :sid', { sid: sessionId })
      .andWhere('p.is_connected = true')
      .getRawOne<{ cnt: string }>();
    const answered = row?.cnt ? parseInt(row.cnt, 10) : 0;
    return answered >= activePlayers;
  }

  /** Закрыть вопрос досрочно. Пауза не блокирует: если все ответили, таймер не ждём. */
  private async applyFinishQuestionEarly(s: GameSession): Promise<void> {
    if (s.phase !== SessionPhase.Question) return;
    const qid = s.currentQuestionId;
    if (!qid) return;

    s.isPaused = false;
    s.pausedRemainingMs = null;

    let mode = s.answerRevealMode;
    const roundEarly = s.currentRoundId
      ? await this.layoutSvc.findRound(s.quizRevisionId, s.currentRoundId)
      : null;
    if (roundEarly && (roundEarly as any).answerRevealMode) {
      mode = (roundEarly as any).answerRevealMode as AnswerRevealMode;
    }

    if (mode === AnswerRevealMode.PerQuestion) {
      const summarySec = this.parsePositiveInt((roundEarly?.meta as any)?.summarySec, 2);
      s.phase = SessionPhase.AnswerReveal;
      await this.applyRevealDeadline(s, summarySec, qid);
      return;
    }

    const layout = await this.layoutSvc.loadLayout(s.quizRevisionId);

    if (isLastQuestionInRound(layout, qid)) {
      const rid2 = s.currentRoundId;
      if (!rid2) return;
      const roundLayout = layout.rounds.find((r) => r.round.id === rid2);
      const firstQ = roundLayout?.questionIds?.[0] ?? null;
      const round = await this.layoutSvc.findRound(s.quizRevisionId, rid2);
      const summarySec = this.parsePositiveInt((round?.meta as any)?.summarySec, 2);
      s.phase = SessionPhase.RoundSummary;
      s.currentQuestionId = firstQ;
      await this.applyRevealDeadline(s, summarySec, firstQ);
      return;
    }

    const flatStep = afterReveal(qid, layout);
    if (flatStep.kind !== 'question') return;
    s.currentRoundId = flatStep.roundId;
    s.currentQuestionId = flatStep.questionId;
    const qNext = await this.questionView.getQuestionView(s.quizRevisionId, flatStep.questionId, {
      includeCorrect: false,
    });
    s.phase = SessionPhase.QuestionRead;
    s.phaseDeadlineAt = this.phaseDeadline(s.advanceMode, qNext.readTimeSec);
  }

  /**
   * automatic: когда истёк таймер вопроса — перейти к следующему шагу.
   * MVP-логика: сразу следующий вопрос (или finished), без reveal/leaderboard пауз.
   */
  // advanceAfterQuestionTimeout replaced by advanceAfterDeadline()

  async revealAnswer(sessionId: string): Promise<GameSession> {
    return this.saveSessionWithRetry(sessionId, async (s) => {
      if (s.isPaused) throw DomainError.illegalState('session is paused');
      if (s.phase !== SessionPhase.Question) {
        throw DomainError.illegalState('not in question phase');
      }
      // Respect per-round reveal mode. If the round is configured to reveal at end of round,
      // do NOT enter AnswerReveal after each question.
      const qid = s.currentQuestionId;
      const rid = s.currentRoundId;
      if (!qid) throw DomainError.illegalState('no current question');
      if (!rid) throw DomainError.illegalState('no current round');
      const round = await this.layoutSvc.findRound(s.quizRevisionId, rid);
      const mode = (round && (round as any).answerRevealMode) ? ((round as any).answerRevealMode as AnswerRevealMode) : s.answerRevealMode;
      if (mode === AnswerRevealMode.EndOfRound) {
        const layout = await this.layoutSvc.loadLayout(s.quizRevisionId);
        if (isLastQuestionInRound(layout, qid)) {
          const roundLayout = layout.rounds.find((r) => r.round.id === rid);
          const firstQ = roundLayout?.questionIds?.[0] ?? null;
          const summarySec = this.parsePositiveInt((round?.meta as any)?.summarySec, 2);
          s.phase = SessionPhase.RoundSummary;
          s.currentQuestionId = firstQ;
          await this.applyRevealDeadline(s, summarySec, firstQ);
          return;
        }
        const step = afterReveal(qid, layout);
        if (step.kind !== 'question') {
          // Safe fallback: if nav says finished/leaderboard, finish.
          s.phase = SessionPhase.Finished;
          s.currentQuestionId = null;
          s.phaseDeadlineAt = null;
          return;
        }
        s.currentRoundId = step.roundId;
        s.currentQuestionId = step.questionId;
        // In automatic mode, go through read phase timer; in manual keep null.
        const q = await this.questionView.getQuestionView(s.quizRevisionId, step.questionId, { includeCorrect: false });
        s.phase = SessionPhase.QuestionRead;
        s.phaseDeadlineAt = this.phaseDeadline(s.advanceMode, q.readTimeSec);
        return;
      }

      s.phase = SessionPhase.AnswerReveal;
      await this.applyRevealDeadline(
        s,
        this.parsePositiveInt((round?.meta as { summarySec?: unknown } | undefined)?.summarySec, 2),
        qid,
      );
    });
  }

  async proceedAfterReveal(sessionId: string): Promise<GameSession> {
    return this.saveSessionWithRetry(sessionId, async (s) => {
      if (s.isPaused) throw DomainError.illegalState('session is paused');
      if (s.phase !== SessionPhase.AnswerReveal) {
        throw DomainError.illegalState('not in reveal phase');
      }
      const qid = s.currentQuestionId;
      if (!qid) throw DomainError.illegalState('no current question');

      const layout = await this.layoutSvc.loadLayout(s.quizRevisionId);
      const step = afterReveal(qid, layout);

      if (step.kind === 'finished') {
        s.phase = SessionPhase.Finished;
        s.currentQuestionId = null;
        s.phaseDeadlineAt = null;
        return;
      }
      if (step.kind === 'leaderboard') {
        s.phase = SessionPhase.Leaderboard;
        s.currentRoundId = step.roundId;
        s.currentQuestionId = null;
        const round = await this.layoutSvc.findRound(s.quizRevisionId, step.roundId);
        const lbSec = this.parsePositiveInt((round?.meta as any)?.leaderboardSec, 6);
        s.phaseDeadlineAt = this.phaseDeadline(s.advanceMode, lbSec);
        return;
      }

      s.currentRoundId = step.roundId;
      s.currentQuestionId = step.questionId;
      const qNext = await this.questionView.getQuestionView(s.quizRevisionId, step.questionId, { includeCorrect: false });
      s.phase = SessionPhase.QuestionRead;
      s.phaseDeadlineAt = this.phaseDeadline(s.advanceMode, qNext.readTimeSec);
    });
  }

  async continueFromLeaderboard(sessionId: string): Promise<GameSession> {
    return this.saveSessionWithRetry(sessionId, async (s) => {
      if (s.isPaused) throw DomainError.illegalState('session is paused');
      if (s.phase !== SessionPhase.Leaderboard) {
        throw DomainError.illegalState('not in leaderboard phase');
      }
      await this.applyContinueFromLeaderboard(s);
    });
  }

  async leaderboard(sessionId: string): Promise<SessionPlayer[]> {
    const s = await this.sessionSvc.findSession(sessionId);
    if (!s) throw DomainError.notFound('session');
    const ps = await this.players.find({ where: { sessionId, isConnected: true } });
    const ranked = rankPlayers(ps);
    this.events.emitLeaderboard(
      sessionId,
      ranked.map((p) => ({
        playerId: p.id,
        displayName: p.displayName,
        score: p.score,
      })),
    );
    return ranked;
  }

  async leaderboardDetailed(
    sessionId: string,
    opts: { roundId?: string | null },
  ): Promise<{ playerId: string; displayName: string; score: number; roundPoints: number }[]> {
    const s = await this.sessionSvc.findSession(sessionId);
    if (!s) throw DomainError.notFound('session');

    const qb = this.players
      .createQueryBuilder('p')
      .select('p.id', 'playerId')
      .addSelect('p.display_name', 'displayName')
      .addSelect('p.score', 'score')
      .addSelect('COALESCE(SUM(a.points_awarded), 0)', 'roundPoints')
      .leftJoin(SessionAnswer, 'a', 'a.player_id = p.id AND a.session_id = p.session_id')
      .leftJoin(Question, 'q', 'q.id = a.question_id')
      .where('p.session_id = :sid', { sid: sessionId })
      .andWhere('p.is_connected = true')
      .groupBy('p.id')
      .addGroupBy('p.display_name')
      .addGroupBy('p.score')
      .orderBy('p.score', 'DESC')
      .addOrderBy('LOWER(p.display_name)', 'ASC');

    const rid = opts.roundId ?? null;
    if (rid) {
      qb.andWhere('q.round_id = :rid', { rid });
    }

    const rows = await qb.getRawMany<{
      playerId: string;
      displayName: string;
      score: string | number;
      roundPoints: string | number;
    }>();

    return rows.map((r) => ({
      playerId: r.playerId,
      displayName: r.displayName,
      score: typeof r.score === 'number' ? r.score : parseInt(String(r.score || '0'), 10) || 0,
      roundPoints:
        typeof r.roundPoints === 'number'
          ? r.roundPoints
          : parseInt(String(r.roundPoints || '0'), 10) || 0,
    }));
  }

  async placeStake(
    sessionId: string,
    playerId: string,
    input: { roundId?: string; questionId?: string; stake: number },
  ): Promise<void> {
    const hasRound = !!input.roundId;
    const hasQuestion = !!input.questionId;
    if (hasRound === hasQuestion) {
      throw DomainError.validation('provide roundId or questionId');
    }

    const s = await this.sessionSvc.findSession(sessionId);
    if (!s) throw DomainError.notFound('session');
    if (s.phase === SessionPhase.Finished) {
      throw DomainError.illegalState('session finished');
    }
    const player = await this.players.findOne({ where: { id: playerId } });
    if (!player) throw DomainError.notFound('player');
    if (player.sessionId !== sessionId) throw DomainError.forbidden('player not in session');

    if (hasRound) {
      const roundId = input.roundId!;
      const expectedPhase = SessionPhase.RoundIntro;
      if (s.phase !== expectedPhase) {
        throw DomainError.illegalState('stakes only during round intro');
      }
      if (s.currentRoundId !== roundId) {
        throw DomainError.validation('round mismatch');
      }
      const round = await this.layoutSvc.findRound(s.quizRevisionId, roundId);
      if (!round) throw DomainError.notFound('round');
      const scope = resolveBettingScope(round, {}, s.currentQuestionId || '');
      if (scope.kind !== 'round') {
        throw DomainError.validation('betting not enabled for round');
      }
      validateStake(player.score, input.stake, scope.options);
      await this.stakes.delete({ sessionId, playerId, roundId });
      await this.stakes.save(
        this.stakes.create({ sessionId, playerId, roundId, stake: input.stake }),
      );
      await this.checkAllStakedAndAdvance(sessionId, scope);
      return;
    }

    const questionId = input.questionId!;
    const q = await this.questions.findOne({
      where: { id: questionId },
      relations: { round: true },
    });
    if (!q || q.round.quizRevisionId !== s.quizRevisionId) {
      throw DomainError.notFound('question');
    }
    const scope = resolveBettingScope(q.round, q.meta, q.id);
    if (scope.kind !== 'question') {
      throw DomainError.validation('betting not enabled for question');
    }
    const expectedPhase = bettingPhaseForScope(scope);
    if (!expectedPhase || s.phase !== expectedPhase) {
      throw DomainError.illegalState('stakes only during question read');
    }
    if (s.currentQuestionId !== questionId) {
      throw DomainError.validation('question mismatch');
    }
    validateStake(player.score, input.stake, scope.options);
    await this.questionStakes.delete({ sessionId, playerId, questionId });
    await this.questionStakes.save(
      this.questionStakes.create({ sessionId, playerId, questionId, stake: input.stake }),
    );
    await this.checkAllStakedAndAdvance(sessionId, scope);
  }

  /** Когда все подключённые поставили (или отказались) — сразу закрываем фазу ставки. */
  private async checkAllStakedAndAdvance(
    sessionId: string,
    scope: ReturnType<typeof resolveBettingScope>,
  ): Promise<void> {
    if (scope.kind === 'none') return;
    const s = await this.sessionSvc.findSession(sessionId);
    if (!s || s.isPaused) return;
    const expected = bettingPhaseForScope(scope);
    if (!expected || s.phase !== expected) return;

    const activePlayers = await this.players.count({ where: { sessionId, isConnected: true } });
    if (activePlayers <= 0) return;

    let placed = 0;
    if (scope.kind === 'round') {
      const row = await this.stakes
        .createQueryBuilder('st')
        .select('COUNT(DISTINCT st.player_id)', 'cnt')
        .innerJoin(SessionPlayer, 'p', 'p.id = st.player_id')
        .where('st.session_id = :sid', { sid: sessionId })
        .andWhere('st.round_id = :rid', { rid: scope.roundId })
        .andWhere('p.session_id = :sid', { sid: sessionId })
        .andWhere('p.is_connected = true')
        .getRawOne<{ cnt: string }>();
      placed = row?.cnt ? parseInt(row.cnt, 10) : 0;
    } else {
      const row = await this.questionStakes
        .createQueryBuilder('st')
        .select('COUNT(DISTINCT st.player_id)', 'cnt')
        .innerJoin(SessionPlayer, 'p', 'p.id = st.player_id')
        .where('st.session_id = :sid', { sid: sessionId })
        .andWhere('st.question_id = :qid', { qid: scope.questionId })
        .andWhere('p.session_id = :sid', { sid: sessionId })
        .andWhere('p.is_connected = true')
        .getRawOne<{ cnt: string }>();
      placed = row?.cnt ? parseInt(row.cnt, 10) : 0;
    }
    if (placed < activePlayers) return;
    try {
      await this.finishBettingEarly(sessionId);
    } catch {
      /* гонка с таймером / паузой — фаза всё равно уйдёт по дедлайну */
    }
  }

  async finishBettingEarly(sessionId: string): Promise<GameSession> {
    return this.saveSessionWithRetry(sessionId, async (s) => {
      if (s.isPaused) return;
      const qid = s.currentQuestionId;
      if (!qid) return;
      if (s.phase === SessionPhase.RoundIntro) {
        await this.enterQuestionRead(s, qid);
        return;
      }
      if (s.phase === SessionPhase.QuestionRead) {
        await this.enterQuestion(s, qid);
      }
    });
  }
}
