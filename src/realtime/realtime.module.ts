import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GameSession } from '../entities/game-session.entity';
import { SessionEventsService } from './session-events.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([GameSession])],
  providers: [SessionEventsService],
  exports: [SessionEventsService],
})
export class RealtimeModule {}
