import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { SessionAnswer } from '../entities/session-answer.entity';
import { SessionPlayer } from '../entities/session-player.entity';
import { SessionRoundStake } from '../entities/session-round-stake.entity';
import { SessionQuestionStake } from '../entities/session-question-stake.entity';
import { Question } from '../entities/question.entity';
import { resolveBettingScope } from '../domain/policies/betting-scope';
import { loadBettingStakeAmount } from '../domain/policies/betting-stake';
import { DomainError } from '../common/domain-error';
import { AdvanceMode, MatchingScoringMode, QuestionType, SessionPhase } from '../common/enums';
import { SessionService } from '../session/session.service';
import { QuestionGradingService } from '../quiz/question-grading.service';
import {
  AnswerSubmission,
  gradeAnswer,
  gradeMatchingDetail,
} from '../domain/policies/answer-grader';
import {
  scoreAnswerWithStake,
  scoreMatchingPerMatchWithStake,
} from '../domain/policies/scoring-policy';
import { SessionEventsService } from '../realtime/session-events.service';
import { GameFlowService } from '../game-flow/game-flow.service';

@Injectable()
export class AnswerService {
  constructor(
    @InjectRepository(SessionAnswer)
    private readonly answers: Repository<SessionAnswer>,
    @InjectRepository(SessionPlayer)
    private readonly players: Repository<SessionPlayer>,
    @InjectRepository(SessionRoundStake)
    private readonly stakes: Repository<SessionRoundStake>,
    @InjectRepository(SessionQuestionStake)
    private readonly questionStakes: Repository<SessionQuestionStake>,
    @InjectRepository(Question)
    private readonly questions: Repository<Question>,
    private readonly dataSource: DataSource,
    private readonly sessions: SessionService,
    private readonly grading: QuestionGradingService,
    private readonly events: SessionEventsService,
    private readonly flow: GameFlowService,
  ) {}

  async submitAnswer(
    sessionId: string,
    playerId: string,
    questionId: string,
    submission: AnswerSubmission,
  ): Promise<SessionAnswer> {
    const s = await this.sessions.findSession(sessionId);
    if (!s) throw DomainError.notFound('session');
    if (s.phase !== SessionPhase.Question) {
      throw DomainError.illegalState('answers only in question phase');
    }
    if (s.currentQuestionId !== questionId) {
      throw DomainError.validation('not the active question');
    }
    if (
      s.advanceMode === AdvanceMode.Automatic &&
      s.phaseDeadlineAt &&
      new Date() > s.phaseDeadlineAt
    ) {
      throw DomainError.illegalState('question timer expired');
    }

    const player = await this.players.findOne({ where: { id: playerId } });
    if (!player) throw DomainError.notFound('player');
    if (player.sessionId !== sessionId) throw DomainError.forbidden('player mismatch');

    const q = await this.grading.findForGrading(s.quizRevisionId, questionId);
    if (!q) throw DomainError.notFound('question');

    let textToStore = submission.textAnswer ?? null;
    if (q.questionType === QuestionType.Matching) {
      if (submission.matchOrder && submission.matchOrder.length > 0) {
        textToStore = JSON.stringify({ match: submission.matchOrder });
      } else {
        textToStore = null;
      }
    }

    const questionRow = await this.questions.findOne({
      where: { id: questionId },
      relations: { round: true },
    });
    const scope = questionRow
      ? resolveBettingScope(questionRow.round, questionRow.meta, questionRow.id)
      : { kind: 'none' as const };
    const stakeAmt = await loadBettingStakeAmount(
      scope,
      this.stakes,
      this.questionStakes,
      sessionId,
      playerId,
    );

    let points: number;
    let isCorrect: boolean | null;
    const matchingPer =
      q.questionType === QuestionType.Matching &&
      q.matchScoringMode === MatchingScoringMode.PerCorrectMatch;
    const matchDetail = matchingPer ? gradeMatchingDetail(q, submission) : null;

    if (matchingPer && matchDetail) {
      if (!matchDetail.valid || matchDetail.n <= 0) {
        const graded = scoreMatchingPerMatchWithStake(q.basePoints, 0, 0, stakeAmt);
        points = graded.points;
        isCorrect = false;
      } else {
        const graded = scoreMatchingPerMatchWithStake(
          q.basePoints,
          matchDetail.correctCount,
          matchDetail.n,
          stakeAmt,
        );
        points = graded.points;
        isCorrect = graded.isCorrect;
      }
    } else {
      const graded = scoreAnswerWithStake(q.basePoints, gradeAnswer(q, submission), stakeAmt);
      points = graded.points;
      isCorrect = graded.isCorrect;
    }
    const newScore = Math.max(0, player.score + points);

    try {
      const saved = await this.dataSource.transaction(async (em) => {
        const ans = em.create(SessionAnswer, {
          sessionId,
          playerId,
          questionId,
          quizRevisionId: s.quizRevisionId,
          timeToAnswerMs: null,
          selectedOptionIds: JSON.stringify(submission.selectedOptionIds ?? []),
          textAnswer: textToStore,
          isCorrect,
          pointsAwarded: points,
        });
        await em.save(ans);
        await em.update(SessionPlayer, { id: playerId }, { score: newScore });
        return ans;
      });
      this.events.emitAnswerSubmitted(sessionId, { playerId, questionId });

      // Auto-finish question early if everyone answered.
      // Keep it best-effort: ignore races/conflicts.
      try {
        await this.flow.finishQuestionIfAllAnswered(sessionId);
      } catch (_) {}
      return saved;
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      if (code === '23505') throw DomainError.conflict('already answered');
      throw e;
    }
  }
}
