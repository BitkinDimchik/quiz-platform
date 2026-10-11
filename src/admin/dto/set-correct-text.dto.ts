import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class SetCorrectTextDto {
  @IsUUID()
  questionId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(10_000)
  correctText!: string;

  @IsOptional()
  @IsBoolean()
  isCaseSensitive?: boolean;
}
