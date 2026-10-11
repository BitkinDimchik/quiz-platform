import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AddressInfo } from 'net';
import { io, Socket as IoSocket } from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap/configure-app';
import { seedPublishedQuiz } from './helpers/seed-published-quiz';
import { User } from '../src/entities/user.entity';
import { GameSession } from '../src/entities/game-session.entity';
import { SessionPlayer } from '../src/entities/session-player.entity';
import { AdvanceMode, SessionPhase } from '../src/common/enums';
import { emitAck } from './helpers/ws-emit';

describe('Quiz game (e2e)', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let port: number;
  const sessionKey = process.env.QUIZ_SESSION_API_KEY!;

  async function listen(): Promise<void> {
    await app.listen(0);
    const addr = app.getHttpServer().address() as AddressInfo;
    port = addr.port;
  }

  function wsUrl(): string {
    return `http://127.0.0.1:${port}`;
  }

  type SessionReadyPayload = {
    role?: string;
    session?: { currentQuestionId?: string; phase?: string };
  };
  const readyBySocket = new WeakMap<IoSocket, SessionReadyPayload>();

  async function connectGameSocket(
    auth: Record<string, unknown>,
    extra?: { extraHeaders?: Record<string, string> },
  ): Promise<IoSocket> {
    return new Promise((resolve, reject) => {
      const socket = io(`${wsUrl()}/game`, {
        auth,
        transports: ['websocket'],
        ...extra,
      });
      const timer = setTimeout(() => {
        socket.close();
        reject(new Error('connect timeout'));
      }, 8000);
      socket.once('session_ready', (p: SessionReadyPayload) => {
        readyBySocket.set(socket, p ?? {});
        clearTimeout(timer);
        resolve(socket);
      });
      socket.once('connect_error', (err: Error) => {
        clearTimeout(timer);
        socket.close();
        reject(err);
      });
    });
  }

  function sessionReady(sock: IoSocket): SessionReadyPayload {
    return readyBySocket.get(sock) ?? {};
  }

  async function expectConnectError(auth: Record<string, unknown>): Promise<void> {
    await expect(connectGameSocket(auth)).rejects.toBeDefined();
  }

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    dataSource = app.get(DataSource);
    await listen();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET /health без ключа', async () => {
    await request(app.getHttpServer()).get('/health').expect(200);
  });

  it('GET /metrics: Prometheus для внутреннего scraping', async () => {
    const res = await request(app.getHttpServer()).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.text).toContain('quiz_ws_connect_total');
    expect(res.text).toContain('quiz_submit_answer_total');
  });

  it('POST /api/session/start без API key → 401', async () => {
    await request(app.getHttpServer())
      .post('/api/session/start')
      .send({ quizId: '00000000-0000-0000-0000-000000000000' })
      .expect(401);
  });

  it('CORS: preflight с разрешённого origin', async () => {
    const res = await request(app.getHttpServer())
      .options('/api/session/join')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'POST');

    expect([200, 204]).toContain(res.status);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('CORS: запрещённый origin не получает ACAO', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/session/start')
      .set('Origin', 'http://evil.test')
      .set('X-Api-Key', sessionKey)
      .send({ quizId: '00000000-0000-0000-0000-000000000000' });

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('start → join (успех), неверный roomCode', async () => {
    const { quizId } = await seedPublishedQuiz(dataSource);
    const start = await request(app.getHttpServer())
      .post('/api/session/start')
      .set('X-Api-Key', sessionKey)
      .send({ quizId, advanceMode: AdvanceMode.Manual })
      .expect(200);

    const { roomCode } = start.body;
    expect(roomCode).toBeTruthy();

    await request(app.getHttpServer())
      .post('/api/session/join')
      .set('X-Api-Key', sessionKey)
      .send({ roomCode, displayName: 'P1' })
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/session/join')
      .set('X-Api-Key', sessionKey)
      .send({ roomCode: 'ZZZZZZZZ', displayName: 'X' })
      .expect(404);
  });

  it('WS: host handshake ok, player по reconnectToken', async () => {
    const { quizId } = await seedPublishedQuiz(dataSource);
    const start = await request(app.getHttpServer())
      .post('/api/session/start')
      .set('X-Api-Key', sessionKey)
      .send({ quizId, advanceMode: AdvanceMode.Manual })
      .expect(200);
    const { sessionId, hostSecret, roomCode } = start.body;

    const join = await request(app.getHttpServer())
      .post('/api/session/join')
      .set('X-Api-Key', sessionKey)
      .send({ roomCode, displayName: 'WS1' })
      .expect(200);
    const { reconnectToken } = join.body;

    const hostSock = await connectGameSocket({
      sessionId,
      hostSecret,
    });
    expect(sessionReady(hostSock).role).toBe('host');
    hostSock.close();

    const playerSock = await connectGameSocket({
      sessionId,
      reconnectToken,
    });
    expect(sessionReady(playerSock).role).toBe('player');
    playerSock.close();
  });

  it('WS: неверный reconnectToken — connect_error', async () => {
    const { quizId } = await seedPublishedQuiz(dataSource);
    const start = await request(app.getHttpServer())
      .post('/api/session/start')
      .set('X-Api-Key', sessionKey)
      .send({ quizId, advanceMode: AdvanceMode.Manual })
      .expect(200);
    const { sessionId } = start.body;

    await expectConnectError({ sessionId, reconnectToken: 'invalid-token-xxx' });
  });

  it('WS: чужой Origin — отклонение', async () => {
    const { quizId } = await seedPublishedQuiz(dataSource);
    const start = await request(app.getHttpServer())
      .post('/api/session/start')
      .set('X-Api-Key', sessionKey)
      .send({ quizId, advanceMode: AdvanceMode.Manual })
      .expect(200);
    const { sessionId, hostSecret } = start.body;

    await expect(
      connectGameSocket(
        { sessionId, hostSecret },
        { extraHeaders: { Origin: 'http://evil.test' } },
      ),
    ).rejects.toBeDefined();
  });

  it('submit_answer: успех и повторный ответ → ошибка ack', async () => {
    const { quizId } = await seedPublishedQuiz(dataSource);
    const start = await request(app.getHttpServer())
      .post('/api/session/start')
      .set('X-Api-Key', sessionKey)
      .send({ quizId, advanceMode: AdvanceMode.Manual })
      .expect(200);
    const { sessionId, hostSecret, roomCode } = start.body;

    const join = await request(app.getHttpServer())
      .post('/api/session/join')
      .set('X-Api-Key', sessionKey)
      .send({ roomCode, displayName: 'Ans' })
      .expect(200);
    const { reconnectToken } = join.body;

    const hostSock = await connectGameSocket({ sessionId, hostSecret });

    const startGameAck = await emitAck<{ ok: boolean }>(hostSock, 'host_start_game', {});
    expect(startGameAck.ok).toBe(true);
    await dataSource.getRepository(GameSession).update(
      { id: sessionId },
      { phase: SessionPhase.Question },
    );

    const playerSock = await connectGameSocket({ sessionId, reconnectToken });
    const qid = sessionReady(playerSock).session?.currentQuestionId;
    expect(qid).toBeTruthy();

    const optRes = await dataSource.query<{ id: string }[]>(
      `SELECT id FROM question_options WHERE question_id = ? ORDER BY position ASC LIMIT 1`,
      [qid],
    );
    const correctOptId = optRes[0]?.id;
    expect(correctOptId).toBeTruthy();

    const submitOk = await emitAck<{ ok: boolean }>(playerSock, 'submit_answer', {
      questionId: qid,
      selectedOptionIds: [correctOptId],
    });
    expect(submitOk.ok).toBe(true);

    await expect(
      emitAck(playerSock, 'submit_answer', {
        questionId: qid,
        selectedOptionIds: [correctOptId],
      }),
    ).rejects.toBeDefined();

    hostSock.close();
    playerSock.close();
  });

  it('submit_answer: после дедлайна (automatic)', async () => {
    const { quizId } = await seedPublishedQuiz(dataSource);
    const start = await request(app.getHttpServer())
      .post('/api/session/start')
      .set('X-Api-Key', sessionKey)
      .send({ quizId, advanceMode: AdvanceMode.Automatic })
      .expect(200);
    const { sessionId, hostSecret, roomCode } = start.body;

    const join = await request(app.getHttpServer())
      .post('/api/session/join')
      .set('X-Api-Key', sessionKey)
      .send({ roomCode, displayName: 'Late' })
      .expect(200);
    const { reconnectToken } = join.body;

    const hostSock = await connectGameSocket({ sessionId, hostSecret });
    await emitAck(hostSock, 'host_start_game', {});

    const playerSock = await connectGameSocket({ sessionId, reconnectToken });
    const qid = sessionReady(playerSock).session?.currentQuestionId!;

    const optRes = await dataSource.query<{ id: string }[]>(
      `SELECT id FROM question_options WHERE question_id = ? ORDER BY position ASC LIMIT 1`,
      [qid],
    );
    const correctOptId = optRes[0]!.id;

    await dataSource.getRepository(GameSession).update(
      { id: sessionId },
      {
        phase: SessionPhase.Question,
        phaseDeadlineAt: new Date(Date.now() - 60_000),
      },
    );

    await expect(
      emitAck(playerSock, 'submit_answer', {
        questionId: qid,
        selectedOptionIds: [correctOptId],
      }),
    ).rejects.toBeDefined();

    hostSock.close();
    playerSock.close();
  });

  it('submit_answer: неверная фаза (после reveal)', async () => {
    const { quizId } = await seedPublishedQuiz(dataSource);
    const start = await request(app.getHttpServer())
      .post('/api/session/start')
      .set('X-Api-Key', sessionKey)
      .send({ quizId, advanceMode: AdvanceMode.Manual })
      .expect(200);
    const { sessionId, hostSecret, roomCode } = start.body;

    const join = await request(app.getHttpServer())
      .post('/api/session/join')
      .set('X-Api-Key', sessionKey)
      .send({ roomCode, displayName: 'Ph' })
      .expect(200);
    const { reconnectToken } = join.body;

    const hostSock = await connectGameSocket({ sessionId, hostSecret });
    await emitAck(hostSock, 'host_start_game', {});
    await emitAck(hostSock, 'host_reveal_answer', {});

    const playerSock = await connectGameSocket({ sessionId, reconnectToken });
    const qid = sessionReady(playerSock).session?.currentQuestionId;
    expect(qid).toBeTruthy();

    const optRes = await dataSource.query<{ id: string }[]>(
      `SELECT id FROM question_options WHERE question_id = ? ORDER BY position ASC LIMIT 1`,
      [qid],
    );

    await expect(
      emitAck(playerSock, 'submit_answer', {
        questionId: qid,
        selectedOptionIds: [optRes[0]!.id],
      }),
    ).rejects.toBeDefined();

    hostSock.close();
    playerSock.close();
  });

  it('хост-команды: старт, reveal, proceed; неверная фаза для leaderboard', async () => {
    const { quizId } = await seedPublishedQuiz(dataSource);
    const start = await request(app.getHttpServer())
      .post('/api/session/start')
      .set('X-Api-Key', sessionKey)
      .send({ quizId, advanceMode: AdvanceMode.Manual })
      .expect(200);
    const { sessionId, hostSecret } = start.body;

    const hostSock = await connectGameSocket({ sessionId, hostSecret });

    await expect(emitAck(hostSock, 'host_reveal_answer', {})).rejects.toBeDefined();

    await emitAck(hostSock, 'host_start_game', {});
    await dataSource.getRepository(GameSession).update(
      { id: sessionId },
      { phase: SessionPhase.Question },
    );
    await emitAck(hostSock, 'host_reveal_answer', {});
    await emitAck(hostSock, 'host_proceed_after_reveal', {});

    await expect(emitAck(hostSock, 'host_continue_leaderboard', {})).rejects.toBeDefined();

    const lb = await emitAck<{ ok: boolean }>(hostSock, 'leaderboard', {});
    expect(lb.ok).toBe(true);

    hostSock.close();
  });

  it('host_proceed_after_reveal переводит следующий вопрос в фазу чтения', async () => {
    const { quizId } = await seedPublishedQuiz(dataSource, { questionCount: 2 });
    const start = await request(app.getHttpServer())
      .post('/api/session/start')
      .set('X-Api-Key', sessionKey)
      .send({ quizId, advanceMode: AdvanceMode.Manual })
      .expect(200);
    const { sessionId, hostSecret } = start.body;

    const hostSock = await connectGameSocket({ sessionId, hostSecret });

    await emitAck(hostSock, 'host_start_game', {});
    await dataSource.getRepository(GameSession).update(
      { id: sessionId },
      { phase: SessionPhase.Question },
    );
    await emitAck(hostSock, 'host_reveal_answer', {});
    await emitAck(hostSock, 'host_proceed_after_reveal', {});

    const row = await dataSource.getRepository(GameSession).findOne({ where: { id: sessionId } });
    expect(row?.phase).toBe(SessionPhase.QuestionRead);
    expect(row?.phaseDeadlineAt).toBeNull();

    hostSock.close();
  });

  it('REST: join с невалидным телом → 400 VALIDATION', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/session/join')
      .set('X-Api-Key', sessionKey)
      .send({ roomCode: 'AB', displayName: '' });
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('VALIDATION');
  });

  it('parallel host_start_game: одно успешное обновление, фаза консистентна', async () => {
    const { quizId } = await seedPublishedQuiz(dataSource);
    const start = await request(app.getHttpServer())
      .post('/api/session/start')
      .set('X-Api-Key', sessionKey)
      .send({ quizId, advanceMode: AdvanceMode.Manual })
      .expect(200);
    const { sessionId, hostSecret } = start.body;

    const a = await connectGameSocket({ sessionId, hostSecret });
    const b = await connectGameSocket({ sessionId, hostSecret });
    const results = await Promise.allSettled([
      emitAck(a, 'host_start_game', {}),
      emitAck(b, 'host_start_game', {}),
    ]);
    expect(results.filter((x) => x.status === 'fulfilled').length).toBe(1);
    expect(results.filter((x) => x.status === 'rejected').length).toBe(1);

    const row = await dataSource.getRepository(GameSession).findOne({ where: { id: sessionId } });
    expect(row?.phase).toBe(SessionPhase.QuizIntro);

    a.close();
    b.close();
  });

  it('WS: submit_answer с невалидным questionId', async () => {
    const { quizId } = await seedPublishedQuiz(dataSource);
    const start = await request(app.getHttpServer())
      .post('/api/session/start')
      .set('X-Api-Key', sessionKey)
      .send({ quizId, advanceMode: AdvanceMode.Manual })
      .expect(200);
    const { sessionId, hostSecret, roomCode } = start.body;

    const join = await request(app.getHttpServer())
      .post('/api/session/join')
      .set('X-Api-Key', sessionKey)
      .send({ roomCode, displayName: 'Val' })
      .expect(200);
    const { reconnectToken } = join.body;

    const hostSock = await connectGameSocket({ sessionId, hostSecret });
    await emitAck(hostSock, 'host_start_game', {});

    const playerSock = await connectGameSocket({ sessionId, reconnectToken });

    await expect(
      emitAck(playerSock, 'submit_answer', { questionId: 'not-a-uuid', selectedOptionIds: [] }),
    ).rejects.toBeDefined();

    hostSock.close();
    playerSock.close();
  });

  it('question_view: пояснение хосту есть, игроку до reveal нет', async () => {
    const proof = 'secret proof';
    const { quizId } = await seedPublishedQuiz(dataSource, { explanationText: proof });
    const start = await request(app.getHttpServer())
      .post('/api/session/start')
      .set('X-Api-Key', sessionKey)
      .send({ quizId, advanceMode: AdvanceMode.Manual })
      .expect(200);
    const { sessionId, hostSecret, roomCode } = start.body;

    const join = await request(app.getHttpServer())
      .post('/api/session/join')
      .set('X-Api-Key', sessionKey)
      .send({ roomCode, displayName: 'Exp' })
      .expect(200);
    const { reconnectToken } = join.body;

    const hostSock = await connectGameSocket({ sessionId, hostSecret });
    await emitAck(hostSock, 'host_start_game', {});

    const playerSock = await connectGameSocket({ sessionId, reconnectToken });

    type QView = {
      ok: boolean;
      question: {
        explanationText?: string | null;
        explanationImageUrl?: string | null;
      };
    };

    const playerBefore = await emitAck<QView>(playerSock, 'question_view', {});
    expect(playerBefore.ok).toBe(true);
    expect(playerBefore.question.explanationText).toBeUndefined();
    expect(playerBefore.question.explanationImageUrl).toBeUndefined();

    const hostBefore = await emitAck<QView>(hostSock, 'question_view', {});
    expect(hostBefore.ok).toBe(true);
    expect(hostBefore.question.explanationText).toBe(proof);
    expect(Object.prototype.hasOwnProperty.call(hostBefore.question, 'explanationText')).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(hostBefore.question, 'explanationImageUrl')).toBe(
      true,
    );
    expect(hostBefore.question.explanationImageUrl).toBeNull();

    await emitAck(hostSock, 'host_reveal_answer', {});

    const playerAfter = await emitAck<QView>(playerSock, 'question_view', {});
    expect(playerAfter.ok).toBe(true);
    expect(playerAfter.question.explanationText).toBe(proof);
    expect(Object.prototype.hasOwnProperty.call(playerAfter.question, 'explanationImageUrl')).toBe(
      true,
    );

    hostSock.close();
    playerSock.close();
  });

  async function editorAuth(): Promise<string> {
    const email = `ed-${Date.now()}@test.local`;
    const reg = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password: 'password1', displayName: 'Ed' })
      .expect(201);
    const token = reg.body.accessToken as string;
    expect(token).toBeTruthy();
    return token;
  }

  it('editor: persist explanation then GET builder payload', async () => {
    const token = await editorAuth();
    const auth = { Authorization: `Bearer ${token}` };
    const img = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';

    const created = await request(app.getHttpServer())
      .post('/api/quizzes')
      .set(auth)
      .send({ title: 'Explain quiz' })
      .expect(201);
    const quizId = created.body.quizId as string;

    const draft = await request(app.getHttpServer())
      .post('/api/quizzes/revisions/draft')
      .set(auth)
      .send({ quizId })
      .expect(201);
    const quizRevisionId = draft.body.quizRevisionId as string;

    const round = await request(app.getHttpServer())
      .post('/api/quizzes/rounds')
      .set(auth)
      .send({ quizRevisionId, position: 1, title: 'R1' })
      .expect(201);
    const roundId = round.body.roundId as string;

    await request(app.getHttpServer())
      .post('/api/quizzes/questions')
      .set(auth)
      .send({
        roundId,
        position: 1,
        type: 'single_choice',
        prompt: 'Q?',
        timeLimitSec: 15,
        basePoints: 1,
        explanationText: '  because  ',
        explanationImageUrl: img,
      })
      .expect(201);

    const got = await request(app.getHttpServer()).get(`/api/quizzes/${quizId}`).set(auth).expect(200);
    const q0 = got.body.rounds[0].questions[0];
    expect(q0.explanation).toEqual({ text: 'because', image: img });
  });

  it('editor: empty explanation stores nulls', async () => {
    const token = await editorAuth();
    const auth = { Authorization: `Bearer ${token}` };

    const created = await request(app.getHttpServer())
      .post('/api/quizzes')
      .set(auth)
      .send({ title: 'Empty explain' })
      .expect(201);
    const quizId = created.body.quizId as string;

    const draft = await request(app.getHttpServer())
      .post('/api/quizzes/revisions/draft')
      .set(auth)
      .send({ quizId })
      .expect(201);

    const round = await request(app.getHttpServer())
      .post('/api/quizzes/rounds')
      .set(auth)
      .send({ quizRevisionId: draft.body.quizRevisionId, position: 1, title: 'R1' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/quizzes/questions')
      .set(auth)
      .send({
        roundId: round.body.roundId,
        position: 1,
        type: 'single_choice',
        prompt: 'Q?',
        timeLimitSec: 15,
        basePoints: 1,
        explanationText: '   ',
        explanationImageUrl: null,
      })
      .expect(201);

    const got = await request(app.getHttpServer()).get(`/api/quizzes/${quizId}`).set(auth).expect(200);
    const exp = got.body.rounds[0].questions[0].explanation;
    expect(exp).toEqual({ text: '', image: null });
  });

  it('editor: explanationText too long → 400', async () => {
    const token = await editorAuth();
    const auth = { Authorization: `Bearer ${token}` };

    const created = await request(app.getHttpServer())
      .post('/api/quizzes')
      .set(auth)
      .send({ title: 'Long explain' })
      .expect(201);

    const draft = await request(app.getHttpServer())
      .post('/api/quizzes/revisions/draft')
      .set(auth)
      .send({ quizId: created.body.quizId })
      .expect(201);

    const round = await request(app.getHttpServer())
      .post('/api/quizzes/rounds')
      .set(auth)
      .send({ quizRevisionId: draft.body.quizRevisionId, position: 1, title: 'R1' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/quizzes/questions')
      .set(auth)
      .send({
        roundId: round.body.roundId,
        position: 1,
        type: 'single_choice',
        prompt: 'Q?',
        timeLimitSec: 15,
        basePoints: 1,
        explanationText: 'x'.repeat(10_001),
      })
      .expect(400);
  });

  async function startRoom(opts?: {
    advanceMode?: AdvanceMode;
    videoUrl?: string | null;
    audioUrl?: string | null;
  }) {
    const { quizId } = await seedPublishedQuiz(dataSource, {
      videoUrl: opts?.videoUrl,
      audioUrl: opts?.audioUrl,
    });
    const start = await request(app.getHttpServer())
      .post('/api/session/start')
      .set('X-Api-Key', sessionKey)
      .send({ quizId, advanceMode: opts?.advanceMode ?? AdvanceMode.Manual })
      .expect(200);
    return start.body as { sessionId: string; hostSecret: string; roomCode: string };
  }

  async function joinAs(roomCode: string, displayName: string) {
    const join = await request(app.getHttpServer())
      .post('/api/session/join')
      .set('X-Api-Key', sessionKey)
      .send({ roomCode, displayName })
      .expect(200);
    return join.body as { sessionId: string; playerId: string; reconnectToken: string };
  }

  async function hostSummary(sessionId: string, hostSecret: string) {
    const res = await request(app.getHttpServer())
      .get(`/api/session/${sessionId}/host-summary`)
      .set('X-Host-Secret', hostSecret)
      .expect(200);
    return res.body.session as {
      vipPlayerId?: string | null;
      isPaused?: boolean;
      pausedRemainingMs?: number | null;
      phase?: string;
      phaseDeadlineAt?: string | null;
    };
  }

  async function listPlayers(sessionId: string) {
    const res = await request(app.getHttpServer())
      .get(`/api/session/${sessionId}/players`)
      .expect(200);
    return res.body.players as Array<{ id: string; isVip?: boolean; displayName?: string }>;
  }

  async function waitReady(sock: IoSocket) {
    if (readyBySocket.has(sock)) return;
    await new Promise<void>((res) =>
      sock.once('session_ready', (p: SessionReadyPayload) => {
        readyBySocket.set(sock, p ?? {});
        res();
      }),
    );
  }

  describe('VIP player', () => {
    it('первый join — VIP, второй не крадёт', async () => {
      const { sessionId, hostSecret, roomCode } = await startRoom();
      const a = await joinAs(roomCode, 'A');
      const b = await joinAs(roomCode, 'B');
      const players = await listPlayers(sessionId);
      const rowA = players.find((p) => p.id === a.playerId);
      const rowB = players.find((p) => p.id === b.playerId);
      expect(rowA?.isVip).toBe(true);
      expect(rowB?.isVip).toBe(false);
      const sess = await hostSummary(sessionId, hostSecret);
      expect(sess.vipPlayerId).toBe(a.playerId);
    });

    it('host_set_vip в lobby на B; после старта ILLEGAL_STATE', async () => {
      const { sessionId, hostSecret, roomCode } = await startRoom();
      const a = await joinAs(roomCode, 'A');
      const b = await joinAs(roomCode, 'B');
      const hostSock = await connectGameSocket({ sessionId, hostSecret });
      await waitReady(hostSock);
      await emitAck(hostSock, 'host_set_vip', { playerId: b.playerId });
      expect((await hostSummary(sessionId, hostSecret)).vipPlayerId).toBe(b.playerId);
      await emitAck(hostSock, 'host_start_game', {});
      await expect(emitAck(hostSock, 'host_set_vip', { playerId: a.playerId })).rejects.toBeDefined();
      hostSock.close();
    });

    it('kick VIP → auto-next; kick last → null; next join VIP', async () => {
      const { sessionId, hostSecret, roomCode } = await startRoom();
      const a = await joinAs(roomCode, 'A');
      const b = await joinAs(roomCode, 'B');
      const hostSock = await connectGameSocket({ sessionId, hostSecret });
      await waitReady(hostSock);
      await emitAck(hostSock, 'host_kick_player', { playerId: a.playerId });
      expect((await hostSummary(sessionId, hostSecret)).vipPlayerId).toBe(b.playerId);
      await emitAck(hostSock, 'host_kick_player', { playerId: b.playerId });
      expect((await hostSummary(sessionId, hostSecret)).vipPlayerId).toBeNull();
      const c = await joinAs(roomCode, 'C');
      expect((await hostSummary(sessionId, hostSecret)).vipPlayerId).toBe(c.playerId);
      hostSock.close();
    });

    it('disconnect VIP mid-question → auto-next remaining', async () => {
      const { sessionId, hostSecret, roomCode } = await startRoom();
      const a = await joinAs(roomCode, 'A');
      const b = await joinAs(roomCode, 'B');
      const hostSock = await connectGameSocket({ sessionId, hostSecret });
      await waitReady(hostSock);
      await emitAck(hostSock, 'host_start_game', {});
      await dataSource.getRepository(GameSession).update({ id: sessionId }, { phase: SessionPhase.Question });
      const aSock = await connectGameSocket({ sessionId, reconnectToken: a.reconnectToken });
      await waitReady(aSock);
      aSock.close();
      await new Promise((r) => setTimeout(r, 300));
      expect((await hostSummary(sessionId, hostSecret)).vipPlayerId).toBe(b.playerId);
      hostSock.close();
    });

    it('reconnect когда VIP null → этот игрок VIP; бывший VIP не крадёт', async () => {
      const { sessionId, hostSecret, roomCode } = await startRoom();
      const a = await joinAs(roomCode, 'A');
      const b = await joinAs(roomCode, 'B');
      const hostSock = await connectGameSocket({ sessionId, hostSecret });
      await waitReady(hostSock);
      await emitAck(hostSock, 'host_set_vip', { playerId: b.playerId });
      const aSock = await connectGameSocket({ sessionId, reconnectToken: a.reconnectToken });
      await waitReady(aSock);
      aSock.close();
      await new Promise((r) => setTimeout(r, 200));
      await emitAck(hostSock, 'host_kick_player', { playerId: b.playerId });
      expect((await hostSummary(sessionId, hostSecret)).vipPlayerId).toBeNull();
      const aBack = await connectGameSocket({ sessionId, reconnectToken: a.reconnectToken });
      await waitReady(aBack);
      expect((await hostSummary(sessionId, hostSecret)).vipPlayerId).toBe(a.playerId);
      aBack.close();
      const bBack = await connectGameSocket({ sessionId, reconnectToken: b.reconnectToken });
      await waitReady(bBack);
      expect((await hostSummary(sessionId, hostSecret)).vipPlayerId).toBe(a.playerId);
      bBack.close();
      hostSock.close();
    });

    it('returnSessionToLobby keeps VIP and clears pause', async () => {
      const { sessionId, hostSecret, roomCode } = await startRoom({
        advanceMode: AdvanceMode.Automatic,
      });
      const a = await joinAs(roomCode, 'A');
      const hostSock = await connectGameSocket({ sessionId, hostSecret });
      await waitReady(hostSock);
      await emitAck(hostSock, 'host_start_game', {});
      await dataSource.getRepository(GameSession).update({ id: sessionId }, { phase: SessionPhase.Question });
      await emitAck(hostSock, 'host_toggle_pause', {});
      await emitAck(hostSock, 'host_return_to_lobby', {});
      const sess = await hostSummary(sessionId, hostSecret);
      expect(sess.vipPlayerId).toBe(a.playerId);
      expect(sess.isPaused).toBe(false);
      expect(sess.phase).toBe(SessionPhase.Lobby);
      hostSock.close();
    });

    it('non-VIP vip_start_game FORBIDDEN; VIP starts; leftover lobby pause SQL clears on start', async () => {
      const { sessionId, hostSecret, roomCode } = await startRoom();
      const a = await joinAs(roomCode, 'A');
      const b = await joinAs(roomCode, 'B');
      const hostSock = await connectGameSocket({ sessionId, hostSecret });
      await waitReady(hostSock);
      const bSock = await connectGameSocket({ sessionId, reconnectToken: b.reconnectToken });
      await waitReady(bSock);
      await expect(emitAck(bSock, 'vip_start_game', {})).rejects.toBeDefined();
      await expect(emitAck(bSock, 'host_set_vip', { playerId: b.playerId })).rejects.toBeDefined();
      await dataSource.getRepository(GameSession).update(
        { id: sessionId },
        { isPaused: true, pausedRemainingMs: 5000 },
      );
      const aSock = await connectGameSocket({ sessionId, reconnectToken: a.reconnectToken });
      await waitReady(aSock);
      await emitAck(aSock, 'vip_start_game', {});
      const sess = await hostSummary(sessionId, hostSecret);
      expect(sess.phase).not.toBe(SessionPhase.Lobby);
      expect(sess.isPaused).toBe(false);
      expect(sess.pausedRemainingMs).toBeNull();
      aSock.close();
      bSock.close();
      hostSock.close();
    });

    it('pause in automatic question: freeze deadline; reveal/proceed blocked; resume ±500ms', async () => {
      const { sessionId, hostSecret, roomCode } = await startRoom({
        advanceMode: AdvanceMode.Automatic,
      });
      await joinAs(roomCode, 'A');
      const hostSock = await connectGameSocket({ sessionId, hostSecret });
      await waitReady(hostSock);
      await emitAck(hostSock, 'host_start_game', {});
      const before = Date.now();
      await dataSource.getRepository(GameSession).update(
        { id: sessionId },
        {
          phase: SessionPhase.Question,
          phaseDeadlineAt: new Date(before + 20_000),
        },
      );
      await emitAck(hostSock, 'host_toggle_pause', {});
      let row = await dataSource.getRepository(GameSession).findOne({ where: { id: sessionId } });
      expect(row?.isPaused).toBe(true);
      expect(row?.phaseDeadlineAt).toBeNull();
      expect(row?.pausedRemainingMs).toBeGreaterThanOrEqual(0);
      const remaining = row!.pausedRemainingMs!;
      await expect(emitAck(hostSock, 'host_reveal_answer', {})).rejects.toBeDefined();
      await dataSource.getRepository(GameSession).update({ id: sessionId }, { phase: SessionPhase.AnswerReveal });
      await expect(emitAck(hostSock, 'host_proceed_after_reveal', {})).rejects.toBeDefined();
      await dataSource.getRepository(GameSession).update({ id: sessionId }, { phase: SessionPhase.Leaderboard });
      await expect(emitAck(hostSock, 'host_continue_leaderboard', {})).rejects.toBeDefined();
      await dataSource.getRepository(GameSession).update({ id: sessionId }, { phase: SessionPhase.RoundSummary });
      await expect(emitAck(hostSock, 'host_continue_round_summary', {})).rejects.toBeDefined();
      await dataSource.getRepository(GameSession).update({ id: sessionId }, { phase: SessionPhase.Question });
      const resumeAt = Date.now();
      await emitAck(hostSock, 'host_toggle_pause', {});
      row = await dataSource.getRepository(GameSession).findOne({ where: { id: sessionId } });
      expect(row?.isPaused).toBe(false);
      expect(row?.phaseDeadlineAt).toBeTruthy();
      const restored = row!.phaseDeadlineAt!.getTime();
      expect(Math.abs(restored - (resumeAt + remaining))).toBeLessThanOrEqual(500);
      hostSock.close();
    });

    it('manual pause blocks reveal; quiz_intro pause skips auto-advance', async () => {
      const { sessionId, hostSecret, roomCode } = await startRoom({
        advanceMode: AdvanceMode.Automatic,
      });
      await joinAs(roomCode, 'A');
      const hostSock = await connectGameSocket({ sessionId, hostSecret });
      await waitReady(hostSock);
      await emitAck(hostSock, 'host_start_game', {});
      await emitAck(hostSock, 'host_toggle_pause', {});
      await new Promise((r) => setTimeout(r, 1200));
      let row = await dataSource.getRepository(GameSession).findOne({ where: { id: sessionId } });
      expect(row?.phase).toBe(SessionPhase.QuizIntro);
      expect(row?.isPaused).toBe(true);
      hostSock.close();

      const manual = await startRoom();
      await joinAs(manual.roomCode, 'A');
      const h2 = await connectGameSocket({ sessionId: manual.sessionId, hostSecret: manual.hostSecret });
      await waitReady(h2);
      await emitAck(h2, 'host_start_game', {});
      await dataSource.getRepository(GameSession).update(
        { id: manual.sessionId },
        { phase: SessionPhase.Question },
      );
      await emitAck(h2, 'host_toggle_pause', {});
      await expect(emitAck(h2, 'host_reveal_answer', {})).rejects.toBeDefined();
      h2.close();
    });

    it('submit_answer while paused; all-answered still finishes the question', async () => {
      const { sessionId, hostSecret, roomCode } = await startRoom();
      const a = await joinAs(roomCode, 'A');
      const b = await joinAs(roomCode, 'B');
      const hostSock = await connectGameSocket({ sessionId, hostSecret });
      await waitReady(hostSock);
      await emitAck(hostSock, 'host_start_game', {});
      await dataSource.getRepository(GameSession).update({ id: sessionId }, { phase: SessionPhase.Question });
      const row = await dataSource.getRepository(GameSession).findOne({ where: { id: sessionId } });
      const qid = row?.currentQuestionId;
      expect(qid).toBeTruthy();
      const aSock = await connectGameSocket({ sessionId, reconnectToken: a.reconnectToken });
      const bSock = await connectGameSocket({ sessionId, reconnectToken: b.reconnectToken });
      await waitReady(aSock);
      await waitReady(bSock);
      await emitAck(hostSock, 'host_toggle_pause', {});
      const optRes = await dataSource.query<{ id: string }[]>(
        `SELECT id FROM question_options WHERE question_id = ? ORDER BY position ASC LIMIT 1`,
        [qid],
      );
      await emitAck(aSock, 'submit_answer', {
        questionId: qid,
        selectedOptionIds: [optRes[0]!.id],
      });
      const afterOne = await dataSource.getRepository(GameSession).findOne({ where: { id: sessionId } });
      expect(afterOne?.phase).toBe(SessionPhase.Question);
      expect(afterOne?.isPaused).toBe(true);
      await emitAck(bSock, 'submit_answer', {
        questionId: qid,
        selectedOptionIds: [optRes[0]!.id],
      });
      const afterAll = await dataSource.getRepository(GameSession).findOne({ where: { id: sessionId } });
      expect(afterAll?.phase).toBe(SessionPhase.AnswerReveal);
      expect(afterAll?.isPaused).toBe(false);
      aSock.close();
      bSock.close();
      hostSock.close();
    });

    it('vip_toggle_pause; video without url ILLEGAL; with url ok; dispute_start paused blocked', async () => {
      const withVid = await startRoom({ videoUrl: 'https://example.test/q.mp4' });
      const a = await joinAs(withVid.roomCode, 'A');
      const hostSock = await connectGameSocket({
        sessionId: withVid.sessionId,
        hostSecret: withVid.hostSecret,
      });
      await waitReady(hostSock);
      const aSock = await connectGameSocket({
        sessionId: withVid.sessionId,
        reconnectToken: a.reconnectToken,
      });
      await waitReady(aSock);
      await emitAck(hostSock, 'host_start_game', {});
      await dataSource.getRepository(GameSession).update(
        { id: withVid.sessionId },
        { phase: SessionPhase.Question },
      );
      await emitAck(aSock, 'vip_toggle_pause', {});
      expect((await dataSource.getRepository(GameSession).findOne({ where: { id: withVid.sessionId } }))?.isPaused).toBe(
        true,
      );
      const pausedRow = await dataSource.getRepository(GameSession).findOne({ where: { id: withVid.sessionId } });
      await expect(
        emitAck(aSock, 'dispute_start', { questionId: pausedRow?.currentQuestionId }),
      ).rejects.toBeDefined();
      await emitAck(aSock, 'vip_toggle_pause', {});
      await emitAck(aSock, 'vip_toggle_question_video', {});
      aSock.close();
      hostSock.close();

      const noVid = await startRoom();
      const p = await joinAs(noVid.roomCode, 'A');
      const h2 = await connectGameSocket({ sessionId: noVid.sessionId, hostSecret: noVid.hostSecret });
      await waitReady(h2);
      const pSock = await connectGameSocket({ sessionId: noVid.sessionId, reconnectToken: p.reconnectToken });
      await waitReady(pSock);
      await emitAck(h2, 'host_start_game', {});
      await dataSource.getRepository(GameSession).update({ id: noVid.sessionId }, { phase: SessionPhase.Question });
      await expect(emitAck(pSock, 'vip_toggle_question_video', {})).rejects.toBeDefined();
      pSock.close();
      h2.close();
    });

    it('vip_toggle_question_video with audioUrl ok', async () => {
      const withAud = await startRoom({ audioUrl: 'https://example.test/q.mp3' });
      const a = await joinAs(withAud.roomCode, 'A');
      const hostSock = await connectGameSocket({
        sessionId: withAud.sessionId,
        hostSecret: withAud.hostSecret,
      });
      await waitReady(hostSock);
      const aSock = await connectGameSocket({
        sessionId: withAud.sessionId,
        reconnectToken: a.reconnectToken,
      });
      await waitReady(aSock);
      await emitAck(hostSock, 'host_start_game', {});
      await dataSource.getRepository(GameSession).update(
        { id: withAud.sessionId },
        { phase: SessionPhase.Question },
      );
      await emitAck(aSock, 'vip_toggle_question_video', {});
      await emitAck(aSock, 'vip_start_question_timer', {});
      aSock.close();
      hostSock.close();
    });
  });

  it('listen audio: question timer waits until host_start_question_timer', async () => {
    const { sessionId, hostSecret, roomCode } = await startRoom({
      advanceMode: AdvanceMode.Automatic,
      audioUrl: 'https://example.test/q.mp3',
    });
    await joinAs(roomCode, 'A');
    const hostSock = await connectGameSocket({ sessionId, hostSecret });
    await waitReady(hostSock);
    await emitAck(hostSock, 'host_start_game', {});
    await dataSource.getRepository(GameSession).update(
      { id: sessionId },
      {
        phase: SessionPhase.QuestionRead,
        phaseDeadlineAt: new Date(Date.now() - 1000),
      },
    );
    const deadline = Date.now() + 4000;
    let row = await dataSource.getRepository(GameSession).findOne({ where: { id: sessionId } });
    while (Date.now() < deadline && row?.phase !== SessionPhase.Question) {
      await new Promise((r) => setTimeout(r, 200));
      row = await dataSource.getRepository(GameSession).findOne({ where: { id: sessionId } });
    }
    expect(row?.phase).toBe(SessionPhase.Question);
    expect(row?.phaseDeadlineAt).toBeNull();
    await emitAck(hostSock, 'host_start_question_timer', {});
    row = await dataSource.getRepository(GameSession).findOne({ where: { id: sessionId } });
    expect(row?.phaseDeadlineAt).toBeTruthy();
    const first = row!.phaseDeadlineAt!.getTime();
    await emitAck(hostSock, 'host_start_question_timer', {});
    row = await dataSource.getRepository(GameSession).findOne({ where: { id: sessionId } });
    expect(row!.phaseDeadlineAt!.getTime()).toBe(first);
    hostSock.close();
  });

  it('PATCH stage-layout: unauth 401, чужой 403, merge + GET id, null reset, invalid 400', async () => {
    const tokenA = await editorAuth();
    const tokenB = await editorAuth();
    const authA = { Authorization: `Bearer ${tokenA}` };
    const authB = { Authorization: `Bearer ${tokenB}` };
    const layout = { v: 1, prompt: { x: 10, y: 10, w: 80, h: 20 } };

    const created = await request(app.getHttpServer())
      .post('/api/quizzes')
      .set(authA)
      .send({ title: 'Layout quiz' })
      .expect(201);
    const quizId = created.body.quizId as string;
    const draft = await request(app.getHttpServer())
      .post('/api/quizzes/revisions/draft')
      .set(authA)
      .send({ quizId })
      .expect(201);
    const round = await request(app.getHttpServer())
      .post('/api/quizzes/rounds')
      .set(authA)
      .send({ quizRevisionId: draft.body.quizRevisionId, position: 1, title: 'R1' })
      .expect(201);
    const qres = await request(app.getHttpServer())
      .post('/api/quizzes/questions')
      .set(authA)
      .send({
        roundId: round.body.roundId,
        position: 1,
        type: 'single_choice',
        prompt: 'Q?',
        timeLimitSec: 15,
        basePoints: 1,
        meta: { musicUrl: 'https://example.test/m.mp3' },
      })
      .expect(201);
    const questionId = qres.body.questionId as string;

    await request(app.getHttpServer())
      .patch(`/api/quizzes/questions/${questionId}/stage-layout`)
      .send({ stageLayout: layout })
      .expect(401);

    await request(app.getHttpServer())
      .patch(`/api/quizzes/questions/${questionId}/stage-layout`)
      .set(authB)
      .send({ stageLayout: layout })
      .expect(403);

    const patched = await request(app.getHttpServer())
      .patch(`/api/quizzes/questions/${questionId}/stage-layout`)
      .set(authA)
      .send({ stageLayout: layout })
      .expect(200);
    expect(patched.body.ok).toBe(true);
    expect(patched.body.stageLayout.prompt.x).toBe(10);

    const got = await request(app.getHttpServer()).get(`/api/quizzes/${quizId}`).set(authA).expect(200);
    const q0 = got.body.rounds[0].questions[0];
    expect(q0.id).toBe(questionId);
    expect(q0.stageLayout.prompt.x).toBe(10);
    expect(q0.music).toBe('https://example.test/m.mp3');

    await request(app.getHttpServer())
      .patch(`/api/quizzes/questions/${questionId}/stage-layout`)
      .set(authA)
      .send({ stageLayout: { v: 1, prompt: {} } })
      .expect(400);

    await request(app.getHttpServer())
      .patch(`/api/quizzes/questions/${questionId}/stage-layout`)
      .set(authA)
      .send({ stageLayout: null })
      .expect(200);
    const got2 = await request(app.getHttpServer()).get(`/api/quizzes/${quizId}`).set(authA).expect(200);
    expect(got2.body.rounds[0].questions[0].stageLayout).toBeUndefined();
  });

  it('question_view: stageLayout только хосту, игроку нет даже после reveal', async () => {
    const layout = { v: 1, prompt: { x: 12, y: 8, w: 70, h: 18, fontFamily: 'Georgia, serif' } };
    const { quizId } = await seedPublishedQuiz(dataSource, { stageLayout: layout });
    const start = await request(app.getHttpServer())
      .post('/api/session/start')
      .set('X-Api-Key', sessionKey)
      .send({ quizId, advanceMode: AdvanceMode.Manual })
      .expect(200);
    const { sessionId, hostSecret, roomCode } = start.body;
    const join = await request(app.getHttpServer())
      .post('/api/session/join')
      .set('X-Api-Key', sessionKey)
      .send({ roomCode, displayName: 'Lay' })
      .expect(200);

    const hostSock = await connectGameSocket({ sessionId, hostSecret });
    await emitAck(hostSock, 'host_start_game', {});
    const playerSock = await connectGameSocket({
      sessionId,
      reconnectToken: join.body.reconnectToken,
    });

    type QView = {
      ok: boolean;
      question: { stageLayout?: { v: number }; stageFonts?: { prompt?: string } };
    };
    const hostBefore = await emitAck<QView>(hostSock, 'question_view', {});
    expect(hostBefore.question.stageLayout?.v).toBe(1);
    expect(hostBefore.question.stageFonts?.prompt).toBe('Georgia, serif');
    const playerBefore = await emitAck<QView>(playerSock, 'question_view', {});
    expect(Object.prototype.hasOwnProperty.call(playerBefore.question, 'stageLayout')).toBe(false);
    expect(playerBefore.question.stageFonts?.prompt).toBe('Georgia, serif');

    await emitAck(hostSock, 'host_reveal_answer', {});
    const playerAfter = await emitAck<QView>(playerSock, 'question_view', {});
    expect(Object.prototype.hasOwnProperty.call(playerAfter.question, 'stageLayout')).toBe(false);
    expect(playerAfter.question.stageFonts?.prompt).toBe('Georgia, serif');

    hostSock.close();
    playerSock.close();
  });

  it('place_stake: round_intro ok, question phase rejected', async () => {
    const { quizId } = await seedPublishedQuiz(dataSource, {
      bettingEnabled: true,
      bettingMaxFraction: '0.5',
    });
    const start = await request(app.getHttpServer())
      .post('/api/session/start')
      .set('X-Api-Key', sessionKey)
      .send({ quizId, advanceMode: AdvanceMode.Manual })
      .expect(200);
    const { sessionId, hostSecret, roomCode } = start.body;

    const join = await request(app.getHttpServer())
      .post('/api/session/join')
      .set('X-Api-Key', sessionKey)
      .send({ roomCode, displayName: 'Better' })
      .expect(200);
    const { reconnectToken } = join.body;

    const hostSock = await connectGameSocket({ sessionId, hostSecret });
    await emitAck(hostSock, 'host_start_game', {});
    await dataSource.getRepository(GameSession).update(
      { id: sessionId },
      { phase: SessionPhase.RoundIntro },
    );

    const playerSock = await connectGameSocket({ sessionId, reconnectToken });
    expect(sessionReady(playerSock).session?.phase).toBe(SessionPhase.RoundIntro);

    type QBet = {
      question?: {
        roundId?: string;
        bettingScope?: string;
        bettingEnabled?: boolean;
        roundStake?: number | null;
      };
    };
    const qv = await emitAck<QBet>(playerSock, 'question_view', {});
    expect(qv.question?.bettingScope).toBe('round');
    expect(qv.question?.bettingEnabled).toBe(true);
    expect(qv.question?.roundId).toBeTruthy();

    const stakeOk = await emitAck<{ ok?: boolean }>(playerSock, 'place_stake', {
      roundId: qv.question!.roundId,
      stake: 0,
    });
    expect(stakeOk.ok).toBe(true);

    const qv2 = await emitAck<QBet>(playerSock, 'question_view', {});
    expect(qv2.question?.roundStake).toBe(0);

    await dataSource.getRepository(GameSession).update({ id: sessionId }, { phase: SessionPhase.Question });
    await expect(
      emitAck(playerSock, 'place_stake', { roundId: qv.question!.roundId, stake: 0 }),
    ).rejects.toBeDefined();

    hostSock.close();
    playerSock.close();
  });

  it('place_stake: question read ok for per-question betting', async () => {
    const { quizId } = await seedPublishedQuiz(dataSource, { questionBettingEnabled: true });
    const start = await request(app.getHttpServer())
      .post('/api/session/start')
      .set('X-Api-Key', sessionKey)
      .send({ quizId, advanceMode: AdvanceMode.Manual })
      .expect(200);
    const { sessionId, hostSecret, roomCode } = start.body;

    const join = await request(app.getHttpServer())
      .post('/api/session/join')
      .set('X-Api-Key', sessionKey)
      .send({ roomCode, displayName: 'QBetter' })
      .expect(200);
    const { reconnectToken } = join.body;

    const hostSock = await connectGameSocket({ sessionId, hostSecret });
    await emitAck(hostSock, 'host_start_game', {});

    await dataSource.getRepository(GameSession).update(
      { id: sessionId },
      { phase: SessionPhase.QuestionRead },
    );

    const playerSock = await connectGameSocket({ sessionId, reconnectToken });
    expect(sessionReady(playerSock).session?.phase).toBe(SessionPhase.QuestionRead);

    type QBet = {
      question?: { id?: string; bettingScope?: string; playerStake?: number | null };
    };
    const qv = await emitAck<QBet>(playerSock, 'question_view', {});
    expect(qv.question?.bettingScope).toBe('question');
    expect(qv.question?.id).toBeTruthy();

    const stakeOk = await emitAck<{ ok?: boolean }>(playerSock, 'place_stake', {
      questionId: qv.question!.id,
      stake: 0,
    });
    expect(stakeOk.ok).toBe(true);

    const qv2 = await emitAck<QBet>(playerSock, 'question_view', {});
    expect(qv2.question?.playerStake).toBe(0);

    hostSock.close();
    playerSock.close();
  });

  it('place_stake: свободный ввод ограничен мин/макс из настроек квиза', async () => {
    const { quizId } = await seedPublishedQuiz(dataSource, {
      bettingEnabled: true,
      roundMeta: { bettingMode: 'free', bettingMinStake: 10, bettingMaxStake: 50, bettingSec: 45 },
    });
    const start = await request(app.getHttpServer())
      .post('/api/session/start')
      .set('X-Api-Key', sessionKey)
      .send({ quizId, advanceMode: AdvanceMode.Manual })
      .expect(200);
    const { sessionId, hostSecret, roomCode } = start.body;

    const join = await request(app.getHttpServer())
      .post('/api/session/join')
      .set('X-Api-Key', sessionKey)
      .send({ roomCode, displayName: 'FreeBetter' })
      .expect(200);
    const { reconnectToken } = join.body;

    const hostSock = await connectGameSocket({ sessionId, hostSecret });
    await emitAck(hostSock, 'host_start_game', {});
    await dataSource.getRepository(SessionPlayer).update({ sessionId }, { score: 100 });

    const playerSock = await connectGameSocket({ sessionId, reconnectToken });
    type QBet = {
      question?: {
        roundId?: string;
        bettingMode?: string;
        bettingMinStake?: number;
        bettingMaxStake?: number | null;
        bettingPresets?: number[];
        roundIntroSec?: number;
        playerStake?: number | null;
      };
    };
    const qv = await emitAck<QBet>(playerSock, 'question_view', {});
    expect(qv.question?.bettingMode).toBe('free');
    expect(qv.question?.bettingMinStake).toBe(10);
    expect(qv.question?.bettingMaxStake).toBe(50);
    // Экран ставки держится столько, сколько задал автор.
    expect(qv.question?.roundIntroSec).toBe(45);
    const roundId = qv.question!.roundId;

    await expect(emitAck(playerSock, 'place_stake', { roundId, stake: 9 })).rejects.toBeDefined();
    await expect(emitAck(playerSock, 'place_stake', { roundId, stake: 51 })).rejects.toBeDefined();
    expect((await emitAck<{ ok?: boolean }>(playerSock, 'place_stake', { roundId, stake: 10 })).ok).toBe(true);

    hostSock.close();
    playerSock.close();
  });

  it('place_stake: режим вариантов принимает только заложенные суммы', async () => {
    const { quizId } = await seedPublishedQuiz(dataSource, {
      questionBettingEnabled: true,
      questionMeta: { bettingMode: 'presets', bettingPresets: [10, 25] },
    });
    const start = await request(app.getHttpServer())
      .post('/api/session/start')
      .set('X-Api-Key', sessionKey)
      .send({ quizId, advanceMode: AdvanceMode.Manual })
      .expect(200);
    const { sessionId, hostSecret, roomCode } = start.body;

    const join = await request(app.getHttpServer())
      .post('/api/session/join')
      .set('X-Api-Key', sessionKey)
      .send({ roomCode, displayName: 'PresetBetter' })
      .expect(200);
    const { reconnectToken } = join.body;

    const hostSock = await connectGameSocket({ sessionId, hostSecret });
    await emitAck(hostSock, 'host_start_game', {});
    await dataSource.getRepository(SessionPlayer).update({ sessionId }, { score: 100 });
    await dataSource
      .getRepository(GameSession)
      .update({ id: sessionId }, { phase: SessionPhase.QuestionRead });

    const playerSock = await connectGameSocket({ sessionId, reconnectToken });
    type QBet = {
      question?: { id?: string; bettingMode?: string; bettingPresets?: number[]; playerStake?: number | null };
    };
    const qv = await emitAck<QBet>(playerSock, 'question_view', {});
    expect(qv.question?.bettingMode).toBe('presets');
    expect(qv.question?.bettingPresets).toEqual([10, 25]);
    const questionId = qv.question!.id;

    await expect(emitAck(playerSock, 'place_stake', { questionId, stake: 20 })).rejects.toBeDefined();
    expect((await emitAck<{ ok?: boolean }>(playerSock, 'place_stake', { questionId, stake: 25 })).ok).toBe(
      true,
    );

    hostSock.close();
    playerSock.close();
  });

  it('без ставки ответ приносит стандартные очки и не отнимает их', async () => {
    const { quizId } = await seedPublishedQuiz(dataSource, {
      questionBettingEnabled: true,
      questionMeta: { bettingMode: 'presets', bettingPresets: [10] },
    });
    const start = await request(app.getHttpServer())
      .post('/api/session/start')
      .set('X-Api-Key', sessionKey)
      .send({ quizId, advanceMode: AdvanceMode.Manual })
      .expect(200);
    const { sessionId, hostSecret, roomCode } = start.body;

    const join = await request(app.getHttpServer())
      .post('/api/session/join')
      .set('X-Api-Key', sessionKey)
      .send({ roomCode, displayName: 'NoStake' })
      .expect(200);
    const { reconnectToken } = join.body;

    const hostSock = await connectGameSocket({ sessionId, hostSecret });
    await emitAck(hostSock, 'host_start_game', {});
    await dataSource.getRepository(SessionPlayer).update({ sessionId }, { score: 40 });
    await dataSource
      .getRepository(GameSession)
      .update({ id: sessionId }, { phase: SessionPhase.Question });

    const playerSock = await connectGameSocket({ sessionId, reconnectToken });
    type QOpts = { question?: { id?: string; options?: { id: string; label: string | null }[] } };
    const qv = await emitAck<QOpts>(playerSock, 'question_view', {});
    const wrong = qv.question!.options!.find((o) => o.label === '5')!;

    // Ставка не сделана: неверный ответ не отнимает очки.
    await emitAck(playerSock, 'submit_answer', {
      questionId: qv.question!.id,
      selectedOptionIds: [wrong.id],
    });
    const player = await dataSource.getRepository(SessionPlayer).findOneByOrFail({ sessionId });
    expect(player.score).toBe(40);

    hostSock.close();
    playerSock.close();
  });

  it('ставка заменяет стандартную цену вопроса', async () => {
    const { quizId } = await seedPublishedQuiz(dataSource, {
      questionBettingEnabled: true,
      questionMeta: { bettingMode: 'presets', bettingPresets: [25] },
    });
    const start = await request(app.getHttpServer())
      .post('/api/session/start')
      .set('X-Api-Key', sessionKey)
      .send({ quizId, advanceMode: AdvanceMode.Manual })
      .expect(200);
    const { sessionId, hostSecret, roomCode } = start.body;

    const join = await request(app.getHttpServer())
      .post('/api/session/join')
      .set('X-Api-Key', sessionKey)
      .send({ roomCode, displayName: 'StakeScore' })
      .expect(200);
    const { reconnectToken } = join.body;

    const hostSock = await connectGameSocket({ sessionId, hostSecret });
    await emitAck(hostSock, 'host_start_game', {});
    await dataSource
      .getRepository(GameSession)
      .update({ id: sessionId }, { phase: SessionPhase.QuestionRead });

    const playerSock = await connectGameSocket({ sessionId, reconnectToken });
    type QBet = {
      question?: { id?: string; options?: { id: string; label: string | null }[] };
    };
    const qv = await emitAck<QBet>(playerSock, 'question_view', {});
    await emitAck(playerSock, 'place_stake', { questionId: qv.question!.id, stake: 25 });

    const afterStake = await dataSource.getRepository(GameSession).findOneByOrFail({ id: sessionId });
    expect(afterStake.phase).toBe(SessionPhase.Question);

    const correct = qv.question!.options!.find((o) => o.label === '4')!;
    await emitAck(playerSock, 'submit_answer', {
      questionId: qv.question!.id,
      selectedOptionIds: [correct.id],
    });
    const player = await dataSource.getRepository(SessionPlayer).findOneByOrFail({ sessionId });
    // basePoints в сиде = 10; ставка 25 должна заменить цену, а не прибавиться сверху.
    expect(player.score).toBe(25);

    hostSock.close();
    playerSock.close();
  });

  it('join отдаёт заголовки rate limit', async () => {
    const { quizId } = await seedPublishedQuiz(dataSource);
    const start = await request(app.getHttpServer())
      .post('/api/session/start')
      .set('X-Api-Key', sessionKey)
      .send({ quizId, advanceMode: AdvanceMode.Manual })
      .expect(200);
    const res = await request(app.getHttpServer())
      .post('/api/session/join')
      .set('X-Api-Key', sessionKey)
      .send({ roomCode: start.body.roomCode, displayName: 'RL' })
      .expect(200);
    expect(res.headers['x-ratelimit-limit-join']).toBeDefined();
  });
});
