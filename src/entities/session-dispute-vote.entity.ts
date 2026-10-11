import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { sqliteDateTime, sqliteUuid } from '../database/column-types';
import { SessionDispute } from './session-dispute.entity';
import { SessionPlayer } from './session-player.entity';

@Entity('session_dispute_votes')
export class SessionDisputeVote {
  @PrimaryColumn({ name: 'dispute_id', ...sqliteUuid })
  disputeId!: string;

  @ManyToOne(() => SessionDispute, (d) => d.votes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dispute_id' })
  dispute!: SessionDispute;

  @PrimaryColumn({ name: 'player_id', ...sqliteUuid })
  playerId!: string;

  @ManyToOne(() => SessionPlayer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'player_id' })
  player!: SessionPlayer;

  @Column({ type: 'boolean', name: 'approve' })
  approve!: boolean;

  @Column({ name: 'created_at', ...sqliteDateTime, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;
}
