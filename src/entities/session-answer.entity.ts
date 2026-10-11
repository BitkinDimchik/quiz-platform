import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { sqliteDateTime } from '../database/column-types';
import { GameSession } from './game-session.entity';
import { SessionPlayer } from './session-player.entity';
import { Question } from './question.entity';
import { QuizRevision } from './quiz-revision.entity';

@Entity('session_answers')
@Unique(['playerId', 'questionId'])
export class SessionAnswer {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'session_id' })
  sessionId!: string;

  @ManyToOne(() => GameSession, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id' })
  session!: GameSession;

  @Column({ name: 'player_id' })
  playerId!: string;

  @ManyToOne(() => SessionPlayer, (p) => p.answers, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'player_id' })
  player!: SessionPlayer;

  @Column({ name: 'question_id' })
  questionId!: string;

  @ManyToOne(() => Question, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'question_id' })
  question!: Question;

  @Column({ name: 'quiz_revision_id' })
  quizRevisionId!: string;

  @ManyToOne(() => QuizRevision, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'quiz_revision_id' })
  quizRevision!: QuizRevision;

  @CreateDateColumn({ name: 'submitted_at', ...sqliteDateTime })
  submittedAt!: Date;

  @Column({ name: 'time_to_answer_ms', type: 'int', nullable: true })
  timeToAnswerMs!: number | null;

  /** JSON array of option UUID strings */
  @Column({ name: 'selected_option_ids', type: 'text', default: '[]' })
  selectedOptionIds!: string;

  @Column({ name: 'text_answer', type: 'varchar', nullable: true })
  textAnswer!: string | null;

  @Column({ name: 'is_correct', type: 'boolean', nullable: true })
  isCorrect!: boolean | null;

  @Column({ name: 'points_awarded', type: 'int', default: 0 })
  pointsAwarded!: number;
}
