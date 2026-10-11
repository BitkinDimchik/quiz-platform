import { IsUUID } from 'class-validator';

export class CreateDraftRevisionDto {
  @IsUUID()
  quizId!: string;
}

