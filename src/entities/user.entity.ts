import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { sqliteDateTime } from '../database/column-types';
import { Quiz } from './quiz.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', unique: true })
  email!: string;

  @Column({ name: 'password_hash' })
  passwordHash!: string;

  @Column({ name: 'display_name', type: 'varchar', nullable: true })
  displayName!: string | null;

  @CreateDateColumn({ name: 'created_at', ...sqliteDateTime })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', ...sqliteDateTime })
  updatedAt!: Date;

  @OneToMany(() => Quiz, (q) => q.owner)
  quizzes!: Quiz[];
}
