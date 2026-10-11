import { MatchingScoringMode, QuestionType, TextGradingMode } from '../../common/enums';

export type AnswerSubmission = {
  selectedOptionIds: string[];
  textAnswer?: string | null;
  /** Для matching: номера ответов 1..n по порядку строк слева, без повторов */
  matchOrder?: number[] | null;
};

export type QuestionForGrading = {
  questionId: string;
  roundId: string;
  revisionId: string;
  questionType: QuestionType;
  basePoints: number;
  timeLimitSec: number;
  correctOptionIds: Set<string>;
  correctTexts: { text: string; caseSensitive: boolean }[];
  textGradingMode: TextGradingMode | null;
  /** 1-based индексы правой колонки для каждой строки слева */
  matchCorrectOrder: number[] | null;
  /** Режим очков для matching (по умолчанию all_or_nothing). */
  matchScoringMode: MatchingScoringMode | null;
};

export type MatchingGradeDetail = {
  valid: boolean;
  n: number;
  correctCount: number;
  fullyCorrect: boolean;
};

/** Разбор ответа matching: перестановка, число верных позиций. */
export function gradeMatchingDetail(
  q: QuestionForGrading,
  submission: AnswerSubmission,
): MatchingGradeDetail {
  const expected = q.matchCorrectOrder;
  const sub = submission.matchOrder;
  if (!expected || expected.length === 0) {
    return { valid: false, n: 0, correctCount: 0, fullyCorrect: false };
  }
  const n = expected.length;
  if (!sub || sub.length !== n) {
    return { valid: false, n, correctCount: 0, fullyCorrect: false };
  }
  const seen = new Set<number>();
  for (let i = 0; i < sub.length; i++) {
    const v = sub[i];
    if (!Number.isFinite(v) || !Number.isInteger(v)) {
      return { valid: false, n, correctCount: 0, fullyCorrect: false };
    }
    if (v < 1 || v > n) return { valid: false, n, correctCount: 0, fullyCorrect: false };
    if (seen.has(v)) return { valid: false, n, correctCount: 0, fullyCorrect: false };
    seen.add(v);
  }
  let correctCount = 0;
  for (let i = 0; i < n; i++) {
    if (sub[i] === expected[i]) correctCount++;
  }
  return { valid: true, n, correctCount, fullyCorrect: correctCount === n };
}

function prepareText(s: string, mode: TextGradingMode): string {
  switch (mode) {
    case TextGradingMode.Exact:
      return s;
    case TextGradingMode.Normalized:
      return s.trim().toLowerCase().replace(/\s+/g, ' ');
    case TextGradingMode.ManualReview:
      return s.trim();
  }
}

export function gradeAnswer(q: QuestionForGrading, submission: AnswerSubmission): boolean | null {
  switch (q.questionType) {
    case QuestionType.SingleChoice:
    case QuestionType.TrueFalse: {
      if (submission.selectedOptionIds.length !== 1) return false;
      const only = submission.selectedOptionIds[0];
      return q.correctOptionIds.size === 1 && q.correctOptionIds.has(only);
    }
    case QuestionType.MultipleChoice: {
      const sel = new Set(submission.selectedOptionIds);
      if (sel.size !== q.correctOptionIds.size) return false;
      for (const id of q.correctOptionIds) {
        if (!sel.has(id)) return false;
      }
      return q.correctOptionIds.size > 0;
    }
    case QuestionType.TextInput: {
      if (q.textGradingMode === TextGradingMode.ManualReview) return null;
      const mode = q.textGradingMode ?? TextGradingMode.Normalized;
      const rawIn = submission.textAnswer;
      if (rawIn == null) return false;
      return q.correctTexts.some(({ text: expected, caseSensitive }) => {
        if (caseSensitive) return rawIn === expected;
        return prepareText(rawIn, mode) === prepareText(expected, TextGradingMode.Normalized);
      });
    }
    case QuestionType.Matching: {
      const d = gradeMatchingDetail(q, submission);
      return d.valid && d.fullyCorrect;
    }
    default:
      return false;
  }
}
