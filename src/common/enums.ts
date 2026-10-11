export enum QuestionType {
  SingleChoice = 'single_choice',
  MultipleChoice = 'multiple_choice',
  TrueFalse = 'true_false',
  TextInput = 'text_input',
  /** Установи соответствие: пары из meta.match */
  Matching = 'matching',
}

export enum SessionPhase {
  Lobby = 'lobby',
  QuizIntro = 'quiz_intro',
  RoundIntro = 'round_intro',
  QuestionRead = 'question_read',
  Question = 'question',
  AnswerReveal = 'answer_reveal',
  RoundReplay = 'round_replay', // legacy name (kept for DB compatibility)
  RoundSummary = 'round_summary',
  Leaderboard = 'leaderboard',
  Finished = 'finished',
}

export enum AdvanceMode {
  Automatic = 'automatic',
  Manual = 'manual',
}

export enum AnswerRevealMode {
  PerQuestion = 'per_question',
  EndOfRound = 'end_of_round',
}

export enum RoundAnswerRevealMode {
  PerQuestion = 'per_question',
  EndOfRound = 'end_of_round',
}

export enum TextGradingMode {
  Exact = 'exact',
  Normalized = 'normalized',
  ManualReview = 'manual_review',
}

/** Как считать очки за вопрос «соответствие» (хранится в question.meta.match.scoringMode). */
export enum MatchingScoringMode {
  /** Все пары верны — полные basePoints; иначе 0. */
  AllOrNothing = 'all_or_nothing',
  /** Очки пропорционально числу верных пар: floor(basePoints * correctCount / n). */
  PerCorrectMatch = 'per_match',
}
