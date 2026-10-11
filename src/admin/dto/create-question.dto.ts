import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsObject, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { QuestionType } from '../../common/enums';

export class CreateQuestionDto {
  @IsUUID()
  roundId!: string;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  position!: number;

  @IsEnum(QuestionType)
  type!: QuestionType;

  @IsString()
  @MaxLength(100_000)
  prompt!: string;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  timeLimitSec!: number;

  @IsInt()
  @Min(0)
  @Type(() => Number)
  basePoints!: number;

  @IsOptional()
  @IsString()
  @MaxLength(2_000_000)
  imageUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  audioUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  videoUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  explanationText?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2_000_000)
  explanationImageUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  explanationVideoUrl?: string | null;

  @IsOptional()
  @IsObject()
  meta?: Record<string, unknown>;
}

