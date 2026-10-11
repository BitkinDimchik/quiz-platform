import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GameSession } from '../entities/game-session.entity';
import { SessionPlayer } from '../entities/session-player.entity';
import { SessionRoundStake } from '../entities/session-round-stake.entity';
import { SessionQuestionStake } from '../entities/session-question-stake.entity';
import { QuizRun } from '../entities/quiz-run.entity';
import { SessionAnswer } from '../entities/session-answer.entity';
import { Question } from '../entities/question.entity';
import { QuizModule } from '../quiz/quiz.module';
import { SessionModule } from '../session/session.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { DisputeModule } from '../dispute/dispute.module';
import { GameFlowService } from './game-flow.service';
import { AutomaticAdvanceService } from './automatic-advance.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      GameSession,
      SessionPlayer,
      SessionRoundStake,
      SessionQuestionStake,
      QuizRun,
      SessionAnswer,
      Question,
    ]),
    QuizModule,
    SessionModule,
    RealtimeModule,
    DisputeModule,
  ],
  providers: [GameFlowService, AutomaticAdvanceService],
  exports: [GameFlowService],
})
export class GameFlowModule {}
