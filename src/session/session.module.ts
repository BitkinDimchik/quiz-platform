import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { GameSession } from '../entities/game-session.entity';
import { SessionPlayer } from '../entities/session-player.entity';
import { QuizRun } from '../entities/quiz-run.entity';
import { SessionAnswer } from '../entities/session-answer.entity';
import { SessionRoundStake } from '../entities/session-round-stake.entity';
import { SessionQuestionStake } from '../entities/session-question-stake.entity';
import { QuizModule } from '../quiz/quiz.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { SessionService } from './session.service';
import { SessionController } from './session.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      GameSession,
      SessionPlayer,
      QuizRun,
      SessionAnswer,
      SessionRoundStake,
      SessionQuestionStake,
    ]),
    AuthModule,
    QuizModule,
    RealtimeModule,
  ],
  controllers: [SessionController],
  providers: [SessionService],
  exports: [SessionService],
})
export class SessionModule {}
