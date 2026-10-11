import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GameSession } from '../entities/game-session.entity';
import { Question } from '../entities/question.entity';
import { QuestionAnswer } from '../entities/question-answer.entity';
import { QuestionOption } from '../entities/question-option.entity';
import { Quiz } from '../entities/quiz.entity';
import { QuizRevision } from '../entities/quiz-revision.entity';
import { Round } from '../entities/round.entity';
import { User } from '../entities/user.entity';
import { QuizModule } from '../quiz/quiz.module';
import { UploadCleanupService } from '../quiz-pack/upload-cleanup.service';
import { AdminService } from './services/admin.service';

@Module({
  imports: [
    QuizModule,
    TypeOrmModule.forFeature([
      User,
      Quiz,
      QuizRevision,
      Round,
      Question,
      QuestionOption,
      QuestionAnswer,
      GameSession,
    ]),
  ],
  providers: [AdminService, UploadCleanupService],
  exports: [AdminService, UploadCleanupService],
})
export class AdminModule {}
