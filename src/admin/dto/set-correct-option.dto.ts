import { IsUUID } from 'class-validator';

export class SetCorrectOptionDto {
  @IsUUID()
  questionId!: string;

  @IsUUID()
  optionId!: string;
}

