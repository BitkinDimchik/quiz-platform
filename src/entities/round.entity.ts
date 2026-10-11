import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { sqliteJson } from '../database/column-types';
import { RoundAnswerRevealMode } from '../common/enums';
import { QuizRevision } from './quiz-revision.entity';
import { Question } from './question.entity';

@Entity('rounds')
@Unique(['quizRevisionId', 'position'])
export class Round {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'quiz_revision_id' })
  quizRevisionId!: string;

  @ManyToOne(() => QuizRevision, (r) => r.rounds, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'quiz_revision_id' })
  quizRevision!: QuizRevision;

  @Column({ type: 'int' })
  position!: number;

  @Column()
  title!: string;

  @Column({
    name: 'answer_reveal_mode',
    type: 'simple-enum',
    enum: RoundAnswerRevealMode,
    default: RoundAnswerRevealMode.PerQuestion,
  })
  answerRevealMode!: RoundAnswerRevealMode;

  @Column({ name: 'show_leaderboard_after', default: false })
  showLeaderboardAfter!: boolean;

  @Column({ name: 'betting_enabled', default: false })
  bettingEnabled!: boolean;

  @Column({
    name: 'betting_max_fraction',
    type: 'decimal',
    precision: 5,
    scale: 4,
    nullable: true,
  })
  bettingMaxFraction!: string | null;

  @Column({ ...sqliteJson })
  meta!: Record<string, unknown>;

  @OneToMany(() => Question, (q) => q.round)
  questions!: Question[];
}
