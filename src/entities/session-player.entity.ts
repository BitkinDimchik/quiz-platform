import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { sqliteBlob, sqliteDateTime } from '../database/column-types';
import { GameSession } from './game-session.entity';
import { SessionAnswer } from './session-answer.entity';

@Entity('session_players')
@Index('UQidx_session_players_reconnect', ['sessionId', 'reconnectTokenHash'], {
  unique: true,
})
export class SessionPlayer {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'session_id' })
  sessionId!: string;

  @ManyToOne(() => GameSession, (s) => s.players, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id' })
  session!: GameSession;

  @Column({ name: 'display_name' })
  displayName!: string;

  @Column({ name: 'avatar_url', type: 'varchar', nullable: true })
  avatarUrl!: string | null;

  @Column({ type: 'int', default: 0 })
  score!: number;

  @Column({ name: 'reconnect_token_hash', ...sqliteBlob })
  reconnectTokenHash!: Buffer;

  @CreateDateColumn({ name: 'joined_at', ...sqliteDateTime })
  joinedAt!: Date;

  @Column({ name: 'last_seen_at', ...sqliteDateTime })
  lastSeenAt!: Date;

  @Column({ name: 'disconnected_at', ...sqliteDateTime, nullable: true })
  disconnectedAt!: Date | null;

  @Column({ name: 'is_connected', type: 'boolean', default: true })
  isConnected!: boolean;

  @OneToMany(() => SessionAnswer, (a) => a.player)
  answers!: SessionAnswer[];
}
