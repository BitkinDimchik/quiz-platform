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
import { Question } from './question.entity';

@Entity('session_question_stakes')
export class SessionQuestionStake {
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

  @PrimaryColumn({ name: 'question_id', ...sqliteUuid })
  questionId!: string;

  @ManyToOne(() => Question, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'question_id' })
  question!: Question;

  @Column({ type: 'int' })
  stake!: number;

  @CreateDateColumn({ name: 'created_at', ...sqliteDateTime })
  createdAt!: Date;
}
