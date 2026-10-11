import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { DomainError } from '../common/domain-error';
import { QuestionType, SessionPhase } from '../common/enums';
import { SessionDispute } from '../entities/session-dispute.entity';
import { SessionDisputeVote } from '../entities/session-dispute-vote.entity';
import { SessionAnswer } from '../entities/session-answer.entity';
import { SessionPlayer } from '../entities/session-player.entity';
import { SessionRoundStake } from '../entities/session-round-stake.entity';
import { SessionQuestionStake } from '../entities/session-question-stake.entity';
import { Question } from '../entities/question.entity';
import { resolveBettingScope } from '../domain/policies/betting-scope';
import { loadBettingStakeAmount } from '../domain/policies/betting-stake';
import { GameSession } from '../entities/game-session.entity';
import { QuestionGradingService } from '../quiz/question-grading.service';
import { scoreAnswerWithStake } from '../domain/policies/scoring-policy';
import { SessionService } from '../session/session.service';
import { SessionEventsService } from '../realtime/session-events.service';

const DISPUTE_MS = 120_000;

export type DisputePublicPayload = {
  disputeId: string;
  questionId: string;
  proposerPlayerId: string;
  proposerDisplayName: string;
  correctTexts: string[];
  proposedText: string;
  eligiblePlayerIds: string[];
  votes: { playerId: string; displayName: string; approve: boolean | null }[];
  status: 'open' | 'approved' | 'rejected';
};

@Injectable()
export class DisputeService {
  constructor(
    @InjectRepository(SessionDispute)
    private readonly disputes: Repository<SessionDispute>,
    @InjectRepository(SessionDisputeVote)
    private readonly disputeVotes: Repository<SessionDisputeVote>,
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
    @InjectRepository(GameSession)
    private readonly gameSessions: Repository<GameSession>,
    private readonly dataSource: DataSource,
    private readonly grading: QuestionGradingService,
    private readonly sessions: SessionService,
    private readonly events: SessionEventsService,
  ) {}

  async hasOpenDispute(sessionId: string, questionId: string): Promise<boolean> {
    return (
      (await this.disputes.count({
        where: { sessionId, questionId, status: 'open' },
      })) > 0
    );
  }

  /** Истечение по таймауту (вызывать перед проверкой hasOpenDispute в game-flow). */
  async expireStaleIfNeeded(sessionId: string, questionId: string): Promise<void> {
    const d = await this.disputes.findOne({ where: { sessionId, questionId, status: 'open' } });
    if (!d) return;
    if (Date.now() - d.createdAt.getTime() < DISPUTE_MS) return;
    d.status = 'rejected';
    await this.disputes.save(d);
    const payload = await this.buildPayload(d);
    this.events.emitDisputeUpdate(sessionId, { kind: 'closed', outcome: 'rejected', reason: 'timeout', dispute: payload });
    const updated = await this.sessions.findSession(sessionId);
    if (updated) this.events.emitSessionUpdate(updated);
  }

  async getOpenDisputePayload(sessionId: string, questionId: string): Promise<DisputePublicPayload | null> {
    const d = await this.disputes.findOne({
      where: { sessionId, questionId, status: 'open' },
      relations: { proposerPlayer: true },
    });
    if (!d) return null;
    return this.buildPayload(d);
  }

  private async buildPayload(d: SessionDispute): Promise<DisputePublicPayload> {
    const eligible: string[] = JSON.parse(d.eligiblePlayerIdsJson || '[]');
    const votes = await this.disputeVotes.find({ where: { disputeId: d.id } });
    const voteMap = new Map(votes.map((v) => [v.playerId, v.approve]));
    const players = await this.players.find({ where: { sessionId: d.sessionId } });
    const nameById = new Map(players.map((p) => [p.id, p.displayName || '?']));
    const sess = await this.gameSessions.findOne({ where: { id: d.sessionId } });
    const qv = sess
      ? await this.grading.findForGrading(sess.quizRevisionId, d.questionId)
      : null;
    const correctTexts = qv?.correctTexts?.map((x) => x.text) ?? [];
    const ans = await this.answers.findOne({
      where: { sessionId: d.sessionId, playerId: d.proposerPlayerId, questionId: d.questionId },
    });
    const st: 'open' | 'approved' | 'rejected' =
      d.status === 'open' ? 'open' : d.status === 'approved' ? 'approved' : 'rejected';
    return {
      disputeId: d.id,
      questionId: d.questionId,
      proposerPlayerId: d.proposerPlayerId,
      proposerDisplayName: nameById.get(d.proposerPlayerId) || '?',
      correctTexts,
      proposedText: ans?.textAnswer ?? '',
      eligiblePlayerIds: eligible,
      votes: eligible.map((pid) => ({
        playerId: pid,
        displayName: nameById.get(pid) || '?',
        approve: voteMap.has(pid) ? voteMap.get(pid)! : null,
      })),
      status: st,
    };
  }

  async startDispute(sessionId: string, playerId: string, questionId: string): Promise<DisputePublicPayload> {
    const session = await this.sessions.findSession(sessionId);
    if (!session) throw DomainError.notFound('session');
    if (session.isPaused) throw DomainError.illegalState('session is paused');
    if (session.phase !== SessionPhase.AnswerReveal) {
      throw DomainError.illegalState('dispute only during answer reveal');
    }
    if (session.currentQuestionId !== questionId) {
      throw DomainError.validation('not the active question');
    }

    const q = await this.grading.findForGrading(session.quizRevisionId, questionId);
    if (!q || q.questionType !== QuestionType.TextInput) {
      throw DomainError.validation('only text questions can be disputed');
    }

    const existing = await this.disputes.findOne({ where: { sessionId, questionId, status: 'open' } });
    if (existing) throw DomainError.conflict('dispute already open');

    const answer = await this.answers.findOne({ where: { sessionId, playerId, questionId } });
    if (!answer) throw DomainError.validation('no answer to dispute');
    if (answer.isCorrect === true || answer.isCorrect === null) {
      throw DomainError.validation('answer is not marked incorrect');
    }

    const allPlayers = await this.players.find({ where: { sessionId } });
    if (allPlayers.length < 2) {
      throw DomainError.validation('need at least two players to dispute');
    }
    const eligibleIds = allPlayers.map((p) => p.id);
    const eligibleJson = JSON.stringify(eligibleIds);

    const proposer = await this.players.findOne({ where: { id: playerId } });
    if (!proposer || proposer.sessionId !== sessionId) throw DomainError.forbidden('player');

    const dispute = this.disputes.create({
      sessionId,
      questionId,
      proposerPlayerId: playerId,
      status: 'open',
      eligiblePlayerIdsJson: eligibleJson,
    });

    await this.dataSource.transaction(async (em) => {
      const saved = await em.save(dispute);
      await em.save(SessionDisputeVote, {
        disputeId: saved.id,
        playerId,
        approve: true,
      });
      await em.update(
        GameSession,
        { id: sessionId, isPaused: false },
        { phaseDeadlineAt: new Date(Date.now() + DISPUTE_MS) },
      );
    });

    const d2 = await this.disputes.findOne({
      where: { sessionId, questionId, status: 'open' },
      relations: { proposerPlayer: true },
    });
    if (!d2) throw DomainError.validation('dispute save failed');
    const payload = await this.buildPayload(d2);
    this.events.emitDisputeUpdate(sessionId, { kind: 'opened', dispute: payload });
    const updated = await this.sessions.findSession(sessionId);
    if (updated) this.events.emitSessionUpdate(updated);
    return payload;
  }

  async vote(disputeId: string, voterId: string, approve: boolean): Promise<DisputePublicPayload> {
    const d = await this.disputes.findOne({ where: { id: disputeId } });
    if (!d || d.status !== 'open') throw DomainError.illegalState('no open dispute');

    const eligible: string[] = JSON.parse(d.eligiblePlayerIdsJson || '[]');
    if (!eligible.includes(voterId)) throw DomainError.forbidden('not eligible to vote');

    const dup = await this.disputeVotes.findOne({ where: { disputeId, playerId: voterId } });
    if (dup) throw DomainError.conflict('already voted');

    if (!approve) {
      d.status = 'rejected';
      await this.disputes.save(d);
      await this.disputeVotes.save({ disputeId, playerId: voterId, approve: false });
      const payload = await this.buildPayload(d);
      this.events.emitDisputeUpdate(d.sessionId, { kind: 'closed', outcome: 'rejected', dispute: payload });
      await this.bumpRevealDeadline(d.sessionId);
      const updated = await this.sessions.findSession(d.sessionId);
      if (updated) this.events.emitSessionUpdate(updated);
      return payload;
    }

    await this.disputeVotes.save({ disputeId, playerId: voterId, approve: true });

    const votes = await this.disputeVotes.find({ where: { disputeId } });
    const approveAll =
      eligible.length > 0 &&
      votes.length === eligible.length &&
      votes.every((v) => v.approve === true);

    if (approveAll) {
      await this.applyApproval(d);
      const d4 = await this.disputes.findOne({ where: { id: disputeId } });
      if (!d4) throw DomainError.notFound('dispute');
      const payload = await this.buildPayload(d4);
      this.events.emitDisputeUpdate(d.sessionId, { kind: 'closed', outcome: 'approved', dispute: payload });
      await this.bumpRevealDeadline(d.sessionId);
      const updated = await this.sessions.findSession(d.sessionId);
      if (updated) this.events.emitSessionUpdate(updated);
      return payload;
    }

    const dOpen = await this.disputes.findOne({ where: { id: disputeId } });
    if (!dOpen) throw DomainError.notFound('dispute');
    const payload = await this.buildPayload(dOpen);
    this.events.emitDisputeUpdate(d.sessionId, { kind: 'vote', dispute: payload });
    return payload;
  }

  private async bumpRevealDeadline(sessionId: string): Promise<void> {
    const s = await this.sessions.findSession(sessionId);
    if (!s || s.isPaused) return;
    await this.gameSessions.update(
      { id: sessionId },
      { phaseDeadlineAt: new Date(Date.now() + 8_000) },
    );
  }

  private async applyApproval(d: SessionDispute): Promise<void> {
    const session = await this.sessions.findSession(d.sessionId);
    if (!session) return;

    const q = await this.grading.findForGrading(session.quizRevisionId, d.questionId);
    if (!q) throw DomainError.notFound('question');

    const answer = await this.answers.findOne({
      where: { sessionId: d.sessionId, playerId: d.proposerPlayerId, questionId: d.questionId },
    });
    if (!answer) throw DomainError.notFound('answer');

    const questionRow = await this.questions.findOne({
      where: { id: d.questionId },
      relations: { round: true },
    });
    const scope = questionRow
      ? resolveBettingScope(questionRow.round, questionRow.meta, questionRow.id)
      : { kind: 'none' as const };
    const stakeAmt = await loadBettingStakeAmount(
      scope,
      this.stakes,
      this.questionStakes,
      d.sessionId,
      d.proposerPlayerId,
    );
    const points = scoreAnswerWithStake(q.basePoints, true, stakeAmt).points;

    const oldPoints = answer.pointsAwarded;
    const delta = points - oldPoints;

    await this.dataSource.transaction(async (em) => {
      await em.update(
        SessionAnswer,
        { id: answer.id },
        { isCorrect: true, pointsAwarded: points },
      );
      d.status = 'approved';
      await em.save(SessionDispute, d);
      if (delta !== 0) {
        await em.query(`UPDATE session_players SET score = MAX(0, score + ?) WHERE id = ?`, [
          delta,
          d.proposerPlayerId,
        ]);
      }
    });
  }
}
