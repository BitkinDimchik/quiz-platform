import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Question } from './question.entity';
import { QuestionOption } from './question-option.entity';

@Entity('question_answers')
export class QuestionAnswer {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'question_id' })
  questionId!: string;

  @ManyToOne(() => Question, (q) => q.answers, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'question_id' })
  question!: Question;

  @Column({ name: 'option_id', nullable: true })
  optionId!: string | null;

  @ManyToOne(() => QuestionOption, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'option_id' })
  option!: QuestionOption | null;

  @Column({ name: 'correct_text', type: 'varchar', nullable: true })
  correctText!: string | null;

  @Column({ name: 'is_case_sensitive', default: false })
  isCaseSensitive!: boolean;
}
