import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { AdvanceMode, AnswerRevealMode } from '../../common/enums';

export class SessionStartDto {
  @IsUUID()
  quizId!: string;

  @IsOptional()
  @IsEnum(AdvanceMode)
  advanceMode?: AdvanceMode;

  @IsOptional()
  @IsEnum(AnswerRevealMode)
  answerRevealMode?: AnswerRevealMode;
}
