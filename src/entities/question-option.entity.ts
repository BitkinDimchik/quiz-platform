import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Question } from './question.entity';

@Entity('question_options')
@Unique(['questionId', 'position'])
export class QuestionOption {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'question_id' })
  questionId!: string;

  @ManyToOne(() => Question, (q) => q.options, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'question_id' })
  question!: Question;

  @Column({ type: 'int' })
  position!: number;

  /** Текст варианта; может быть null, если задано изображение. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  label!: string | null;

  /** URL или data URL (конструктор может сохранять base64). */
  @Column({ name: 'image_url', type: 'text', nullable: true })
  imageUrl!: string | null;
}
