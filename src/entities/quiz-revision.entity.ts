import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { sqliteDateTime } from '../database/column-types';
import { Quiz } from './quiz.entity';
import { Round } from './round.entity';
import { GameSession } from './game-session.entity';

@Entity('quiz_revisions')
@Unique(['quizId', 'revisionNo'])
export class QuizRevision {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'quiz_id' })
  quizId!: string;

  @ManyToOne(() => Quiz, (q) => q.revisions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'quiz_id' })
  quiz!: Quiz;

  @Column({ name: 'revision_no', type: 'int' })
  revisionNo!: number;

  @Column({ type: 'varchar', nullable: true })
  title!: string | null;

  @Column({ name: 'published_at', ...sqliteDateTime, nullable: true })
  publishedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', ...sqliteDateTime })
  createdAt!: Date;

  @OneToMany(() => Round, (r) => r.quizRevision)
  rounds!: Round[];

  @OneToMany(() => GameSession, (s) => s.quizRevision)
  sessions!: GameSession[];
}
