import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ArrayUnique,
} from 'class-validator';

export class SubmitAnswerWsDto {
  @IsUUID()
  questionId!: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  selectedOptionIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  textAnswer?: string | null;

  /** matching: номера ответов справа 1..n по порядку строк слева */
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  matchOrder?: number[];
}
