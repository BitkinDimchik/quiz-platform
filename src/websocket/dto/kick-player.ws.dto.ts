import { IsUUID } from 'class-validator';

export class KickPlayerWsDto {
  @IsUUID()
  playerId!: string;
}

