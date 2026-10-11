import { IsUUID } from 'class-validator';

export class SetVipWsDto {
  @IsUUID()
  playerId!: string;
}
