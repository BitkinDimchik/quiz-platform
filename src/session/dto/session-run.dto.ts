import { IsUUID } from 'class-validator';

export class SessionRunDto {
  @IsUUID()
  quizRevisionId!: string;
}
