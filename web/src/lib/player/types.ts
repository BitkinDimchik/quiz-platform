export type SessionPhase =
  | 'lobby'
  | 'quiz_intro'
  | 'round_intro'
  | 'question_read'
  | 'question'
  | 'answer_reveal'
  | 'round_replay'
  | 'round_summary'
  | 'leaderboard'
  | 'finished'
  | string;

export type PlayerSession = {
  phase: SessionPhase;
  phaseDeadlineAt?: string | null;
  currentQuestionId?: string | null;
  quizId?: string | null;
  endedAt?: string | null;
  vipPlayerId?: string | null;
  isPaused?: boolean;
  pausedRemainingMs?: number | null;
  [key: string]: unknown;
};

export type PlayerAnswer = {
  selectedOptionIds?: string[];
  textAnswer?: string | null;
  matchOrder?: number[];
  isCorrect?: boolean;
};

export type QuestionOption = {
  id: string;
  label?: string;
  imageUrl?: string | null;
};

export type MatchSide = {
  id?: string;
  label?: string;
  imageUrl?: string | null;
};

export type PlayerStageFonts = {
  prompt?: string;
  meta?: string;
  explanation?: string;
  explanationLabel?: string;
  textHint?: string;
  answers?: Record<string, string>;
  matchLeft?: Record<string, string>;
  matchRight?: Record<string, string>;
  correctTexts?: Record<string, string>;
};

export type MatchData = {
  left: MatchSide[];
  right: MatchSide[];
  correct?: number[];
  scoringMode?: string;
  scoring_mode?: string;
};

export type AnswerKeyPayload = {
  questionId: string;
  correctOptionIds?: string[];
  correctTexts?: string[];
  matchCorrect?: number[];
};

export type PlayerQuestion = {
  id: string;
  type: string;
  prompt: string;
  videoUrl?: string | null;
  audioUrl?: string | null;
  explanationVideoUrl?: string | null;
  basePoints?: number | null;
  options?: QuestionOption[];
  playerAnswer?: PlayerAnswer | null;
  correctOptionIds?: string[];
  correctTexts?: string[];
  match?: MatchData | null;
  roundBackgroundUrl?: string | null;
  roundTitle?: string | null;
  roundDescription?: string | null;
  quizTitle?: string | null;
  quizDescription?: string | null;
  quizIntroSec?: number;
  roundId?: string;
  bettingScope?: 'round' | 'question' | null;
  bettingEnabled?: boolean;
  /** `free` — игрок вводит сумму сам; `presets` — выбирает заложенный вариант. */
  bettingMode?: 'free' | 'presets' | null;
  bettingMinStake?: number | null;
  bettingMaxStake?: number | null;
  bettingPresets?: number[] | null;
  /** @deprecated доля счёта из старых квизов */
  bettingMaxFraction?: string | null;
  playerScore?: number;
  playerStake?: number | null;
  roundStake?: number | null;
  roundIntroSec?: number;
  readTimeSec?: number;
  timeLimitSec?: number;
  roundSummarySec?: number;
  /** Шрифты блоков сцены (без координат раскладки). */
  stageFonts?: PlayerStageFonts;
};

export type DisputeVote = {
  playerId: string;
  displayName?: string;
  approve: boolean | null;
};

export type OpenDispute = {
  disputeId: string;
  status: string;
  questionId?: string;
  proposerPlayerId?: string;
  proposerDisplayName?: string;
  correctTexts?: string[];
  proposedText?: string;
  votes?: DisputeVote[];
};

export type LeaderboardRow = {
  playerId?: string;
  displayName?: string;
  score?: number;
  roundPoints?: number;
};

export type LeaderboardPayload = {
  ok?: boolean;
  kind?: 'round' | 'final' | string;
  rows?: LeaderboardRow[];
};

export type AnswerPayload = {
  questionId: string;
  selectedOptionIds?: string[];
  textAnswer?: string;
  matchOrder?: number[];
};

export type JoinResponse = {
  sessionId: string;
  playerId: string;
  reconnectToken: string;
  roomCode?: string;
};

export type ActiveSessionResponse = {
  active: boolean;
  sessionId: string | null;
  roomCode: string;
};

export type PublicQuizResponse = {
  quizId?: string;
  background?: string | null;
  finalMusic?: string | null;
  fontFamily?: string | null;
  stageTypeStyles?: import('../host/stage-type-styles').StageTypeStyles | null;
};

export function isMultipleChoiceType(type: string | null | undefined): boolean {
  const t = String(type || '')
    .trim()
    .toLowerCase();
  return t === 'multiple_choice' || t === 'multiple' || t.indexOf('multiple') === 0;
}
