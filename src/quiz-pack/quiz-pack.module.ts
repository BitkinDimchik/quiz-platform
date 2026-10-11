import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { QuizPackService } from './quiz-pack.service';

@Module({
  imports: [AdminModule],
  providers: [QuizPackService],
  exports: [QuizPackService],
})
export class QuizPackModule {}
