import { IsOptional, IsUUID } from 'class-validator';

export class QuestionViewWsDto {
  @IsOptional()
  @IsUUID()
  questionId?: string;
}

