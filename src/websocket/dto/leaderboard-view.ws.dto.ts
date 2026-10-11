import { IsIn, IsOptional, IsUUID } from 'class-validator';

export class LeaderboardViewWsDto {
  @IsOptional()
  @IsIn(['round', 'final'])
  kind?: 'round' | 'final';

  @IsOptional()
  @IsUUID()
  roundId?: string;
}

