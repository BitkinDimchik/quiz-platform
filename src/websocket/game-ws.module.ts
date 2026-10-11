import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SessionAnswer } from '../entities/session-answer.entity';
import { SessionRoundStake } from '../entities/session-round-stake.entity';
import { SessionQuestionStake } from '../entities/session-question-stake.entity';
import { QuizModule } from '../quiz/quiz.module';
import { SessionModule } from '../session/session.module';
import { GameFlowModule } from '../game-flow/game-flow.module';
import { AnswerModule } from '../answer/answer.module';
import { DisputeModule } from '../dispute/dispute.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { GameGateway } from './game.gateway';
import { WsHostGuard, WsPlayerGuard, WsSessionMemberGuard } from './ws-role.guards';

@Module({
  imports: [
    TypeOrmModule.forFeature([SessionAnswer, SessionRoundStake, SessionQuestionStake]),
    RealtimeModule,
    QuizModule,
    SessionModule,
    GameFlowModule,
    AnswerModule,
    DisputeModule,
  ],
  providers: [GameGateway, WsHostGuard, WsPlayerGuard, WsSessionMemberGuard],
})
export class GameWsModule {}
