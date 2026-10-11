import 'dotenv/config';
import { UseGuards, UsePipes, Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SessionEventsService } from '../realtime/session-events.service';
import { SessionService } from '../session/session.service';
import { GameFlowService } from '../game-flow/game-flow.service';
import { AnswerService } from '../answer/answer.service';
import { DomainError } from '../common/domain-error';
import { AnswerSubmission } from '../domain/policies/answer-grader';
import { QuestionType, SessionPhase } from '../common/enums';
import { toPublicPlayerState, toPublicSessionState } from '../session/session-state.util';
import { socketSessionId } from './ws-role.util';
import { WsHostGuard, WsPlayerGuard, WsSessionMemberGuard } from './ws-role.guards';
import { corsOriginFromEnv } from '../config/cors.util';
import { gameWsValidationPipe } from './game-ws-validation.pipe';
import { PlaceStakeWsDto } from './dto/place-stake.ws.dto';
import { SubmitAnswerWsDto } from './dto/submit-answer.ws.dto';
import { QuestionViewWsDto } from './dto/question-view.ws.dto';
import { KickPlayerWsDto } from './dto/kick-player.ws.dto';
import { SetVipWsDto } from './dto/set-vip.ws.dto';
import { LeaderboardViewWsDto } from './dto/leaderboard-view.ws.dto';
import { StartNextQuizWsDto } from './dto/start-next-quiz.ws.dto';
import { MetricsService } from '../observability/metrics.service';
import { QuestionView, QuestionViewService } from '../quiz/question-view.service';
import { questionHasExplanationVideo, questionHasListenMedia } from '../quiz/listen-media';
import { SessionAnswer } from '../entities/session-answer.entity';
import { SessionRoundStake } from '../entities/session-round-stake.entity';
import { SessionQuestionStake } from '../entities/session-question-stake.entity';
import { RevisionLayoutService } from '../quiz/revision-layout.service';
import { DisputeService } from '../dispute/dispute.service';
import { DisputeStartWsDto } from './dto/dispute-start.ws.dto';
import { DisputeVoteWsDto } from './dto/dispute-vote.ws.dto';
import { SetAvatarWsDto } from './dto/set-avatar.ws.dto';

export type GameWsHandshakeAuth = {
  sessionId: string;
  hostSecret?: string;
  reconnectToken?: string;
};

function wrap(err: unknown): WsException {
  if (err instanceof DomainError) {
    return new WsException({ code: err.code, message: err.message });
  }
  if (err instanceof WsException) return err;
  return new WsException({ code: 'INTERNAL', message: String(err) });
}

@WebSocketGateway({
  namespace: '/game',
  cors: {
    origin: corsOriginFromEnv(),
    credentials: true,
  },
})
export class GameGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(GameGateway.name);

  /** Несколько вкладок host = несколько сокетов; комнату закрываем только когда не осталось ни одного. */
  private readonly hostSocketIdsBySession = new Map<string, Set<string>>();

  /** Последнее сокет-соединение на игрока: при новом подключении старое отключается. */
  private readonly socketByPlayerId = new Map<string, Socket>();

  constructor(
    private readonly events: SessionEventsService,
    private readonly sessions: SessionService,
    private readonly flow: GameFlowService,
    private readonly answers: AnswerService,
    private readonly questionView: QuestionViewService,
    private readonly metrics: MetricsService,
    @InjectRepository(SessionAnswer)
    private readonly sessionAnswers: Repository<SessionAnswer>,
    @InjectRepository(SessionRoundStake)
    private readonly roundStakes: Repository<SessionRoundStake>,
    @InjectRepository(SessionQuestionStake)
    private readonly questionStakes: Repository<SessionQuestionStake>,
    private readonly layoutSvc: RevisionLayoutService,
    private readonly disputes: DisputeService,
  ) {}

  private wsLogFields(client?: Socket): Record<string, unknown> {
    if (!client) return { socketId: null, sessionId: null, playerId: null, role: null };
    const data = client.data as { sessionId?: string; playerId?: string; role?: string } | undefined;
    return {
      socketId: client.id,
      sessionId: data?.sessionId,
      playerId: data?.playerId,
      role: data?.role,
    };
  }

  private failHandshake(
    socket: Socket,
    next: (err?: Error) => void,
    reason: string,
    message: string,
  ): void {
    this.metrics.wsHandshakeFailTotal.inc({ reason });
    const auth = socket.handshake.auth as GameWsHandshakeAuth | undefined;
    this.logger.warn(
      { socketId: socket.id, sessionId: auth?.sessionId, reason },
      `ws handshake rejected: ${message}`,
    );
    next(new Error(message));
  }

  afterInit(server: Server): void {
    this.events.attachServer(server);
    server.use((socket, next) => {
      void this.runHandshake(socket as Socket, next);
    });
  }

  private async runHandshake(
    socket: Socket,
    next: (err?: Error) => void,
  ): Promise<void> {
    try {
      const auth = socket.handshake.auth as GameWsHandshakeAuth | undefined;
      const sessionId = auth?.sessionId;
      if (!sessionId || typeof sessionId !== 'string') {
        return this.failHandshake(socket, next, 'missing_session_id', 'sessionId required in handshake auth');
      }

      const hostSecret = auth.hostSecret;
      const reconnectToken = auth.reconnectToken;
      const hasHost = typeof hostSecret === 'string' && hostSecret.length > 0;
      const hasPlayer = typeof reconnectToken === 'string' && reconnectToken.length > 0;

      if (hasHost && hasPlayer) {
        return this.failHandshake(
          socket,
          next,
          'ambiguous_secrets',
          'provide either hostSecret or reconnectToken, not both',
        );
      }

      if (hasHost) {
        await this.sessions.assertHost(sessionId, hostSecret!);
        socket.data.role = 'host';
        socket.data.sessionId = sessionId;
        delete (socket.data as { playerId?: string }).playerId;
        next();
        return;
      }

      if (hasPlayer) {
        const { player } = await this.sessions.reconnect(sessionId, reconnectToken!);
        socket.data.role = 'player';
        socket.data.sessionId = sessionId;
        socket.data.playerId = player.id;
        next();
        return;
      }

      return this.failHandshake(
        socket,
        next,
        'missing_secret',
        'hostSecret or reconnectToken required in handshake auth',
      );
    } catch (e) {
      const msg = e instanceof DomainError ? e.message : String(e);
      this.metrics.wsHandshakeFailTotal.inc({
        reason: e instanceof DomainError ? 'domain_error' : 'internal',
      });
      this.logger.warn(
        {
          socketId: socket.id,
          sessionId: (socket.handshake.auth as GameWsHandshakeAuth | undefined)?.sessionId,
          err: msg,
        },
        'ws handshake exception',
      );
      next(new Error(msg));
    }
  }

  async handleConnection(client: Socket): Promise<void> {
    try {
      const sid = client.data.sessionId;
      const role = client.data.role;
      if (!sid || (role !== 'host' && role !== 'player')) return;

      await client.join(this.events.sessionRoom(sid));
      const session = await this.sessions.findSession(sid);
      if (!session) {
        this.logger.warn({ ...this.wsLogFields(client) }, 'ws connect: session not found');
        client.disconnect(true);
        return;
      }
      if (session.endedAt) {
        this.logger.warn({ ...this.wsLogFields(client) }, 'ws connect: session ended');
        client.disconnect(true);
        return;
      }

      if (role === 'host') {
        if (!this.hostSocketIdsBySession.has(sid)) {
          this.hostSocketIdsBySession.set(sid, new Set());
        }
        this.hostSocketIdsBySession.get(sid)!.add(client.id);
      }

      if (role === 'player' && client.data.playerId) {
        this.replacePlayerSocket(client.data.playerId, client);
        const player = await this.sessions.findPlayerById(client.data.playerId);
        if (!player || player.sessionId !== sid) {
          this.logger.warn({ ...this.wsLogFields(client) }, 'ws connect: player invalid');
          client.disconnect(true);
          return;
        }
        client.emit('session_ready', {
          role: 'player' as const,
          playerId: player.id,
          session: toPublicSessionState(session),
          player: toPublicPlayerState(player, session.vipPlayerId),
        });
      } else {
        client.emit('session_ready', {
          role: 'host' as const,
          session: toPublicSessionState(session),
        });
        const lobbyPlayers = await this.sessions.listLobbyPlayers(sid);
        client.emit('players_update', {
          players: lobbyPlayers.map((p) => toPublicPlayerState(p, session.vipPlayerId)),
        });
      }

      this.metrics.wsConnectTotal.inc({ role: role as 'host' | 'player' });
      this.logger.log(
        { ...this.wsLogFields(client), event: 'ws_session_ready' },
        'ws connected and session_ready sent',
      );
    } catch (err) {
      this.logger.warn({ ...this.wsLogFields(client), err }, 'ws handleConnection failed');
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    const role = client.data.role;
    if (role === 'host' || role === 'player') {
      this.metrics.wsDisconnectTotal.inc({ role });
      this.logger.log({ ...this.wsLogFields(client), event: 'ws_disconnect' }, 'ws disconnected');
    }
    const sid = client.data.sessionId as string | undefined;
    if (role === 'host' && sid) {
      const hostSet = this.hostSocketIdsBySession.get(sid);
      if (hostSet) {
        hostSet.delete(client.id);
        if (hostSet.size === 0) {
          this.hostSocketIdsBySession.delete(sid);
        }
      } else {
      }
      return;
    }
    const pid = client.data.playerId;
    if (role === 'player' && pid && client.data.sessionId) {
      // Only mark offline when this socket is still the active one for the player.
      // replacePlayerSocket() disconnects a superseded tab without touching DB state.
      if (this.socketByPlayerId.get(pid) === client) {
        this.socketByPlayerId.delete(pid);
        void this.sessions.markPlayerDisconnected(client.data.sessionId, pid);
      }
    }
  }

  private replacePlayerSocket(playerId: string, client: Socket): void {
    const prev = this.socketByPlayerId.get(playerId);
    if (prev && prev.id !== client.id) {
      prev.disconnect(true);
    }
    this.socketByPlayerId.set(playerId, client);
    client.data.playerId = playerId;
  }

  private async runHostCommand(
    client: Socket | undefined,
    event: string,
    fn: () => Promise<unknown>,
  ): Promise<{ ok: boolean }> {
    const ctx = this.wsLogFields(client);
    this.logger.log({ ...ctx, event }, 'host command');
    try {
      await fn();
      this.metrics.hostCommandTotal.inc({ event, result: 'ok' });
      return { ok: true };
    } catch (e) {
      this.metrics.hostCommandTotal.inc({ event, result: 'error' });
      this.logger.warn(
        { ...ctx, event, err: e instanceof Error ? e.message : String(e) },
        'host command failed',
      );
      throw wrap(e);
    }
  }

  @UseGuards(WsHostGuard)
  @SubscribeMessage('host_start_game')
  async hostStart(@ConnectedSocket() client: Socket): Promise<{ ok: boolean }> {
    return this.runHostCommand(client, 'host_start_game', () =>
      this.flow.startGame(socketSessionId(client)),
    );
  }

  @UseGuards(WsHostGuard)
  @UsePipes(gameWsValidationPipe)
  @SubscribeMessage('host_set_vip')
  async hostSetVip(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: SetVipWsDto,
  ): Promise<{ ok: boolean }> {
    return this.runHostCommand(client, 'host_set_vip', () =>
      this.sessions.setVip(socketSessionId(client), body.playerId),
    );
  }

  @UseGuards(WsHostGuard)
  @SubscribeMessage('host_toggle_pause')
  async hostTogglePause(@ConnectedSocket() client: Socket): Promise<{ ok: boolean }> {
    return this.runHostCommand(client, 'host_toggle_pause', () =>
      this.flow.togglePause(socketSessionId(client)),
    );
  }

  @UseGuards(WsHostGuard)
  @SubscribeMessage('host_start_question_timer')
  async hostStartQuestionTimer(@ConnectedSocket() client: Socket): Promise<{ ok: boolean }> {
    return this.runHostCommand(client, 'host_start_question_timer', () =>
      this.flow.startQuestionAnswerTimer(socketSessionId(client)),
    );
  }

  @UseGuards(WsHostGuard)
  @SubscribeMessage('host_hold_question_timer')
  async hostHoldQuestionTimer(@ConnectedSocket() client: Socket): Promise<{ ok: boolean }> {
    return this.runHostCommand(client, 'host_hold_question_timer', () =>
      this.flow.holdQuestionAnswerTimer(socketSessionId(client)),
    );
  }

  @UseGuards(WsPlayerGuard)
  @SubscribeMessage('vip_start_game')
  async vipStartGame(@ConnectedSocket() client: Socket): Promise<{ ok: boolean }> {
    return this.runHostCommand(client, 'vip_start_game', async () => {
      const sid = socketSessionId(client);
      await this.sessions.assertCurrentVip(sid, client.data.playerId!);
      await this.flow.startGame(sid);
    });
  }

  @UseGuards(WsPlayerGuard)
  @SubscribeMessage('vip_toggle_pause')
  async vipTogglePause(@ConnectedSocket() client: Socket): Promise<{ ok: boolean }> {
    return this.runHostCommand(client, 'vip_toggle_pause', async () => {
      const sid = socketSessionId(client);
      await this.sessions.assertCurrentVip(sid, client.data.playerId!);
      await this.flow.togglePause(sid);
    });
  }

  @UseGuards(WsPlayerGuard)
  @SubscribeMessage('vip_toggle_question_video')
  async vipToggleQuestionVideo(@ConnectedSocket() client: Socket): Promise<{ ok: boolean }> {
    return this.runHostCommand(client, 'vip_toggle_question_video', async () => {
      const sid = socketSessionId(client);
      await this.sessions.assertCurrentVip(sid, client.data.playerId!);
      const session = await this.sessions.findSession(sid);
      if (!session?.currentQuestionId) throw DomainError.illegalState('no question video');
      const phase = session.phase;
      const isReveal =
        phase === SessionPhase.AnswerReveal ||
        phase === SessionPhase.RoundReplay ||
        phase === SessionPhase.RoundSummary;
      const q = await this.questionView.getQuestionView(session.quizRevisionId, session.currentQuestionId, {
        includeCorrect: isReveal,
      });
      if (isReveal) {
        if (!questionHasExplanationVideo(q)) throw DomainError.illegalState('no question video');
      } else if (phase !== SessionPhase.Question || !questionHasListenMedia(q)) {
        throw DomainError.illegalState('no question video');
      }
      this.events.emitStageVideoControl(sid, { action: 'toggle' });
    });
  }

  @UseGuards(WsPlayerGuard)
  @SubscribeMessage('vip_start_question_timer')
  async vipStartQuestionTimer(@ConnectedSocket() client: Socket): Promise<{ ok: boolean }> {
    return this.runHostCommand(client, 'vip_start_question_timer', async () => {
      const sid = socketSessionId(client);
      await this.sessions.assertCurrentVip(sid, client.data.playerId!);
      await this.flow.startQuestionAnswerTimer(sid);
    });
  }

  @UseGuards(WsHostGuard)
  @UsePipes(gameWsValidationPipe)
  @SubscribeMessage('host_kick_player')
  async hostKickPlayer(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: KickPlayerWsDto,
  ): Promise<{ ok: boolean }> {
    return this.runHostCommand(client, 'host_kick_player', async () => {
      const sid = socketSessionId(client);
      await this.sessions.kickPlayer(sid, body.playerId);
      const sock = this.socketByPlayerId.get(body.playerId);
      if (sock) sock.disconnect(true);
    });
  }

  @UseGuards(WsHostGuard)
  @SubscribeMessage('host_return_to_lobby')
  async hostReturnToLobby(@ConnectedSocket() client: Socket): Promise<{ ok: boolean }> {
    return this.runHostCommand(client, 'host_return_to_lobby', () =>
      this.sessions.returnSessionToLobby(socketSessionId(client)),
    );
  }

  @UseGuards(WsHostGuard)
  @SubscribeMessage('host_close_room')
  async hostCloseRoom(@ConnectedSocket() client: Socket): Promise<{ ok: boolean }> {
    return this.runHostCommand(client, 'host_close_room', async () => {
      const sessionId = socketSessionId(client);
      await this.sessions.markSessionEnded(sessionId);
      const room = this.events.sessionRoom(sessionId);
      this.server.to(room).emit('session_abandoned', { reason: 'host_closed' });
      const hostSocketId = client.id;
      // Дать клиентам обработать session_update / session_abandoned до принудительного disconnect.
      await new Promise((resolve) => setTimeout(resolve, 250));
      // Отключаем игроков, но оставляем ведущего в host UI:
      // иначе ack на команду может не успеть дойти, и UI «залипает».
      const anyServer = this.server.in(room) as unknown as {
        except?: (socketId: string) => { disconnectSockets: (close?: boolean) => void };
        disconnectSockets?: (close?: boolean) => void;
      };
      if (typeof anyServer.except === 'function') {
        anyServer.except(hostSocketId).disconnectSockets(true);
      } else {
        // Fallback для версий без except(): вручную отключим всех в комнате, кроме инициатора.
        const sockets = await this.server.in(room).fetchSockets();
        sockets.forEach((s) => {
          if (s.id !== hostSocketId) s.disconnect(true);
        });
      }
      this.hostSocketIdsBySession.delete(sessionId);
    });
  }

  @UseGuards(WsHostGuard)
  @SubscribeMessage('host_reveal_answer')
  async hostReveal(@ConnectedSocket() client: Socket): Promise<{ ok: boolean }> {
    return this.runHostCommand(client, 'host_reveal_answer', () =>
      this.flow.revealAnswer(socketSessionId(client)),
    );
  }

  @UseGuards(WsHostGuard)
  @SubscribeMessage('host_proceed_after_reveal')
  async hostProceed(@ConnectedSocket() client: Socket): Promise<{ ok: boolean }> {
    return this.runHostCommand(client, 'host_proceed_after_reveal', () =>
      this.flow.proceedAfterReveal(socketSessionId(client)),
    );
  }

  @UseGuards(WsHostGuard)
  @SubscribeMessage('host_continue_leaderboard')
  async hostLeaderboard(@ConnectedSocket() client: Socket): Promise<{ ok: boolean }> {
    return this.runHostCommand(client, 'host_continue_leaderboard', () =>
      this.flow.continueFromLeaderboard(socketSessionId(client)),
    );
  }

  @UseGuards(WsHostGuard)
  @SubscribeMessage('host_continue_round_summary')
  async hostContinueRoundSummary(@ConnectedSocket() client: Socket): Promise<{ ok: boolean }> {
    return this.runHostCommand(client, 'host_continue_round_summary', () =>
      this.flow.continueAfterRoundSummary(socketSessionId(client)),
    );
  }

  @UseGuards(WsHostGuard)
  @UsePipes(gameWsValidationPipe)
  @SubscribeMessage('host_start_next_quiz')
  async hostStartNextQuiz(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: StartNextQuizWsDto,
  ): Promise<{ ok: boolean; runNo: number }> {
    const ctx = this.wsLogFields(client);
    const event = 'host_start_next_quiz';
    this.logger.log({ ...ctx, event, quizId: body.quizId }, 'host command');
    try {
      await this.sessions.assertNotPaused(socketSessionId(client));
      const { runNo } = await this.sessions.startNextQuiz(socketSessionId(client), body.quizId);
      this.metrics.hostCommandTotal.inc({ event, result: 'ok' });
      return { ok: true, runNo };
    } catch (e) {
      this.metrics.hostCommandTotal.inc({ event, result: 'error' });
      this.logger.warn(
        { ...ctx, event, quizId: body.quizId, err: e instanceof Error ? e.message : String(e) },
        'host command failed',
      );
      throw wrap(e);
    }
  }

  @UseGuards(WsSessionMemberGuard)
  @UsePipes(gameWsValidationPipe)
  @SubscribeMessage('question_view')
  async questionViewEvent(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: QuestionViewWsDto,
  ) {
    const ctx = this.wsLogFields(client);
    try {
      const sessionId = socketSessionId(client);
      let session = await this.sessions.findSession(sessionId);
      if (!session) throw DomainError.notFound('session');
      // Второе чтение снижает шанс устаревшей фазы сразу после перехода question → answer_reveal.
      const sessionAgain = await this.sessions.findSession(sessionId);
      if (sessionAgain) session = sessionAgain;
      const qid = body.questionId ?? session.currentQuestionId;
      if (!qid) throw DomainError.illegalState('no current question');

      const includeCorrect =
        client.data.role === 'host' ||
        session.phase === SessionPhase.AnswerReveal ||
        session.phase === SessionPhase.RoundReplay ||
        session.phase === SessionPhase.RoundSummary;
      const q = await this.questionView.getQuestionView(session.quizRevisionId, qid, {
        includeCorrect,
        includeStageLayout: client.data.role === 'host',
      });

      // playerAnswer + betting: allow UI to restore state after refresh
      if (client.data.role === 'player') {
        const playerId = client.data.playerId as string | undefined;
        if (playerId) {
          const player = await this.sessions.findPlayerById(playerId);
          if (player && player.sessionId === sessionId) {
            q.playerScore = player.score;
            if (q.bettingScope === 'round') {
              const stakeRow = await this.roundStakes.findOne({
                where: { sessionId, playerId, roundId: q.roundId },
              });
              q.playerStake = stakeRow != null ? stakeRow.stake : null;
              q.roundStake = q.playerStake;
            } else if (q.bettingScope === 'question') {
              const stakeRow = await this.questionStakes.findOne({
                where: { sessionId, playerId, questionId: q.id },
              });
              q.playerStake = stakeRow != null ? stakeRow.stake : null;
              q.roundStake = null;
            } else {
              q.playerStake = null;
              q.roundStake = null;
            }
          }
          const ans = await this.sessionAnswers.findOne({
            where: { sessionId, playerId, questionId: qid },
          });
          if (ans) {
            let selected: string[] = [];
            try {
              selected = JSON.parse(ans.selectedOptionIds || '[]');
              if (!Array.isArray(selected)) selected = [];
            } catch (_) {
              selected = [];
            }
            const pa: {
              selectedOptionIds: string[];
              textAnswer: string | null;
              isCorrect: boolean | null;
              matchOrder?: number[];
            } = {
              selectedOptionIds: selected.filter((x) => typeof x === 'string'),
              textAnswer: ans.textAnswer ?? null,
              isCorrect: ans.isCorrect ?? null,
            };
            if (q.type === QuestionType.Matching && ans.textAnswer) {
              try {
                const p = JSON.parse(ans.textAnswer) as { match?: unknown };
                if (p && Array.isArray(p.match)) {
                  const mo = p.match.filter((x): x is number => Number.isFinite(x) && Number.isInteger(x));
                  if (mo.length) pa.matchOrder = mo;
                }
              } catch (_) {
                /* ignore */
              }
            }
            (q as any).playerAnswer = pa;
          }
        }
      }
      this.logger.log({ ...ctx, event: 'question_view', questionId: qid }, 'question view');
      return { ok: true, question: q };
    } catch (e) {
      this.logger.warn(
        { ...ctx, event: 'question_view', err: e instanceof Error ? e.message : String(e) },
        'question_view failed',
      );
      throw wrap(e);
    }
  }

  @UseGuards(WsSessionMemberGuard)
  @SubscribeMessage('leaderboard')
  async leaderboard(@ConnectedSocket() client: Socket) {
    const ctx = this.wsLogFields(client);
    try {
      const rows = await this.flow.leaderboard(socketSessionId(client));
      this.logger.log({ ...ctx, event: 'leaderboard', count: rows.length }, 'leaderboard fetched');
      return {
        ok: true,
        rows: rows.map((p) => ({
          playerId: p.id,
          displayName: p.displayName,
          score: p.score,
        })),
      };
    } catch (e) {
      this.logger.warn({ ...ctx, err: e instanceof Error ? e.message : String(e) }, 'leaderboard failed');
      throw wrap(e);
    }
  }

  @UseGuards(WsSessionMemberGuard)
  @UsePipes(gameWsValidationPipe)
  @SubscribeMessage('leaderboard_view')
  async leaderboardView(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: LeaderboardViewWsDto,
  ) {
    const ctx = this.wsLogFields(client);
    try {
      const sessionId = socketSessionId(client);
      const session = await this.sessions.findSession(sessionId);
      if (!session) throw DomainError.notFound('session');

      const kind = body.kind || 'round';
      const roundId = kind === 'round' ? (body.roundId ?? session.currentRoundId) : null;

      const rows = await this.flow.leaderboardDetailed(sessionId, { roundId });
      const top3 = [...rows]
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return a.displayName.toLowerCase().localeCompare(b.displayName.toLowerCase());
        })
        .slice(0, 3);

      this.logger.log({ ...ctx, event: 'leaderboard_view', kind, roundId, count: rows.length }, 'leaderboard view');
      return { ok: true, kind, roundId, top3, rows };
    } catch (e) {
      this.logger.warn({ ...ctx, err: e instanceof Error ? e.message : String(e) }, 'leaderboard_view failed');
      throw wrap(e);
    }
  }

  @UseGuards(WsSessionMemberGuard)
  @SubscribeMessage('round_summary_view')
  async roundSummaryView(@ConnectedSocket() client: Socket) {
    const ctx = this.wsLogFields(client);
    try {
      const sessionId = socketSessionId(client);
      const session = await this.sessions.findSession(sessionId);
      if (!session) throw DomainError.notFound('session');
      const rid = session.currentRoundId;
      if (!rid) throw DomainError.illegalState('no current round');

      const layout = await this.layoutSvc.loadLayout(session.quizRevisionId);
      const rl = layout.rounds.find((r) => r.round.id === rid);
      const ids = rl?.questionIds ?? [];

      const questions: QuestionView[] = [];
      for (const qid of ids) {
        const q = await this.questionView.getQuestionView(session.quizRevisionId, qid, {
          includeCorrect: true,
          includeStageLayout: client.data.role === 'host',
        });
        questions.push(q);
      }
      this.logger.log({ ...ctx, event: 'round_summary_view', count: questions.length }, 'round summary view');
      return { ok: true, roundId: rid, questions };
    } catch (e) {
      this.logger.warn({ ...ctx, err: e instanceof Error ? e.message : String(e) }, 'round_summary_view failed');
      throw wrap(e);
    }
  }

  @UseGuards(WsPlayerGuard)
  @UsePipes(gameWsValidationPipe)
  @SubscribeMessage('place_stake')
  async placeStake(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: PlaceStakeWsDto,
  ): Promise<{ ok: boolean }> {
    const ctx = this.wsLogFields(client);
    try {
      const sessionId = socketSessionId(client);
      const playerId = client.data.playerId!;
      await this.flow.placeStake(sessionId, playerId, {
        roundId: body.roundId,
        questionId: body.questionId,
        stake: body.stake,
      });
      this.logger.log(
        {
          ...ctx,
          event: 'place_stake',
          roundId: body.roundId,
          questionId: body.questionId,
          stake: body.stake,
        },
        'stake placed',
      );
      return { ok: true };
    } catch (e) {
      this.logger.warn({ ...ctx, event: 'place_stake', err: e instanceof Error ? e.message : String(e) }, 'place_stake failed');
      throw wrap(e);
    }
  }

  @UseGuards(WsPlayerGuard)
  @UsePipes(gameWsValidationPipe)
  @SubscribeMessage('submit_answer')
  async submitAnswer(@ConnectedSocket() client: Socket, @MessageBody() body: SubmitAnswerWsDto) {
    const ctx = this.wsLogFields(client);
    try {
      const sessionId = socketSessionId(client);
      const playerId = client.data.playerId!;
      const submission: AnswerSubmission = {
        selectedOptionIds: body.selectedOptionIds ?? [],
        textAnswer: body.textAnswer,
        matchOrder: body.matchOrder ?? null,
      };
      const rec = await this.answers.submitAnswer(sessionId, playerId, body.questionId, submission);
      this.metrics.submitAnswerTotal.inc({ result: 'ok' });
      this.logger.log(
        {
          ...ctx,
          event: 'submit_answer',
          questionId: body.questionId,
          answerId: rec.id,
          pointsAwarded: rec.pointsAwarded,
        },
        'submit_answer ok',
      );
      return {
        ok: true,
        answerId: rec.id,
        pointsAwarded: rec.pointsAwarded,
        isCorrect: rec.isCorrect,
      };
    } catch (e) {
      this.metrics.submitAnswerTotal.inc({ result: 'error' });
      this.logger.warn(
        { ...ctx, event: 'submit_answer', questionId: body.questionId, err: e instanceof Error ? e.message : String(e) },
        'submit_answer failed',
      );
      throw wrap(e);
    }
  }

  @UseGuards(WsPlayerGuard)
  @UsePipes(gameWsValidationPipe)
  @SubscribeMessage('player_set_avatar')
  async playerSetAvatar(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: SetAvatarWsDto,
  ): Promise<{ ok: boolean; avatarUrl: string }> {
    const ctx = this.wsLogFields(client);
    try {
      const sessionId = socketSessionId(client);
      const playerId = client.data.playerId!;
      const saved = await this.sessions.updatePlayerAvatar(sessionId, playerId, body.avatarUrl);
      this.logger.log({ ...ctx, event: 'player_set_avatar' }, 'player avatar updated');
      return { ok: true, avatarUrl: saved.avatarUrl || body.avatarUrl };
    } catch (e) {
      this.logger.warn(
        { ...ctx, event: 'player_set_avatar', err: e instanceof Error ? e.message : String(e) },
        'player_set_avatar failed',
      );
      throw wrap(e);
    }
  }

  @UseGuards(WsPlayerGuard)
  @UsePipes(gameWsValidationPipe)
  @SubscribeMessage('dispute_start')
  async disputeStart(@ConnectedSocket() client: Socket, @MessageBody() body: DisputeStartWsDto) {
    const ctx = this.wsLogFields(client);
    try {
      const sessionId = socketSessionId(client);
      const playerId = client.data.playerId!;
      const payload = await this.disputes.startDispute(sessionId, playerId, body.questionId);
      this.logger.log({ ...ctx, event: 'dispute_start', questionId: body.questionId }, 'dispute started');
      return { ok: true, dispute: payload };
    } catch (e) {
      this.logger.warn(
        { ...ctx, event: 'dispute_start', err: e instanceof Error ? e.message : String(e) },
        'dispute_start failed',
      );
      throw wrap(e);
    }
  }

  @UseGuards(WsPlayerGuard)
  @UsePipes(gameWsValidationPipe)
  @SubscribeMessage('dispute_vote')
  async disputeVote(@ConnectedSocket() client: Socket, @MessageBody() body: DisputeVoteWsDto) {
    const ctx = this.wsLogFields(client);
    try {
      const playerId = client.data.playerId!;
      const payload = await this.disputes.vote(body.disputeId, playerId, body.approve);
      this.logger.log({ ...ctx, event: 'dispute_vote', disputeId: body.disputeId, approve: body.approve }, 'dispute vote');
      return { ok: true, dispute: payload };
    } catch (e) {
      this.logger.warn(
        { ...ctx, event: 'dispute_vote', err: e instanceof Error ? e.message : String(e) },
        'dispute_vote failed',
      );
      throw wrap(e);
    }
  }

  /** Хост и игрок: узнать, открыто ли оспаривание (для UI ведущего). */
  @UseGuards(WsSessionMemberGuard)
  @SubscribeMessage('dispute_state')
  async disputeState(@ConnectedSocket() client: Socket) {
    const ctx = this.wsLogFields(client);
    try {
      const sessionId = socketSessionId(client);
      const session = await this.sessions.findSession(sessionId);
      if (!session?.currentQuestionId) return { ok: true, dispute: null };
      const payload = await this.disputes.getOpenDisputePayload(sessionId, session.currentQuestionId);
      return { ok: true, dispute: payload };
    } catch (e) {
      this.logger.warn({ ...ctx, err: e instanceof Error ? e.message : String(e) }, 'dispute_state failed');
      throw wrap(e);
    }
  }
}
