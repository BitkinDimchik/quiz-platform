import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Server } from 'socket.io';
import { GameSession } from '../entities/game-session.entity';
import { SessionPlayer } from '../entities/session-player.entity';
import { toPublicPlayerState, toPublicSessionState } from '../session/session-state.util';

@Injectable()
export class SessionEventsService {
  private server: Server | null = null;

  constructor(
    @InjectRepository(GameSession)
    private readonly sessions: Repository<GameSession>,
  ) {}

  attachServer(server: Server): void {
    this.server = server;
  }

  sessionRoom(sessionId: string): string {
    return `session:${sessionId}`;
  }

  /** Публичное состояние без секретов хоста */
  emitSessionUpdate(session: GameSession): void {
    if (!this.server) return;
    this.server
      .to(this.sessionRoom(session.id))
      .emit('session_update', toPublicSessionState(session));
  }

  emitLeaderboard(sessionId: string, rows: { playerId: string; displayName: string; score: number }[]): void {
    this.server?.to(this.sessionRoom(sessionId)).emit('leaderboard_update', { rows });
  }

  async emitPlayersUpdate(sessionId: string, players: SessionPlayer[]): Promise<void> {
    const session = await this.sessions.findOne({ where: { id: sessionId } });
    const vipPlayerId = session?.vipPlayerId ?? null;
    this.server
      ?.to(this.sessionRoom(sessionId))
      .emit('players_update', { players: players.map((p) => toPublicPlayerState(p, vipPlayerId)) });
  }

  emitAnswerSubmitted(sessionId: string, payload: { playerId: string; questionId: string }): void {
    this.server?.to(this.sessionRoom(sessionId)).emit('answer_submitted', payload);
  }

  emitAnswerKey(
    sessionId: string,
    payload: {
      questionId: string;
      correctOptionIds: string[];
      correctTexts: string[];
      matchCorrect?: number[];
    },
  ): void {
    this.server?.to(this.sessionRoom(sessionId)).emit('answer_key', payload);
  }

  emitDisputeUpdate(sessionId: string, payload: unknown): void {
    this.server?.to(this.sessionRoom(sessionId)).emit('dispute_update', payload);
  }

  emitStageVideoControl(sessionId: string, payload: { action: 'toggle' }): void {
    this.server?.to(this.sessionRoom(sessionId)).emit('stage_video_control', payload);
  }
}
