import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  VersionColumn,
} from 'typeorm';
import { sqliteBlob, sqliteDateTime, sqliteUuid } from '../database/column-types';
import { AdvanceMode, AnswerRevealMode, SessionPhase } from '../common/enums';
import { Quiz } from './quiz.entity';
import { QuizRevision } from './quiz-revision.entity';
import { Round } from './round.entity';
import { Question } from './question.entity';
import { SessionPlayer } from './session-player.entity';

@Entity('game_sessions')
@Index('UQidx_game_sessions_room_active', ['roomCode'], {
  unique: true,
  where: '"ended_at" IS NULL',
})
@Index('IDX_game_sessions_vip_player', ['vipPlayerId'])
export class GameSession {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'quiz_id' })
  quizId!: string;

  @ManyToOne(() => Quiz, (q) => q.sessions, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'quiz_id' })
  quiz!: Quiz;

  @Column({ name: 'quiz_revision_id' })
  quizRevisionId!: string;

  @ManyToOne(() => QuizRevision, (r) => r.sessions, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'quiz_revision_id' })
  quizRevision!: QuizRevision;

  @Column({ name: 'room_code', type: 'varchar', length: 12 })
  roomCode!: string;

  @Column({
    type: 'simple-enum',
    enum: SessionPhase,
    default: SessionPhase.Lobby,
  })
  phase!: SessionPhase;

  @Column({
    name: 'advance_mode',
    type: 'simple-enum',
    enum: AdvanceMode,
    default: AdvanceMode.Manual,
  })
  advanceMode!: AdvanceMode;

  @Column({
    name: 'answer_reveal_mode',
    type: 'simple-enum',
    enum: AnswerRevealMode,
    default: AnswerRevealMode.PerQuestion,
  })
  answerRevealMode!: AnswerRevealMode;

  @Column({ name: 'host_secret_hash', ...sqliteBlob })
  hostSecretHash!: Buffer;

  @Column({ name: 'host_secret_salt', ...sqliteBlob, nullable: true })
  hostSecretSalt!: Buffer | null;

  @Column({ name: 'current_round_id', nullable: true })
  currentRoundId!: string | null;

  @ManyToOne(() => Round, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'current_round_id' })
  currentRound!: Round | null;

  @Column({ name: 'current_question_id', nullable: true })
  currentQuestionId!: string | null;

  @ManyToOne(() => Question, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'current_question_id' })
  currentQuestion!: Question | null;

  @Column({ name: 'phase_deadline_at', ...sqliteDateTime, nullable: true })
  phaseDeadlineAt!: Date | null;

  @Column({ name: 'started_at', ...sqliteDateTime, nullable: true })
  startedAt!: Date | null;

  @Column({ name: 'ended_at', ...sqliteDateTime, nullable: true })
  endedAt!: Date | null;

  /** Current VIP player; column-only (no TypeORM relation — cyclic FK with session_players). */
  @Column({ name: 'vip_player_id', ...sqliteUuid, nullable: true })
  vipPlayerId!: string | null;

  @Column({ name: 'is_paused', type: 'boolean', default: false })
  isPaused!: boolean;

  @Column({ name: 'paused_remaining_ms', type: 'int', nullable: true })
  pausedRemainingMs!: number | null;

  @VersionColumn({ name: 'version', default: 0 })
  version!: number;

  @CreateDateColumn({ name: 'created_at', ...sqliteDateTime })
  createdAt!: Date;

  @OneToMany(() => SessionPlayer, (p) => p.session)
  players!: SessionPlayer[];
}
