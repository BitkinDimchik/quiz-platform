import type { StageLayout } from './stage-layout';
import type { ImageHideRect } from './image-hide-rect';

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

export type HostSession = {
  id?: string;
  quizId?: string;
  roomCode?: string;
  phase?: SessionPhase;
  currentQuestionId?: string | null;
  phaseDeadlineAt?: string | null;
  endedAt?: string | null;
  vipPlayerId?: string | null;
  isPaused?: boolean;
  pausedRemainingMs?: number | null;
  [key: string]: unknown;
};

export type HostPlayer = {
  id: string;
  displayName?: string;
  avatarUrl?: string | null;
  score?: number;
  isVip?: boolean;
};

export type MatchSide = {
  id: string;
  label?: string | null;
  imageUrl?: string | null;
};

export type QuestionView = {
  id?: string;
  type?: string;
  prompt?: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  audioUrl?: string | null;
  timeLimitSec?: number;
  basePoints?: number;
  roundTitle?: string;
  roundDescription?: string;
  quizTitle?: string;
  quizDescription?: string;
  quizIntroSec?: number;
  roundBackgroundUrl?: string | null;
  roundMusicUrl?: string | null;
  roundLeaderboardMusicUrl?: string | null;
  roundIntroSec?: number;
  roundSummarySec?: number;
  readTimeSec?: number;
  questionMusicUrl?: string | null;
  questionMusicCarry?: number;
  options?: Array<{
    id: string;
    position?: number;
    label?: string;
    imageUrl?: string | null;
  }>;
  correctOptionIds?: string[];
  correctTexts?: string[];
  explanationText?: string | null;
  explanationImageUrl?: string | null;
  explanationVideoUrl?: string | null;
  match?: {
    left: MatchSide[];
    right: MatchSide[];
    correct: number[];
  };
  stageLayout?: StageLayout | null;
  /** Раскладка заставки квиза (quiz_intro). */
  quizStageLayout?: StageLayout | null;
  /** Раскладка заставки раунда (round_intro). */
  roundStageLayout?: StageLayout | null;
  quizId?: string;
  roundId?: string;
  imageHideRect?: ImageHideRect | null;
  imageHideRects?: ImageHideRect[] | null;
};

export type LeaderboardPayload = {
  kind?: 'round' | 'final' | string;
  rows?: Array<{
    displayName?: string;
    score?: number;
    roundPoints?: number;
  }>;
  ok?: boolean;
};

export type SoloPhase =
  | 'quiz_intro'
  | 'round_intro'
  | 'question_read'
  | 'question'
  | 'answer_reveal'
  | 'round_summary'
  | 'leaderboard'
  | 'finished';

export type SoloBuilderPayload = {
  title?: string;
  description?: string;
  introSec?: number;
  background?: string | null;
  finalMusic?: string | null;
  fontFamily?: string | null;
  stageTypeStyles?: import('./stage-type-styles').StageTypeStyles | null;
  stageLayout?: StageLayout | null;
  rounds?: SoloRound[];
};

export type SoloRound = {
  id?: string;
  title?: string;
  description?: string;
  background?: string | null;
  music?: string | null;
  leaderboardMusic?: string | null;
  introSec?: number;
  summarySec?: number;
  leaderboardSec?: number;
  answerRevealMode?: 'per_question' | 'end_of_round';
  stageLayout?: StageLayout | null;
  questions?: SoloQuestion[];
};

export type SoloQuestion = {
  id?: string;
  type?: string;
  text?: string;
  timer?: number;
  points?: number;
  readSec?: number;
  music?: string | null;
  musicCarry?: number;
  media?: { image?: string | null; video?: string | null; audio?: string | null };
  options?: Array<{ id?: string; label?: string; imageUrl?: string | null }>;
  correct?: string[];
  matchLeft?: MatchSide[];
  matchRight?: MatchSide[];
  matchCorrect?: number[];
  explanation?: { text?: string; image?: string | null; video?: string | null } | null;
  explanationText?: string | null;
  explanationImageUrl?: string | null;
  explanationVideoUrl?: string | null;
  stageLayout?: StageLayout | null;
  imageHideRect?: ImageHideRect | null;
  imageHideRects?: ImageHideRect[] | null;
  hiddenAnswer?: 'single' | 'text';
};
