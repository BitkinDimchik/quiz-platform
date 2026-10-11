export type BuilderQuestionType = 'single' | 'multiple' | 'text' | 'matching' | 'hidden';
export type HiddenAnswerMode = 'single' | 'text';
export type MatchScoringMode = 'all_or_nothing' | 'per_match';
export type AnswerRevealMode = 'per_question' | 'end_of_round';
/** Как игрок выбирает ставку: вводит сумму сам или берёт готовый вариант. */
export type BettingMode = 'free' | 'presets';

/** Цена вопроса по умолчанию отдельно для каждого типа. */
export type DefaultPointsByType = Record<BuilderQuestionType, number>;

export type BuilderOption = {
  id: string;
  label: string;
  imageUrl: string | null;
};

export type BuilderQuestion = {
  id?: string;
  text: string;
  type: BuilderQuestionType;
  /** Только для type=hidden: варианты или свободный текст. */
  hiddenAnswer?: HiddenAnswerMode;
  /** Чёрные плашки на картинке, % от изображения. */
  imageHideRects?: import('../host/image-hide-rect').ImageHideRect[];
  /** Устаревшее поле: одна плашка. При загрузке поднимается в imageHideRects. */
  imageHideRect?: import('../host/image-hide-rect').ImageHideRect | null;
  options: BuilderOption[];
  correct: string[];
  matchLeft?: BuilderOption[];
  matchRight?: BuilderOption[];
  matchCorrect?: number[];
  matchScoringMode?: MatchScoringMode;
  timer: number;
  readSec: number;
  /** undefined/true — наследовать defaultTimer раунда. */
  useRoundTimer?: boolean;
  /** undefined/true — наследовать defaultReadSec раунда. */
  useRoundReadSec?: boolean;
  points: number;
  /** undefined/true — наследовать defaultPoints раунда. */
  useRoundPoints?: boolean;
  media: { image: string | null; video: string; audio: string };
  explanation: { text: string; image: string | null; video: string };
  music: string;
  musicCarry: number;
  /** Ставка перед этим вопросом (если у раунда не включены ставки на весь раунд). */
  bettingEnabled?: boolean;
  bettingMode?: BettingMode;
  bettingMinStake?: number | null;
  bettingMaxStake?: number | null;
  bettingPresets?: number[];
  bettingSec?: number | null;
  stageLayout?: import('../host/stage-layout').StageLayout | null;
};

export type BuilderRound = {
  /** UUID раунда с сервера (для PATCH layout заставки). */
  id?: string;
  title: string;
  description: string;
  introSec: number;
  answerRevealMode: AnswerRevealMode;
  summarySec: number;
  leaderboardSec: number;
  /** Время ответа по умолчанию для вопросов раунда (сек). */
  defaultTimer: number;
  /** Время на прочтение по умолчанию для вопросов раунда (сек). */
  defaultReadSec: number;
  /**
   * Общий fallback цены (очки), если для типа нет значения в defaultPointsByType.
   * Для старых черновиков и TXT `цена:`.
   */
  defaultPoints: number;
  /** Цена по умолчанию по типам вопросов. */
  defaultPointsByType?: Partial<DefaultPointsByType> | null;
  background: string | null;
  music: string;
  leaderboardMusic: string;
  /** Ставки в начале раунда: игрок рискует очками за правильный/неправильный ответ. */
  bettingEnabled?: boolean;
  bettingMode?: BettingMode;
  bettingMinStake?: number | null;
  bettingMaxStake?: number | null;
  bettingPresets?: number[];
  /** Сколько секунд игроки видят экран ставки (intro раунда / прочтение вопроса). */
  bettingSec?: number | null;
  /** Раскладка заставки раунда (host intro). */
  stageLayout?: import('../host/stage-layout').StageLayout | null;
  questions: BuilderQuestion[];
};

export type QuizDraft = {
  title: string;
  description: string;
  background: string | null;
  finalMusic: string | null;
  /** Шрифт по умолчанию для всех текстов на сцене; отдельные блоки могут переопределить в stageLayout. */
  fontFamily?: string | null;
  /** Размер и семейство для однотипных объектов на всех сценах. */
  stageTypeStyles?: import('../host/stage-type-styles').StageTypeStyles | null;
  /** Раскладка заставки квиза (host quiz_intro). */
  stageLayout?: import('../host/stage-layout').StageLayout | null;
  rounds: BuilderRound[];
};

export type BuilderUi = {
  step: 1 | 2 | 3 | 4;
  activeRoundIdx: number;
  activeQuestionIdx: number;
};

export type StoredBuilderDraft = {
  quizDraft: QuizDraft;
  ui: BuilderUi;
};

export type PreviewStartPhase = 'quiz_intro' | 'round_intro' | 'question_read';

export type PreviewHostPayload = {
  type: 'quiz_preview_host';
  quiz: QuizDraft;
  activeRoundIdx: number;
  activeQuestionIdx: number;
  /** С какого экрана открыть предпросмотр (зависит от вкладки конструктора). */
  startPhase?: PreviewStartPhase;
};

export type MusicUploadTarget =
  | 'quizFinalMusic'
  | 'roundMusic'
  | 'roundLeaderboardMusic'
  | 'qMusic'
  | 'mediaAudio';
