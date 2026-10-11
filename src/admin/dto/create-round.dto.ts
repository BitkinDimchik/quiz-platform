import { IsBoolean, IsEnum, IsInt, IsObject, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';
import { RoundAnswerRevealMode } from '../../common/enums';

export class CreateRoundDto {
  @IsUUID()
  quizRevisionId!: string;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  position!: number;

  @IsString()
  @MaxLength(255)
  title!: string;

  @IsOptional()
  @IsObject()
  meta?: Record<string, unknown>;

  @IsOptional()
  @IsEnum(RoundAnswerRevealMode)
  answerRevealMode?: RoundAnswerRevealMode;

  @IsOptional()
  @IsBoolean()
  showLeaderboardAfter?: boolean;

  @IsOptional()
  @IsBoolean()
  bettingEnabled?: boolean;

  @IsOptional()
  @ValidateIf((_, v) => v != null && v !== '')
  @IsString()
  @MaxLength(32)
  bettingMaxFraction?: string | null;
}

