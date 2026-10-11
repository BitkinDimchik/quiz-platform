import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Question } from '../entities/question.entity';
import { QuestionOption } from '../entities/question-option.entity';
import { QuestionAnswer } from '../entities/question-answer.entity';
import { MatchingScoringMode, QuestionType, TextGradingMode } from '../common/enums';
import { QuestionForGrading } from '../domain/policies/answer-grader';

@Injectable()
export class QuestionGradingService {
  constructor(
    @InjectRepository(Question)
    private readonly questions: Repository<Question>,
    @InjectRepository(QuestionOption)
    private readonly options: Repository<QuestionOption>,
    @InjectRepository(QuestionAnswer)
    private readonly answers: Repository<QuestionAnswer>,
  ) {}

  async findForGrading(revisionId: string, questionId: string): Promise<QuestionForGrading | null> {
    const q = await this.questions.findOne({
      where: { id: questionId },
      relations: { round: true },
    });
    if (!q || q.round.quizRevisionId !== revisionId) return null;

    const [opts, ansRows] = await Promise.all([
      this.options.find({ where: { questionId: q.id }, order: { position: 'ASC' } }),
      this.answers.find({ where: { questionId: q.id } }),
    ]);

    const correctOptionIds = new Set<string>();
    const correctTexts: { text: string; caseSensitive: boolean }[] = [];
    for (const a of ansRows) {
      if (a.optionId) correctOptionIds.add(a.optionId);
      if (a.correctText)
        correctTexts.push({ text: a.correctText, caseSensitive: a.isCaseSensitive });
    }

    let textGradingMode: TextGradingMode | null = null;
    if (q.textGradingMode) {
      const m = q.textGradingMode as TextGradingMode;
      if (Object.values(TextGradingMode).includes(m)) textGradingMode = m;
    }

    let matchCorrectOrder: number[] | null = null;
    let matchScoringMode: MatchingScoringMode | null = null;
    if (q.type === QuestionType.Matching) {
      const raw = (q.meta as { match?: { correct?: unknown } } | null | undefined)?.match?.correct;
      if (Array.isArray(raw) && raw.length > 0) {
        const parsed: number[] = [];
        for (const x of raw) {
          const n = typeof x === 'number' ? x : parseInt(String(x), 10);
          if (!Number.isFinite(n) || !Number.isInteger(n)) {
            parsed.length = 0;
            break;
          }
          parsed.push(n);
        }
        if (parsed.length > 0) matchCorrectOrder = parsed;
      }
      const sm = (q.meta as { match?: { scoringMode?: unknown } } | null | undefined)?.match
        ?.scoringMode;
      if (sm === MatchingScoringMode.PerCorrectMatch || sm === 'per_match') {
        matchScoringMode = MatchingScoringMode.PerCorrectMatch;
      } else {
        matchScoringMode = MatchingScoringMode.AllOrNothing;
      }
    }

    return {
      questionId: q.id,
      roundId: q.roundId,
      revisionId,
      questionType: q.type,
      basePoints: q.basePoints,
      timeLimitSec: q.timeLimitSec,
      correctOptionIds,
      correctTexts,
      textGradingMode,
      matchCorrectOrder,
      matchScoringMode,
    };
  }
}
