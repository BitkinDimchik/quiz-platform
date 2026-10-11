import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { AuthModule } from '../auth/auth.module';
import { QuizPackModule } from '../quiz-pack/quiz-pack.module';
import { QuizEditorController } from './quiz-editor.controller';
import { OsClipboardImageService } from './os-clipboard-image.service';

@Module({
  imports: [AdminModule, AuthModule, QuizPackModule],
  controllers: [QuizEditorController],
  providers: [OsClipboardImageService],
})
export class QuizEditorModule {}
