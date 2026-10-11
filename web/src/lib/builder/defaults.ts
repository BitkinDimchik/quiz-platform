import type {
  BuilderOption,
  BuilderQuestion,
  BuilderQuestionType,
  BuilderRound,
  BuilderUi,
  DefaultPointsByType,
  QuizDraft,
} from './types';

export const STORAGE_KEY = 'QUIZ_BUILDER_DRAFT_V1';

export const BUILDER_QUESTION_TYPES: readonly BuilderQuestionType[] = [
  'single',
  'multiple',
  'text',
  'matching',
  'hidden',
] as const;

export const BUILDER_QUESTION_TYPE_LABELS: Record<BuilderQuestionType, string> = {
  single: 'Один вариант',
  multiple: 'Несколько вариантов',
  text: 'Текст',
  matching: 'Соответствие',
  hidden: 'Что скрыто на картинке',
};

export function defaultPointsByTypeDefaults(fallback = 1): DefaultPointsByType {
  const n = nonNegativeInt(fallback, 1);
  return {
    single: n,
    multiple: n,
    text: n,
    matching: n,
    hidden: n,
  };
}

/** Собрать карту цен по типам; недостающие берутся из fallback / defaultPoints. */
export function normalizeDefaultPointsByType(
  raw: unknown,
  fallback = 1,
): DefaultPointsByType {
  const base = defaultPointsByTypeDefaults(fallback);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
  const rec = raw as Record<string, unknown>;
  for (const type of BUILDER_QUESTION_TYPES) {
    if (rec[type] == null) continue;
    base[type] = nonNegativeInt(rec[type], fallback);
  }
  return base;
}

export function roundDefaultPointsForType(
  round: Pick<BuilderRound, 'defaultPoints' | 'defaultPointsByType'>,
  type: BuilderQuestionType,
): number {
  const fallback = nonNegativeInt(round.defaultPoints, 1);
  const byType = round.defaultPointsByType;
  if (byType && byType[type] != null) return nonNegativeInt(byType[type], fallback);
  return fallback;
}

export function setRoundDefaultPointsForType(
  round: BuilderRound,
  type: BuilderQuestionType,
  value: number,
): void {
  const fallback = nonNegativeInt(round.defaultPoints, 1);
  const next = normalizeDefaultPointsByType(round.defaultPointsByType, fallback);
  next[type] = nonNegativeInt(value, fallback);
  round.defaultPointsByType = next;
  // Держим общий fallback в синхроне с «один вариант» — для TXT/старых клиентов.
  round.defaultPoints = next.single;
}

export function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id_${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
}

export function emptyQuizDraft(): QuizDraft {
  return {
    title: '',
    description: '',
    background: null,
    finalMusic: null,
    rounds: [],
  };
}

export function emptyUi(): BuilderUi {
  return { step: 1, activeRoundIdx: 0, activeQuestionIdx: 0 };
}

export function defaultRound(): BuilderRound {
  return {
    title: 'Раунд',
    description: '',
    introSec: 6,
    answerRevealMode: 'per_question',
    summarySec: 2,
    leaderboardSec: 6,
    defaultTimer: 15,
    defaultReadSec: 3,
    defaultPoints: 1,
    defaultPointsByType: defaultPointsByTypeDefaults(1),
    background: null,
    music: '',
    leaderboardMusic: '',
    bettingEnabled: false,
    bettingMode: 'free',
    bettingMinStake: null,
    bettingMaxStake: null,
    bettingPresets: [],
    bettingSec: null,
    questions: [],
  };
}

export function positiveSec(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function nonNegativeInt(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

export function usesRoundTimer(q: BuilderQuestion): boolean {
  return q.useRoundTimer !== false;
}

export function usesRoundReadSec(q: BuilderQuestion): boolean {
  return q.useRoundReadSec !== false;
}

export function usesRoundPoints(q: BuilderQuestion): boolean {
  return q.useRoundPoints !== false;
}

export function effectiveQuestionTimer(round: BuilderRound, q: BuilderQuestion): number {
  return usesRoundTimer(q) ? positiveSec(round.defaultTimer, 15) : positiveSec(q.timer, 15);
}

export function effectiveQuestionReadSec(round: BuilderRound, q: BuilderQuestion): number {
  return usesRoundReadSec(q) ? positiveSec(round.defaultReadSec, 3) : positiveSec(q.readSec, 3);
}

export function effectiveQuestionPoints(round: BuilderRound, q: BuilderQuestion): number {
  return usesRoundPoints(q)
    ? roundDefaultPointsForType(round, q.type)
    : nonNegativeInt(q.points, 1);
}

export function normalizeRoundTiming(round: BuilderRound): void {
  round.defaultTimer = positiveSec(round.defaultTimer, 15);
  round.defaultReadSec = positiveSec(round.defaultReadSec, 3);
  round.defaultPoints = nonNegativeInt(round.defaultPoints, 1);
  round.defaultPointsByType = normalizeDefaultPointsByType(
    round.defaultPointsByType,
    round.defaultPoints,
  );
  round.defaultPoints = round.defaultPointsByType.single;
}

export function defaultQuestion(): BuilderQuestion {
  return {
    text: '',
    type: 'single',
    options: [
      { id: uuid(), label: '', imageUrl: null },
      { id: uuid(), label: '', imageUrl: null },
    ],
    correct: [],
    timer: 15,
    readSec: 3,
    useRoundTimer: true,
    useRoundReadSec: true,
    useRoundPoints: true,
    points: 1,
    media: { image: null, video: '', audio: '' },
    explanation: { text: '', image: null, video: '' },
    music: '',
    musicCarry: 0,
  };
}

export function defaultMatchingQuestion(): BuilderQuestion {
  const mk = (): BuilderOption => ({ id: uuid(), label: '', imageUrl: null });
  const left = [mk(), mk(), mk()];
  const right = [mk(), mk(), mk()];
  return {
    text: '',
    type: 'matching',
    matchLeft: left,
    matchRight: right,
    matchCorrect: left.map((_, i) => i + 1),
    matchScoringMode: 'all_or_nothing',
    options: [],
    correct: [],
    timer: 15,
    readSec: 3,
    useRoundTimer: true,
    useRoundReadSec: true,
    useRoundPoints: true,
    points: 1,
    media: { image: null, video: '', audio: '' },
    explanation: { text: '', image: null, video: '' },
    music: '',
    musicCarry: 0,
  };
}

export function normalizeOptionShape(o: BuilderOption & { text?: string; image?: string }): void {
  if (!o || typeof o !== 'object') return;
  if (o.text != null && (o.label == null || o.label === '')) o.label = o.text;
  delete o.text;
  if (o.label === undefined || o.label === null) o.label = '';
  else if (typeof o.label !== 'string') o.label = String(o.label);
  // Do not trim/strip here: ensureIndexes runs on every keystroke and would eat spaces.
  if (o.imageUrl === undefined) o.imageUrl = o.image ?? null;
  delete o.image;
}

export function optionIsFilled(o: { label?: string; imageUrl?: string | null } | null | undefined): boolean {
  if (!o) return false;
  const hasLabel = (o.label || '').trim().length > 0;
  const hasImg = (o.imageUrl || '').trim().length > 0;
  return hasLabel || hasImg;
}

export function normalizeExplanation(q: BuilderQuestion): void {
  const raw = q.explanation;
  const text = raw && typeof raw.text === 'string' ? raw.text : '';
  const image =
    raw && typeof raw.image === 'string' && raw.image.trim() ? raw.image.trim() : null;
  const video =
    raw && typeof raw.video === 'string' ? String(raw.video) : '';
  q.explanation = { text, image, video };
}

export function ensureMatchingShape(q: BuilderQuestion): void {
  if (q.type !== 'matching') return;
  q.matchLeft = q.matchLeft || [];
  q.matchRight = q.matchRight || [];
  while (q.matchLeft.length < 2) q.matchLeft.push({ id: uuid(), label: '', imageUrl: null });
  while (q.matchRight.length < 2) q.matchRight.push({ id: uuid(), label: '', imageUrl: null });
  const n = Math.max(q.matchLeft.length, q.matchRight.length);
  while (q.matchLeft.length < n) q.matchLeft.push({ id: uuid(), label: '', imageUrl: null });
  while (q.matchRight.length < n) q.matchRight.push({ id: uuid(), label: '', imageUrl: null });
  if (!Array.isArray(q.matchCorrect) || q.matchCorrect.length !== n) {
    q.matchCorrect = [];
    for (let i = 0; i < n; i++) q.matchCorrect.push(i + 1);
  } else {
    for (let i = 0; i < n; i++) {
      const v = Number(q.matchCorrect[i]);
      q.matchCorrect[i] = Number.isFinite(v) && v >= 1 && v <= n ? Math.floor(v) : i + 1;
    }
  }
  if (q.matchScoringMode !== 'per_match') q.matchScoringMode = 'all_or_nothing';
}

export function usesTextAnswers(q: BuilderQuestion): boolean {
  return q.type === 'text' || (q.type === 'hidden' && q.hiddenAnswer === 'text');
}

export function usesChoiceAnswers(q: BuilderQuestion): boolean {
  return q.type === 'single' || q.type === 'multiple' || (q.type === 'hidden' && q.hiddenAnswer !== 'text');
}

export function ensureChoiceOptions(q: BuilderQuestion): void {
  if (!usesChoiceAnswers(q)) return;
  q.options = Array.isArray(q.options) ? q.options : [];
  while (q.options.length < 2) {
    q.options.push({ id: uuid(), label: '', imageUrl: null });
  }
  delete q.matchLeft;
  delete q.matchRight;
  delete q.matchCorrect;
  delete q.matchScoringMode;
}

export function ensureIndexes(quizDraft: QuizDraft, ui: BuilderUi): BuilderUi {
  if (quizDraft.rounds.length === 0) {
    quizDraft.rounds.push(defaultRound());
  }
  let activeRoundIdx = ui.activeRoundIdx;
  let activeQuestionIdx = ui.activeQuestionIdx;
  if (activeRoundIdx < 0) activeRoundIdx = 0;
  if (activeRoundIdx >= quizDraft.rounds.length) activeRoundIdx = quizDraft.rounds.length - 1;
  const r = quizDraft.rounds[activeRoundIdx];
  if (!r.questions) r.questions = [];
  if (r.questions.length === 0) r.questions.push(defaultQuestion());
  if (activeQuestionIdx < 0) activeQuestionIdx = 0;
  if (activeQuestionIdx >= r.questions.length) activeQuestionIdx = r.questions.length - 1;
  quizDraft.rounds.forEach((rr) => {
    normalizeRoundTiming(rr);
    (rr.questions || []).forEach((q) => {
      (q.options || []).forEach((o) => normalizeOptionShape(o));
      normalizeExplanation(q);
      if (q.type === 'matching') ensureMatchingShape(q);
      else if (usesChoiceAnswers(q)) ensureChoiceOptions(q);
    });
  });
  return { ...ui, activeRoundIdx, activeQuestionIdx };
}

export function stepDone(quizDraft: QuizDraft, step: number): boolean {
  if (step === 1) return (quizDraft.title || '').trim().length > 0;
  if (step === 2) return (quizDraft.title || '').trim().length > 0;
  if (step === 3) {
    return quizDraft.rounds.length > 0 && quizDraft.rounds.every((r) => isRoundComplete(r));
  }
  if (step === 4) {
    return quizDraft.rounds.length > 0 && quizDraft.rounds.every((r) => isRoundComplete(r));
  }
  return false;
}

export function isQuestionComplete(q: BuilderQuestion): boolean {
  if (!(q.text || '').trim().length) return false;
  if (q.type === 'hidden' && !(q.media?.image || '').trim()) return false;
  if (usesTextAnswers(q)) return true;
  if (q.type === 'matching') {
    ensureMatchingShape(q);
    const L = q.matchLeft || [];
    const R = q.matchRight || [];
    if (L.length < 2 || R.length !== L.length) return false;
    return L.every(optionIsFilled) && R.every(optionIsFilled);
  }
  const filled = (q.options || []).filter(optionIsFilled);
  if (filled.length < 2) return false;
  return (q.correct || []).length > 0;
}

export function isRoundComplete(round: BuilderRound): boolean {
  if (!(round.title || '').trim().length) return false;
  const qs = round.questions || [];
  if (qs.length === 0) return false;
  return qs.every(isQuestionComplete);
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function fileToText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsText(file, 'utf-8');
  });
}

export function mapBuilderTypeToApi(q: BuilderQuestion | string): string {
  if (typeof q !== 'string') {
    if (q.type === 'hidden') return q.hiddenAnswer === 'text' ? 'text_input' : 'single_choice';
    return mapBuilderTypeToApi(q.type);
  }
  if (q === 'multiple') return 'multiple_choice';
  if (q === 'text') return 'text_input';
  if (q === 'matching') return 'matching';
  return 'single_choice';
}
