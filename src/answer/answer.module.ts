import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SessionAnswer } from '../entities/session-answer.entity';
import { SessionPlayer } from '../entities/session-player.entity';
import { SessionRoundStake } from '../entities/session-round-stake.entity';
import { SessionQuestionStake } from '../entities/session-question-stake.entity';
import { Question } from '../entities/question.entity';
import { QuizModule } from '../quiz/quiz.module';
import { SessionModule } from '../session/session.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { GameFlowModule } from '../game-flow/game-flow.module';
import { AnswerService } from './answer.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SessionAnswer,
      SessionPlayer,
      SessionRoundStake,
      SessionQuestionStake,
      Question,
    ]),
    QuizModule,
    SessionModule,
    GameFlowModule,
    RealtimeModule,
  ],
  providers: [AnswerService],
  exports: [AnswerService],
})
export class AnswerModule {}
