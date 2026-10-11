import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { sqliteDateTime } from '../database/column-types';
import { GameSession } from './game-session.entity';
import { Quiz } from './quiz.entity';
import { QuizRevision } from './quiz-revision.entity';

@Entity('quiz_runs')
@Index('UQidx_quiz_runs_session_run_no', ['sessionId', 'runNo'], { unique: true })
export class QuizRun {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'session_id' })
  sessionId!: string;

  @ManyToOne(() => GameSession, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id' })
  session!: GameSession;

  @Column({ name: 'quiz_id' })
  quizId!: string;

  @ManyToOne(() => Quiz, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'quiz_id' })
  quiz!: Quiz;

  @Column({ name: 'quiz_revision_id' })
  quizRevisionId!: string;

  @ManyToOne(() => QuizRevision, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'quiz_revision_id' })
  quizRevision!: QuizRevision;

  @Column({ name: 'run_no', type: 'int' })
  runNo!: number;

  @CreateDateColumn({ name: 'started_at', ...sqliteDateTime })
  startedAt!: Date;

  @Column({ name: 'ended_at', ...sqliteDateTime, nullable: true })
  endedAt!: Date | null;
}

