import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { mkdirSync } from 'fs';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import type { Request } from 'express';
import type { JwtUserPayload } from '../auth/auth.service';
import { SessionStartAuthGuard } from '../auth/session-start-auth.guard';
import { AdvanceMode, AnswerRevealMode } from '../common/enums';
import { DomainError } from '../common/domain-error';
import { SessionService } from './session.service';
import { SessionStartDto } from './dto/session-start.dto';
import { SessionJoinDto } from './dto/session-join.dto';
import { SessionRunDto } from './dto/session-run.dto';
import { toPublicPlayerState, toPublicSessionState } from './session-state.util';

@Controller('api/session')
export class SessionController {
  private readonly logger = new Logger(SessionController.name);

  constructor(private readonly sessions: SessionService) {}

  /** Быстрая проверка для игрока: активна ли комната по roomCode и какой sessionId. */
  @Get('active/:roomCode')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  async activeByRoom(
    @Param('roomCode') roomCode: string,
  ): Promise<{ active: boolean; sessionId: string | null; roomCode: string }> {
    const rc = String(roomCode || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '');
    const s = rc ? await this.sessions.findActiveByRoomCode(rc) : null;
    return { active: Boolean(s), sessionId: s?.id ?? null, roomCode: rc };
  }

  @Post('start')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionStartAuthGuard)
  @SkipThrottle({ join: true })
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async start(
    @Body() body: SessionStartDto,
    @Req() req: Request & { user?: JwtUserPayload },
  ): Promise<{ sessionId: string; roomCode: string; hostSecret: string }> {
    const mode = body.advanceMode ?? AdvanceMode.Manual;
    const arm = body.answerRevealMode ?? AnswerRevealMode.PerQuestion;
    const actingUserId = req.user?.sub;
    const { session, hostSecret, roomCode } = await this.sessions.startSession(body.quizId, mode, arm, {
      actingUserId,
    });
    this.logger.log(
      { sessionId: session.id, roomCode, event: 'session_started', asUser: Boolean(actingUserId) },
      'game session started',
    );
    return { sessionId: session.id, roomCode, hostSecret };
  }

  @Post('upload-avatar')
  @HttpCode(HttpStatus.OK)
  @SkipThrottle({ join: true })
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const dir = join(process.cwd(), 'public', 'uploads', 'avatar');
          mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (_req, file, cb) => {
          const rawExt = extname(file.originalname || '').toLowerCase();
          const allowed = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
          const ext = allowed.has(rawExt) ? rawExt : '.jpg';
          cb(null, `${randomUUID()}${ext}`);
        },
      }),
      limits: { fileSize: 2 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const ok = typeof file.mimetype === 'string' && file.mimetype.startsWith('image/');
        cb(ok ? null : new Error('Only image files are allowed'), ok);
      },
    }),
  )
  uploadAvatar(@UploadedFile() file: { filename: string } | undefined): { url: string } {
    const name = file?.filename || '';
    if (!name) throw DomainError.validation('file required');
    return { url: `/uploads/avatar/${name}` };
  }

  @Post('join')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async join(
    @Body() body: SessionJoinDto,
  ): Promise<{ sessionId: string; playerId: string; reconnectToken: string; roomCode: string }> {
    const { player, reconnectToken, roomCode } = await this.sessions.joinPlayer(
      body.roomCode,
      body.displayName,
      body.avatarUrl,
    );
    this.logger.log(
      {
        sessionId: player.sessionId,
        playerId: player.id,
        roomCode: body.roomCode,
        event: 'player_joined',
      },
      'player joined lobby',
    );
    return { sessionId: player.sessionId, playerId: player.id, reconnectToken, roomCode };
  }

  @Get(':sessionId/players')
  async players(
    @Param('sessionId') sessionId: string,
  ): Promise<{ players: ReturnType<typeof toPublicPlayerState>[] }> {
    const players = await this.sessions.listLobbyPlayers(sessionId);
    const session = await this.sessions.findSession(sessionId);
    return { players: players.map((p) => toPublicPlayerState(p, session?.vipPlayerId ?? null)) };
  }

  /** Состояние комнаты для ведущего (в т.ч. закрытая сессия — по секрету). */
  @Get(':sessionId/host-summary')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async hostSummary(
    @Param('sessionId') sessionId: string,
    @Headers('x-host-secret') hostSecretHeader?: string,
  ): Promise<{ session: ReturnType<typeof toPublicSessionState> }> {
    const secret = (hostSecretHeader || '').trim();
    if (!secret) {
      throw new UnauthorizedException('X-Host-Secret header is required');
    }
    const session = await this.sessions.assertHostSecret(sessionId, secret);
    return { session: toPublicSessionState(session) };
  }

  @Post(':sessionId/reopen')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async reopen(
    @Param('sessionId') sessionId: string,
    @Headers('x-host-secret') hostSecretHeader?: string,
  ): Promise<{ session: ReturnType<typeof toPublicSessionState> }> {
    const secret = (hostSecretHeader || '').trim();
    if (!secret) {
      throw new UnauthorizedException('X-Host-Secret header is required');
    }
    const session = await this.sessions.reopenSession(sessionId, secret);
    this.logger.log({ sessionId, event: 'session_reopened' }, 'game session reopened by host');
    return { session: toPublicSessionState(session) };
  }

  /**
   * Новый QuizRun в существующей комнате (ведущий передаёт секрет в заголовке).
   * Игроки остаются подключёнными к той же GameSession.
   */
  @Post(':sessionId/run')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async startRunInSession(
    @Param('sessionId') sessionId: string,
    @Body() body: SessionRunDto,
    @Headers('x-host-secret') hostSecretHeader?: string,
  ): Promise<{ ok: true; runNo: number; runId: string }> {
    const secret = (hostSecretHeader || '').trim();
    if (!secret) {
      throw new UnauthorizedException('X-Host-Secret header is required');
    }
    await this.sessions.assertHost(sessionId, secret);
    const { runNo, runId } = await this.sessions.startNextQuizFromRevision(sessionId, body.quizRevisionId);
    this.logger.log({ sessionId, runNo, event: 'session_run_started' }, 'next quiz run in session');
    return { ok: true, runNo, runId };
  }
}
