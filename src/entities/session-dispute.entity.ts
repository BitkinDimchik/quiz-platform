import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { sqliteDateTime } from '../database/column-types';
import { GameSession } from './game-session.entity';
import { Question } from './question.entity';
import { SessionPlayer } from './session-player.entity';
import { SessionDisputeVote } from './session-dispute-vote.entity';

export type SessionDisputeStatus = 'open' | 'approved' | 'rejected';

@Entity('session_disputes')
@Index('IDX_session_disputes_session_q', ['sessionId', 'questionId'])
@Index('UQ_session_disputes_open_per_question', ['sessionId', 'questionId'], {
  unique: true,
  where: `"status" = 'open'`,
})
export class SessionDispute {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'session_id' })
  sessionId!: string;

  @ManyToOne(() => GameSession, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id' })
  session!: GameSession;

  @Column({ name: 'question_id' })
  questionId!: string;

  @ManyToOne(() => Question, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'question_id' })
  question!: Question;

  @Column({ name: 'proposer_player_id' })
  proposerPlayerId!: string;

  @ManyToOne(() => SessionPlayer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'proposer_player_id' })
  proposerPlayer!: SessionPlayer;

  @Column({ type: 'varchar', length: 16 })
  status!: SessionDisputeStatus;

  /** Снимок id игроков на момент открытия (JSON uuid[]). */
  @Column({ name: 'eligible_player_ids', type: 'text' })
  eligiblePlayerIdsJson!: string;

  @CreateDateColumn({ name: 'created_at', ...sqliteDateTime })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', ...sqliteDateTime })
  updatedAt!: Date;

  @OneToMany(() => SessionDisputeVote, (v) => v.dispute)
  votes!: SessionDisputeVote[];
}
