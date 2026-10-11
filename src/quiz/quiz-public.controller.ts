import { Controller, Get, Param } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { parseStageFontFamily } from './stage-layout';
import { parseStageTypeStyles, type StageTypeStyles } from './stage-type-styles';
import { QuizService } from './quiz.service';

@Controller('api/quizzes')
export class QuizPublicController {
  constructor(private readonly quizSvc: QuizService) {}

  /**
   * Public quiz info used by unauthenticated clients (players).
   * Returns only safe fields (cover, music, typography).
   */
  @Get('public/:quizId')
  @SkipThrottle({ default: true, join: true })
  async publicQuiz(
    @Param('quizId') quizId: string,
  ): Promise<{
    quizId: string;
    background: string | null;
    finalMusic: string | null;
    fontFamily: string | null;
    stageTypeStyles: StageTypeStyles | null;
  }> {
    const q = await this.quizSvc.findQuizById(quizId);
    const bg = q?.meta?.background;
    const fm = (q?.meta as { finalMusic?: unknown } | null | undefined)?.finalMusic;
    const ff = parseStageFontFamily((q?.meta as { fontFamily?: unknown } | null | undefined)?.fontFamily);
    const typeStyles = parseStageTypeStyles(
      (q?.meta as { stageTypeStyles?: unknown } | null | undefined)?.stageTypeStyles,
    );
    return {
      quizId,
      background: typeof bg === 'string' && bg.trim() ? bg.trim() : null,
      finalMusic: typeof fm === 'string' && fm.trim() ? fm.trim() : null,
      fontFamily: ff ?? null,
      stageTypeStyles: typeStyles,
    };
  }
}
