import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { sqliteDateTime, sqliteJson } from '../database/column-types';
import { User } from './user.entity';
import { QuizRevision } from './quiz-revision.entity';
import { GameSession } from './game-session.entity';

@Entity('quizzes')
export class Quiz {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'owner_user_id' })
  ownerUserId!: string;

  @ManyToOne(() => User, (u) => u.quizzes, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'owner_user_id' })
  owner!: User;

  @Column()
  title!: string;

  @Column({ type: 'varchar', unique: true, nullable: true })
  slug!: string | null;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ ...sqliteJson })
  meta!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', ...sqliteDateTime })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', ...sqliteDateTime })
  updatedAt!: Date;

  @OneToMany(() => QuizRevision, (r) => r.quiz)
  revisions!: QuizRevision[];

  @OneToMany(() => GameSession, (s) => s.quiz)
  sessions!: GameSession[];
}
