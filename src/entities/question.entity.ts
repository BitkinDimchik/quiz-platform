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
import { QuestionType } from '../common/enums';
import { Round } from './round.entity';
import { QuestionOption } from './question-option.entity';
import { QuestionAnswer } from './question-answer.entity';

@Entity('questions')
@Unique(['roundId', 'position'])
export class Question {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'round_id' })
  roundId!: string;

  @ManyToOne(() => Round, (r) => r.questions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'round_id' })
  round!: Round;

  @Column({ type: 'int' })
  position!: number;

  @Column({
    type: 'simple-enum',
    enum: QuestionType,
  })
  type!: QuestionType;

  @Column({ type: 'text' })
  prompt!: string;

  @Column({ name: 'image_url', type: 'text', nullable: true })
  imageUrl!: string | null;

  @Column({ name: 'audio_url', type: 'text', nullable: true })
  audioUrl!: string | null;

  @Column({ name: 'video_url', type: 'text', nullable: true })
  videoUrl!: string | null;

  @Column({ name: 'explanation_text', type: 'text', nullable: true })
  explanationText!: string | null;

  @Column({ name: 'explanation_image_url', type: 'text', nullable: true })
  explanationImageUrl!: string | null;

  @Column({ name: 'explanation_video_url', type: 'text', nullable: true })
  explanationVideoUrl!: string | null;

  @Column({ name: 'time_limit_sec', type: 'int' })
  timeLimitSec!: number;

  @Column({ name: 'base_points', type: 'int' })
  basePoints!: number;

  @Column({ name: 'text_grading_mode', type: 'varchar', nullable: true })
  textGradingMode!: string | null;

  @Column({ ...sqliteJson })
  meta!: Record<string, unknown>;

  @OneToMany(() => QuestionOption, (o) => o.question)
  options!: QuestionOption[];

  @OneToMany(() => QuestionAnswer, (a) => a.question)
  answers!: QuestionAnswer[];
}
