import { IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateQuizDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2_000_000)
  coverImage?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2_000_000)
  finalMusic?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  fontFamily?: string | null;

  @IsOptional()
  @IsObject()
  stageTypeStyles?: Record<string, unknown> | null;
}
