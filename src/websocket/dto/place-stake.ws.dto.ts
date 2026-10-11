import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min, ValidateIf } from 'class-validator';

export class PlaceStakeWsDto {
  @ValidateIf((o) => !o.questionId)
  @IsUUID()
  roundId?: string;

  @ValidateIf((o) => !o.roundId)
  @IsUUID()
  questionId?: string;

  @IsInt()
  @Min(0)
  @Max(2_000_000_000)
  @Type(() => Number)
  stake!: number;
}
