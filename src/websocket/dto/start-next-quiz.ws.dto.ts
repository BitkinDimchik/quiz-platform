import { IsUUID } from 'class-validator';

export class StartNextQuizWsDto {
  @IsUUID()
  quizId!: string;
}

