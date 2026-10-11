export const PACK_FORMAT = 'quizzes-pack' as const;
export const PACK_VERSION = 1 as const;

export type PackMediaKind = 'image' | 'audio' | 'video';

export type PackMatchSide = { id: string; label: string; imageUrl: string | null };
export type PackOption = { id: string; label: string; imageUrl: string | null };

export type PackQuestion = {
  id?: string;
  text: string;
  type: 'single' | 'multiple' | 'text' | 'matching';
  timer: number;
  points?: number;
  readSec?: number;
  inheritTimer?: boolean;
  inheritReadSec?: boolean;
  inheritPoints?: boolean;
  media: { image: string | null; video: string; audio: string };
  explanation?: { text: string; image: string | null; video?: string };
  music?: string;
  musicCarry?: number;
  options: PackOption[];
  correct: string[];
  matchLeft?: PackMatchSide[];
  matchRight?: PackMatchSide[];
  matchCorrect?: number[];
  matchScoringMode?: string;
  stageLayout?: unknown;
  imageHideRect?: unknown;
  imageHideRects?: unknown;
  bettingEnabled?: boolean;
  bettingMode?: string;
  bettingMinStake?: number | null;
  bettingMaxStake?: number | null;
  bettingPresets?: number[];
  bettingSec?: number | null;
  /** @deprecated доля счёта из старых квизов */
  bettingMaxFraction?: string | null;
};

export type PackRound = {
  title: string;
  description: string;
  background: string | null;
  answerRevealMode?: string;
  introSec?: number;
  summarySec?: number;
  leaderboardSec?: number;
  defaultTimerSec?: number;
  defaultReadSec?: number;
  defaultPoints?: number;
  defaultPointsByType?: Partial<Record<'single' | 'multiple' | 'text' | 'matching' | 'hidden', number>>;
  music?: string;
  leaderboardMusic?: string;
  bettingEnabled?: boolean;
  bettingMode?: string;
  bettingMinStake?: number | null;
  bettingMaxStake?: number | null;
  bettingPresets?: number[];
  bettingSec?: number | null;
  /** @deprecated доля счёта из старых квизов */
  bettingMaxFraction?: string | null;
  questions: PackQuestion[];
};

export type QuizBuilderPayload = {
  quizId?: string;
  title: string;
  description: string;
  background: string | null;
  finalMusic: string | null;
  fontFamily?: string | null;
  stageTypeStyles?: unknown;
  rounds: PackRound[];
};

export type QuizPackManifest = {
  format: typeof PACK_FORMAT;
  version: typeof PACK_VERSION;
  exportedAt: string;
  missingMedia?: string[];
  quiz: QuizBuilderPayload;
};

export type PackFileSource =
  | { type: 'buffer'; data: Buffer }
  | { type: 'path'; absPath: string };

export type PackFile = {
  zipRel: string;
  source: PackFileSource;
};
