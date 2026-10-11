import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../entities/user.entity';
import { Quiz } from '../entities/quiz.entity';
import { QuizRevision } from '../entities/quiz-revision.entity';
import { Round } from '../entities/round.entity';
import { Question } from '../entities/question.entity';
import { QuestionOption } from '../entities/question-option.entity';
import { QuestionAnswer } from '../entities/question-answer.entity';
import { QuizService } from './quiz.service';
import { RevisionLayoutService } from './revision-layout.service';
import { QuestionGradingService } from './question-grading.service';
import { QuestionViewService } from './question-view.service';
import { QuizController } from './quiz.controller';
import { QuizPublicController } from './quiz-public.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Quiz,
      QuizRevision,
      Round,
      Question,
      QuestionOption,
      QuestionAnswer,
    ]),
  ],
  controllers: [QuizController, QuizPublicController],
  providers: [QuizService, RevisionLayoutService, QuestionGradingService, QuestionViewService],
  exports: [QuizService, RevisionLayoutService, QuestionGradingService, QuestionViewService],
})
export class QuizModule {}
