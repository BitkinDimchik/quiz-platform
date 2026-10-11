import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { GameSession } from '../entities/game-session.entity';
import { QuizRevision } from '../entities/quiz-revision.entity';
import { SessionPlayer } from '../entities/session-player.entity';
import { QuizRun } from '../entities/quiz-run.entity';
import { SessionAnswer } from '../entities/session-answer.entity';
import { SessionRoundStake } from '../entities/session-round-stake.entity';
import { SessionQuestionStake } from '../entities/session-question-stake.entity';
import { QuizService } from '../quiz/quiz.service';
import { DomainError } from '../common/domain-error';
import {
  playerTokenSalt,
  randomRoomCode,
  randomSalt,
  randomTokenUrlSafe,
  sha256,
  timingSafeEqualDigest,
} from '../common/crypto.util';
import { AdvanceMode, AnswerRevealMode, SessionPhase } from '../common/enums';
import { SessionEventsService } from '../realtime/session-events.service';

@Injectable()
export class SessionService {
  constructor(
    @InjectRepository(GameSession)
    private readonly sessions: Repository<GameSession>,
    @InjectRepository(SessionPlayer)
    private readonly players: Repository<SessionPlayer>,
    @InjectRepository(QuizRun)
    private readonly runs: Repository<QuizRun>,
    @InjectRepository(SessionAnswer)
    private readonly sessionAnswers: Repository<SessionAnswer>,
    @InjectRepository(SessionRoundStake)
    private readonly sessionStakes: Repository<SessionRoundStake>,
    @InjectRepository(SessionQuestionStake)
    private readonly sessionQuestionStakes: Repository<SessionQuestionStake>,
    private readonly quizSvc: QuizService,
    private readonly events: SessionEventsService,
  ) {}

  async startSession(
    quizId: string,
    advanceMode: AdvanceMode,
    answerRevealMode: AnswerRevealMode,
    opts?: { actingUserId?: string },
  ): Promise<{ session: GameSession; hostSecret: string; roomCode: string }> {
    const rev = await this.quizSvc.getPublishedRevision(quizId);
    if (!rev) throw DomainError.notFound('published quiz revision');

    if (opts?.actingUserId) {
      const quiz = await this.quizSvc.findQuizById(quizId);
      if (!quiz || quiz.ownerUserId !== opts.actingUserId) {
        throw DomainError.forbidden('only the quiz owner may start a session using this token');
      }
    }

    const hostSecret = randomTokenUrlSafe(32);
    const salt = randomSalt(16);
    const hostHash = sha256(hostSecret, salt);

    for (let attempt = 0; attempt < 16; attempt += 1) {
      const roomCode = randomRoomCode(5);
      const session = this.sessions.create({
        quizId,
        quizRevisionId: rev.id,
        roomCode,
        phase: SessionPhase.Lobby,
        advanceMode,
        answerRevealMode,
        hostSecretHash: hostHash,
        hostSecretSalt: salt,
        currentRoundId: null,
        currentQuestionId: null,
        phaseDeadlineAt: null,
        startedAt: null,
        endedAt: null,
      });
      try {
        const saved = await this.sessions.save(session);
        await this.runs.save(
          this.runs.create({
            sessionId: saved.id,
            quizId,
            quizRevisionId: rev.id,
            runNo: 1,
            endedAt: null,
          }),
        );
        return { session: saved, hostSecret, roomCode };
      } catch (e: unknown) {
        const code = (e as { code?: string })?.code;
        if (code === '23505') continue;
        throw e;
      }
    }
    throw DomainError.conflict('room_code exhaustion');
  }

  async startNextQuiz(
    sessionId: string,
    quizId: string,
  ): Promise<{ session: GameSession; runId: string; runNo: number }> {
    const rev = await this.quizSvc.getPublishedRevision(quizId);
    if (!rev) throw DomainError.notFound('published quiz revision');
    return this.startNextQuizWithRevision(sessionId, rev);
  }

  async startNextQuizFromRevision(
    sessionId: string,
    quizRevisionId: string,
  ): Promise<{ session: GameSession; runId: string; runNo: number }> {
    const rev = await this.quizSvc.getPublishedRevisionByRevisionId(quizRevisionId);
    if (!rev) throw DomainError.notFound('published quiz revision');
    return this.startNextQuizWithRevision(sessionId, rev);
  }

  private async startNextQuizWithRevision(
    sessionId: string,
    rev: QuizRevision,
  ): Promise<{ session: GameSession; runId: string; runNo: number }> {
    const session = await this.findSession(sessionId);
    if (!session) throw DomainError.notFound('session');

    // Иначе при повторном запуске того же квиза остаются строки (player_id, question_id) —
    // клиент видит старый ответ и не может перевыбрать.
    await this.sessionAnswers
      .createQueryBuilder()
      .delete()
      .from(SessionAnswer)
      .where('session_id = :sid', { sid: sessionId })
      .execute();
    await this.sessionStakes
      .createQueryBuilder()
      .delete()
      .from(SessionRoundStake)
      .where('session_id = :sid', { sid: sessionId })
      .execute();
    await this.sessionQuestionStakes
      .createQueryBuilder()
      .delete()
      .from(SessionQuestionStake)
      .where('session_id = :sid', { sid: sessionId })
      .execute();

    // Новый квиз в той же комнате — итоги считаются по квизу, без накопления с прошлого запуска.
    await this.players
      .createQueryBuilder()
      .update(SessionPlayer)
      .set({ score: 0 })
      .where('session_id = :sid', { sid: sessionId })
      .execute();

    const quizId = rev.quizId;

    const last = await this.runs.findOne({
      where: { sessionId },
      order: { runNo: 'DESC' },
    });
    const runNo = (last?.runNo ?? 0) + 1;

    // close previous run if it is still open
    await this.runs
      .createQueryBuilder()
      .update(QuizRun)
      .set({ endedAt: new Date() })
      .where('"session_id" = :sid AND "ended_at" IS NULL', { sid: sessionId })
      .execute();

    const run = await this.runs.save(
      this.runs.create({
        sessionId,
        quizId,
        quizRevisionId: rev.id,
        runNo,
        endedAt: null,
      }),
    );

    // reset session state for the next quiz (players stay)
    session.quizId = quizId;
    session.quizRevisionId = rev.id;
    session.phase = SessionPhase.Lobby;
    session.currentRoundId = null;
    session.currentQuestionId = null;
    session.phaseDeadlineAt = null;
    session.startedAt = null;
    session.isPaused = false;
    session.pausedRemainingMs = null;
    // do not set endedAt: persistent lobby
    session.endedAt = null;

    const saved = await this.sessions.save(session);
    this.events.emitSessionUpdate(saved);
    const lobbyPlayers = await this.listLobbyPlayers(sessionId);
    await this.events.emitPlayersUpdate(sessionId, lobbyPlayers);
    return { session: saved, runId: run.id, runNo };
  }

  /** Единый ввод кода комнаты: без учёта регистра и лишних пробелов (как на клиенте normRoomCode). */
  private normalizeRoomCodeForLookup(roomCode: string): string {
    return String(roomCode ?? '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '');
  }

  async findActiveByRoomCode(roomCode: string): Promise<GameSession | null> {
    const rc = this.normalizeRoomCodeForLookup(roomCode);
    if (!rc) return null;
    return this.sessions.findOne({
      where: { roomCode: rc, endedAt: IsNull() },
    });
  }

  async findSession(sessionId: string): Promise<GameSession | null> {
    return this.sessions.findOne({ where: { id: sessionId } });
  }

  async joinPlayer(
    roomCode: string,
    displayName: string,
    avatarUrl?: string | null,
  ): Promise<{ player: SessionPlayer; reconnectToken: string; roomCode: string }> {
    const session = await this.findActiveByRoomCode(roomCode);
    if (!session) throw DomainError.notFound('active session');
    if (session.phase !== SessionPhase.Lobby) {
      throw DomainError.forbidden('game already started');
    }

    const reconnectToken = randomTokenUrlSafe(24);
    const pSalt = playerTokenSalt(session.id);
    const tokenHash = sha256(reconnectToken, pSalt);
    const now = new Date();

    const player = this.players.create({
      sessionId: session.id,
      displayName,
      avatarUrl: avatarUrl ?? null,
      score: 0,
      reconnectTokenHash: tokenHash,
      joinedAt: now,
      lastSeenAt: now,
      disconnectedAt: null,
      isConnected: true,
    });
    const saved = await this.players.save(player);
    await this.claimVipIfEmpty(session.id, saved.id);
    const reloaded = await this.findSession(session.id);
    if (reloaded) this.events.emitSessionUpdate(reloaded);
    const players = await this.listLobbyPlayers(session.id);
    await this.events.emitPlayersUpdate(session.id, players);
    return { player: saved, reconnectToken, roomCode: session.roomCode };
  }

  async updatePlayerAvatar(
    sessionId: string,
    playerId: string,
    avatarUrl: string,
  ): Promise<SessionPlayer> {
    const session = await this.findSession(sessionId);
    if (!session) throw DomainError.notFound('session');
    if (session.endedAt) throw DomainError.forbidden('session ended');
    if (session.phase !== SessionPhase.Lobby) {
      throw DomainError.forbidden('avatar can only be changed in lobby');
    }
    const p = await this.players.findOne({ where: { id: playerId } });
    if (!p || p.sessionId !== sessionId) throw DomainError.notFound('player');
    p.avatarUrl = avatarUrl;
    p.lastSeenAt = new Date();
    const saved = await this.players.save(p);
    const players = await this.listLobbyPlayers(sessionId);
    await this.events.emitPlayersUpdate(sessionId, players);
    return saved;
  }

  async listPlayers(sessionId: string): Promise<SessionPlayer[]> {
    return this.players.find({ where: { sessionId }, order: { joinedAt: 'ASC' } });
  }

  async listLobbyPlayers(sessionId: string): Promise<SessionPlayer[]> {
    // В лобби показываем только активных (online). Offline игроки должны исчезать из списка.
    return this.players.find({
      where: { sessionId, isConnected: true, disconnectedAt: IsNull() },
      order: { joinedAt: 'ASC' },
    });
  }

  async findPlayerById(playerId: string): Promise<SessionPlayer | null> {
    return this.players.findOne({ where: { id: playerId } });
  }

  async markPlayerDisconnected(sessionId: string, playerId: string): Promise<void> {
    const p = await this.players.findOne({ where: { id: playerId } });
    if (!p) return;
    if (p.sessionId !== sessionId) return;
    const now = new Date();
    p.lastSeenAt = now;
    p.disconnectedAt = now;
    p.isConnected = false;
    await this.players.save(p);
    await this.promoteVipIfNeeded(sessionId, playerId);
    const reloaded = await this.findSession(sessionId);
    if (reloaded) this.events.emitSessionUpdate(reloaded);
    const players = await this.listLobbyPlayers(sessionId);
    await this.events.emitPlayersUpdate(sessionId, players);
  }

  async kickPlayer(sessionId: string, playerId: string): Promise<SessionPlayer> {
    const p = await this.players.findOne({ where: { id: playerId } });
    if (!p) throw DomainError.notFound('player');
    if (p.sessionId !== sessionId) throw DomainError.forbidden('player not in this session');
    const now = new Date();
    p.lastSeenAt = now;
    p.disconnectedAt = now;
    p.isConnected = false;
    const saved = await this.players.save(p);
    await this.promoteVipIfNeeded(sessionId, playerId);
    const reloaded = await this.findSession(sessionId);
    if (reloaded) this.events.emitSessionUpdate(reloaded);
    const players = await this.listLobbyPlayers(sessionId);
    await this.events.emitPlayersUpdate(sessionId, players);
    return saved;
  }

  /**
   * Переподключение игрока по одноразовому reconnect-токену (в БД только SHA-256).
   */
  async reconnect(
    sessionId: string,
    reconnectToken: string,
  ): Promise<{ player: SessionPlayer; session: GameSession }> {
    const session = await this.findSession(sessionId);
    if (!session) throw DomainError.notFound('session');
    if (session.endedAt) {
      throw DomainError.forbidden('session ended');
    }

    const salt = playerTokenSalt(sessionId);
    const candidateHash = sha256(reconnectToken, salt);

    const player = await this.players.findOne({
      where: { sessionId, reconnectTokenHash: candidateHash },
    });

    if (
      !player ||
      !timingSafeEqualDigest(player.reconnectTokenHash, candidateHash)
    ) {
      throw DomainError.unauthorized('invalid reconnect token');
    }

    const now = new Date();
    player.lastSeenAt = now;
    player.disconnectedAt = null;
    player.isConnected = true;
    const saved = await this.players.save(player);
    await this.claimVipIfEmpty(sessionId, saved.id);
    const reloaded = await this.findSession(sessionId);
    if (reloaded) this.events.emitSessionUpdate(reloaded);
    const players = await this.listLobbyPlayers(sessionId);
    await this.events.emitPlayersUpdate(sessionId, players);

    return { player: saved, session: reloaded ?? session };
  }

  /**
   * Завершить текущий квиз и вернуть всех в лобби, не закрывая комнату.
   * Игроки остаются подключёнными и могут сыграть следующий квиз в той же сессии.
   */
  async returnSessionToLobby(sessionId: string): Promise<GameSession> {
    const session = await this.findSession(sessionId);
    if (!session) throw DomainError.notFound('session');
    if (session.endedAt) throw DomainError.forbidden('session ended');

    await this.sessionAnswers
      .createQueryBuilder()
      .delete()
      .from(SessionAnswer)
      .where('session_id = :sid', { sid: sessionId })
      .execute();
    await this.sessionStakes
      .createQueryBuilder()
      .delete()
      .from(SessionRoundStake)
      .where('session_id = :sid', { sid: sessionId })
      .execute();
    await this.sessionQuestionStakes
      .createQueryBuilder()
      .delete()
      .from(SessionQuestionStake)
      .where('session_id = :sid', { sid: sessionId })
      .execute();

    await this.runs
      .createQueryBuilder()
      .update(QuizRun)
      .set({ endedAt: new Date() })
      .where('"session_id" = :sid AND "ended_at" IS NULL', { sid: sessionId })
      .execute();

    await this.players
      .createQueryBuilder()
      .update(SessionPlayer)
      .set({ score: 0 })
      .where('session_id = :sid', { sid: sessionId })
      .execute();

    session.phase = SessionPhase.Lobby;
    session.currentRoundId = null;
    session.currentQuestionId = null;
    session.phaseDeadlineAt = null;
    session.startedAt = null;
    session.isPaused = false;
    session.pausedRemainingMs = null;

    const saved = await this.sessions.save(session);
    this.events.emitSessionUpdate(saved);
    const lobbyPlayers = await this.listLobbyPlayers(sessionId);
    await this.events.emitPlayersUpdate(sessionId, lobbyPlayers);
    return saved;
  }

  /** Закрыть комнату (ведущий не вернулся / явное завершение). */
  async markSessionEnded(sessionId: string): Promise<void> {
    const s = await this.findSession(sessionId);
    if (!s || s.endedAt) return;
    s.endedAt = new Date();
    const saved = await this.sessions.save(s);
    this.events.emitSessionUpdate(saved);
    // Сразу очистим список игроков на host UI (иначе он остаётся «залипшим» до WS-disconnect).
    await this.events.emitPlayersUpdate(sessionId, []);
  }

  /** Проверка секрета ведущего; сессия может быть закрыта (endedAt). */
  async assertHostSecret(sessionId: string, hostSecret: string): Promise<GameSession> {
    const s = await this.findSession(sessionId);
    if (!s) throw DomainError.notFound('session');
    const salt = s.hostSecretSalt ?? Buffer.alloc(0);
    const h = sha256(hostSecret, salt);
    if (!timingSafeEqualDigest(h, s.hostSecretHash)) {
      throw DomainError.unauthorized('invalid host secret');
    }
    return s;
  }

  async assertHost(sessionId: string, hostSecret: string): Promise<GameSession> {
    const s = await this.assertHostSecret(sessionId, hostSecret);
    if (s.endedAt) {
      throw DomainError.forbidden('session ended');
    }
    return s;
  }

  /**
   * Снова открыть комнату с тем же roomCode и sessionId (после явного закрытия ведущим).
   */
  async reopenSession(sessionId: string, hostSecret: string): Promise<GameSession> {
    const session = await this.assertHostSecret(sessionId, hostSecret);
    if (!session.endedAt) {
      throw DomainError.conflict('session already open');
    }

    await this.sessionAnswers
      .createQueryBuilder()
      .delete()
      .from(SessionAnswer)
      .where('session_id = :sid', { sid: sessionId })
      .execute();
    await this.sessionStakes
      .createQueryBuilder()
      .delete()
      .from(SessionRoundStake)
      .where('session_id = :sid', { sid: sessionId })
      .execute();
    await this.sessionQuestionStakes
      .createQueryBuilder()
      .delete()
      .from(SessionQuestionStake)
      .where('session_id = :sid', { sid: sessionId })
      .execute();

    await this.runs
      .createQueryBuilder()
      .update(QuizRun)
      .set({ endedAt: new Date() })
      .where('"session_id" = :sid AND "ended_at" IS NULL', { sid: sessionId })
      .execute();

    session.endedAt = null;
    session.phase = SessionPhase.Lobby;
    session.currentRoundId = null;
    session.currentQuestionId = null;
    session.phaseDeadlineAt = null;
    session.startedAt = null;
    session.isPaused = false;
    session.pausedRemainingMs = null;

    const saved = await this.sessions.save(session);
    this.events.emitSessionUpdate(saved);
    const lobbyPlayers = await this.listLobbyPlayers(sessionId);
    await this.events.emitPlayersUpdate(sessionId, lobbyPlayers);
    return saved;
  }

  async claimVipIfEmpty(sessionId: string, playerId: string): Promise<void> {
    await this.sessions
      .createQueryBuilder()
      .update(GameSession)
      .set({ vipPlayerId: playerId })
      .where('id = :sid AND vip_player_id IS NULL', { sid: sessionId })
      .execute();
  }

  async promoteVipIfNeeded(sessionId: string, leavingPlayerId: string): Promise<void> {
    const session = await this.findSession(sessionId);
    if (!session || session.vipPlayerId !== leavingPlayerId) return;
    const connected = await this.listLobbyPlayers(sessionId);
    const nextId = connected[0]?.id ?? null;
    await this.sessions
      .createQueryBuilder()
      .update(GameSession)
      .set({ vipPlayerId: nextId })
      .where('id = :sid', { sid: sessionId })
      .execute();
  }

  async setVip(sessionId: string, playerId: string): Promise<GameSession> {
    const session = await this.findSession(sessionId);
    if (!session) throw DomainError.notFound('session');
    if (session.phase !== SessionPhase.Lobby) {
      throw DomainError.illegalState('vip reassign only in lobby');
    }
    const player = await this.findPlayerById(playerId);
    if (!player) throw DomainError.notFound('player');
    if (player.sessionId !== session.id) throw DomainError.forbidden('player not in this session');
    if (!player.isConnected) throw DomainError.forbidden('player not connected');
    session.vipPlayerId = player.id;
    const saved = await this.sessions.save(session);
    this.events.emitSessionUpdate(saved);
    const players = await this.listLobbyPlayers(sessionId);
    await this.events.emitPlayersUpdate(sessionId, players);
    return saved;
  }

  async assertCurrentVip(sessionId: string, playerId: string): Promise<void> {
    const session = await this.findSession(sessionId);
    if (!session) throw DomainError.notFound('session');
    if (session.vipPlayerId !== playerId) throw DomainError.forbidden('not vip');
  }

  async assertNotPaused(sessionId: string): Promise<void> {
    const session = await this.findSession(sessionId);
    if (!session) throw DomainError.notFound('session');
    if (session.isPaused) throw DomainError.illegalState('session is paused');
  }
}
