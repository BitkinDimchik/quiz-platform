import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { sqliteDateTime, sqliteUuid } from '../database/column-types';
import { GameSession } from './game-session.entity';
import { SessionPlayer } from './session-player.entity';
import { Round } from './round.entity';

@Entity('session_round_stakes')
export class SessionRoundStake {
  @PrimaryColumn({ name: 'session_id', ...sqliteUuid })
  sessionId!: string;

  @ManyToOne(() => GameSession, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id' })
  session!: GameSession;

  @PrimaryColumn({ name: 'player_id', ...sqliteUuid })
  playerId!: string;

  @ManyToOne(() => SessionPlayer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'player_id' })
  player!: SessionPlayer;

  @PrimaryColumn({ name: 'round_id', ...sqliteUuid })
  roundId!: string;

  @ManyToOne(() => Round, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'round_id' })
  round!: Round;

  @Column({ type: 'int' })
  stake!: number;

  @CreateDateColumn({ name: 'created_at', ...sqliteDateTime })
  createdAt!: Date;
}
