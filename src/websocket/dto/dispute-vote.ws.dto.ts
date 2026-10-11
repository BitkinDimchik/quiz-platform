import { IsBoolean, IsUUID } from 'class-validator';

export class DisputeVoteWsDto {
  @IsUUID()
  disputeId!: string;

  @IsBoolean()
  approve!: boolean;
}
