import { IsObject, IsDefined, ValidateIf } from 'class-validator';

export class UpdateStageLayoutDto {
  @IsDefined()
  @ValidateIf((_, v) => v !== null)
  @IsObject()
  stageLayout!: Record<string, unknown> | null;
}
