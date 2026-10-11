import { IsUUID } from 'class-validator';

export class PublishRevisionDto {
  @IsUUID()
  quizRevisionId!: string;
}

