import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DisputeService } from './dispute.service';
import { SessionDispute } from '../entities/session-dispute.entity';
import { SessionDisputeVote } from '../entities/session-dispute-vote.entity';
import { SessionAnswer } from '../entities/session-answer.entity';
import { SessionPlayer } from '../entities/session-player.entity';
import { SessionRoundStake } from '../entities/session-round-stake.entity';
import { SessionQuestionStake } from '../entities/session-question-stake.entity';
import { Question } from '../entities/question.entity';
import { GameSession } from '../entities/game-session.entity';
import { QuizModule } from '../quiz/quiz.module';
import { SessionModule } from '../session/session.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SessionDispute,
      SessionDisputeVote,
      SessionAnswer,
      SessionPlayer,
      SessionRoundStake,
      SessionQuestionStake,
      Question,
      GameSession,
    ]),
    QuizModule,
    SessionModule,
    RealtimeModule,
  ],
  providers: [DisputeService],
  exports: [DisputeService],
})
export class DisputeModule {}
