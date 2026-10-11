import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class CreateOptionDto {
  @IsUUID()
  questionId!: string;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  position!: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  label?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2_000_000)
  imageUrl?: string | null;
}

