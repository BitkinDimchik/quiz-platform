import { IsUUID } from 'class-validator';

export class DisputeStartWsDto {
  @IsUUID()
  questionId!: string;
}
