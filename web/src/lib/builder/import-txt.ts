import { defaultMatchingQuestion, defaultPointsByTypeDefaults, defaultQuestion, defaultRound, nonNegativeInt, normalizeDefaultPointsByType, positiveSec, usesTextAnswers, uuid } from './defaults';
import type { AnswerRevealMode, BuilderQuestion, BuilderQuestionType, BuilderRound } from './types';

function splitTextAnswerVariants(raw: string): string[] {
  return String(raw || '')
    .split(/\s*(?:\|\||;)\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function normalizeRawText(raw: string): string {
  return stripBom(String(raw || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim());
}
function normalizeImportText(raw: string): string {
  let s = normalizeRawText(raw);
  s = s.replace(/(\s|^)(\d{1,3})\.\s+/g, '\n$2. ');
  s = s.replace(/(^|\n)\s*(\+?\s*[A-DА-Г]\))\s*/g, '\n$2 ');
  s = s.replace(/(^|\n)\s*((?:текст\s+)?Q\d{1,3})\s+/gi, '\n$2 ');
  s = s.replace(/(^|\n)\s*([A-DА-Г])\s+/g, '\n$2 ');
  s = s.replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

export type RoundConfigImport = Partial<
  Pick<
    BuilderRound,
    | 'defaultTimer'
    | 'defaultReadSec'
    | 'defaultPoints'
    | 'defaultPointsByType'
    | 'introSec'
    | 'summarySec'
    | 'leaderboardSec'
    | 'answerRevealMode'
  >
>;

const CONFIG_LINE = /^(?:@+\s*)?([\w\u0400-\u04FF-]+)\s*[:=]\s*(.+)$/u;

const POINTS_TYPE_KEYS: Record<string, BuilderQuestionType> = {
  цена_один: 'single',
  ценаодин: 'single',
  points_single: 'single',
  цена_несколько: 'multiple',
  ценанесколько: 'multiple',
  points_multiple: 'multiple',
  цена_текст: 'text',
  ценатекст: 'text',
  points_text: 'text',
  цена_соответствие: 'matching',
  ценасоответствие: 'matching',
  points_matching: 'matching',
  цена_скрыто: 'hidden',
  ценаскрыто: 'hidden',
  points_hidden: 'hidden',
};

const CONFIG_KEYS: Record<string, keyof RoundConfigImport> = {
  timer: 'defaultTimer',
  defaulttimer: 'defaultTimer',
  default_timer: 'defaultTimer',
  defaulttimersec: 'defaultTimer',
  timelimit: 'defaultTimer',
  timelimitsec: 'defaultTimer',
  time: 'defaultTimer',
  answer: 'defaultTimer',
  ответ: 'defaultTimer',
  время_ответа: 'defaultTimer',
  времяответа: 'defaultTimer',

  read: 'defaultReadSec',
  readsec: 'defaultReadSec',
  defaultread: 'defaultReadSec',
  defaultreadsec: 'defaultReadSec',
  read_time: 'defaultReadSec',
  прочтение: 'defaultReadSec',
  время_прочтения: 'defaultReadSec',
  времяпрочтения: 'defaultReadSec',

  points: 'defaultPoints',
  defaultpoints: 'defaultPoints',
  basepoints: 'defaultPoints',
  price: 'defaultPoints',
  score: 'defaultPoints',
  цена: 'defaultPoints',
  очки: 'defaultPoints',

  intro: 'introSec',
  introsec: 'introSec',
  round_intro: 'introSec',
  экран: 'introSec',
  экран_раунда: 'introSec',
  экранраунда: 'introSec',

  summary: 'summarySec',
  summarysec: 'summarySec',
  reveal_time: 'summarySec',
  answer_summary: 'summarySec',
  показ_ответа: 'summarySec',
  показответа: 'summarySec',
  показ_правильного: 'summarySec',

  leaderboard: 'leaderboardSec',
  leaderboardsec: 'leaderboardSec',
  results: 'leaderboardSec',
  итоги: 'leaderboardSec',
  итоги_раунда: 'leaderboardSec',
  итогираунда: 'leaderboardSec',

  reveal: 'answerRevealMode',
  answerreveal: 'answerRevealMode',
  answerrevealmode: 'answerRevealMode',
  reveal_mode: 'answerRevealMode',
  открытие_ответов: 'answerRevealMode',
  показ_ответов: 'answerRevealMode',
  ответы: 'answerRevealMode',
};

export function hasRoundConfig(config: RoundConfigImport): boolean {
  return Object.keys(config).length > 0;
}

function normalizeConfigKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function parseRevealMode(raw: string): AnswerRevealMode | undefined {
  const v = raw.trim().toLowerCase();
  if (
    v.includes('end') ||
    v.includes('round') ||
    v.includes('конец') ||
    v.includes('конце') ||
    v.includes('раунд')
  ) {
    return 'end_of_round';
  }
  if (
    v.includes('per') ||
    v.includes('each') ||
    v.includes('question') ||
    v.includes('кажд') ||
    v.includes('вопрос')
  ) {
    return 'per_question';
  }
  return undefined;
}

function assignConfigValue(config: RoundConfigImport, key: keyof RoundConfigImport, raw: string): void {
  const val = raw.trim();
  if (!val) return;
  if (key === 'answerRevealMode') {
    const mode = parseRevealMode(val);
    if (mode) config.answerRevealMode = mode;
    return;
  }
  const n = parseInt(val, 10);
  if (!Number.isFinite(n)) return;
  if (key === 'defaultPoints') config.defaultPoints = nonNegativeInt(n, 1);
  else if (key === 'defaultTimer') config.defaultTimer = positiveSec(n, 15);
  else if (key === 'defaultReadSec') config.defaultReadSec = positiveSec(n, 3);
  else if (key === 'introSec') config.introSec = positiveSec(n, 6);
  else if (key === 'summarySec') config.summarySec = positiveSec(n, 2);
  else if (key === 'leaderboardSec') config.leaderboardSec = positiveSec(n, 6);
}

function parseConfigLine(line: string, config: RoundConfigImport): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return true;
  const m = CONFIG_LINE.exec(trimmed);
  if (!m) return false;
  const norm = normalizeConfigKey(m[1]);
  const typeKey = POINTS_TYPE_KEYS[norm] || POINTS_TYPE_KEYS[norm.replace(/_/g, '')];
  if (typeKey) {
    const n = parseInt(m[2].trim(), 10);
    if (!Number.isFinite(n)) return true;
    config.defaultPointsByType = {
      ...(config.defaultPointsByType || {}),
      [typeKey]: nonNegativeInt(n, 1),
    };
    return true;
  }
  const field = CONFIG_KEYS[norm];
  if (!field) return false;
  assignConfigValue(config, field, m[2]);
  return true;
}

function isChoiceOptionLine(line: string): boolean {
  return /^(\+?\s*)[A-DА-Г]\)/.test(line) || /^[A-DА-Г]\s+\S/.test(line);
}

function isMatchItemLine(line: string): boolean {
  return /^(?:L|R|Л|П|LEFT|RIGHT)\)\s*/i.test(line) || /^(?:LEFT|RIGHT|слева|справа)\s*:\s*.+/i.test(line);
}

function isMatchPairsLine(line: string): boolean {
  return /^(?:=|MATCH|пары)\s*[\d\s,;]+$/i.test(line.trim());
}

function takeExplanation(lines: string[]): { lines: string[]; explanation: string } {
  const rest: string[] = [];
  const bits: string[] = [];
  for (const line of lines) {
    const m = /^(?:пояснение|explanation)\s*:\s*(.+)$/i.exec(line);
    if (m) bits.push(m[1].trim());
    else rest.push(line);
  }
  return { lines: rest, explanation: bits.join(' ').trim() };
}

function applyExplanation(q: BuilderQuestion, text: string): void {
  if (!text) return;
  q.explanation = { text, image: null, video: '' };
}

function isQuestionStart(line: string): boolean {
  const t = line.trim();
  return /^(?:текст\s+)?Q\d+\b/i.test(t) || /^\d{1,3}\.\s/.test(t);
}

function isSectionHeader(line: string): boolean {
  return /^\[\s*(?:config|settings|настройки|setting)\s*\]\s*$/i.test(line.trim());
}

/** Разбирает блок key=value до первого вопроса. */
export function parseRoundConfigBlock(text: string): { config: RoundConfigImport; rest: string } {
  const config: RoundConfigImport = {};
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  let i = 0;
  if (lines[0] && isSectionHeader(lines[0])) i = 1;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) {
      i++;
      continue;
    }
    if (isSectionHeader(trimmed)) {
      i++;
      continue;
    }
    if (isQuestionStart(trimmed)) break;
    if (/^\(.*\)\s*$/.test(trimmed)) {
      i++;
      continue;
    }
    if (parseConfigLine(line, config)) {
      i++;
      continue;
    }
    break;
  }

  return { config, rest: lines.slice(i).join('\n').trim() };
}

export function applyRoundConfig(round: BuilderRound, config: RoundConfigImport): void {
  if (config.defaultTimer != null) round.defaultTimer = config.defaultTimer;
  if (config.defaultReadSec != null) round.defaultReadSec = config.defaultReadSec;
  if (config.defaultPoints != null) {
    round.defaultPoints = config.defaultPoints;
    round.defaultPointsByType = defaultPointsByTypeDefaults(config.defaultPoints);
  }
  if (config.defaultPointsByType) {
    const fallback = config.defaultPoints ?? round.defaultPoints ?? 1;
    round.defaultPointsByType = normalizeDefaultPointsByType(
      {
        ...normalizeDefaultPointsByType(round.defaultPointsByType, fallback),
        ...config.defaultPointsByType,
      },
      fallback,
    );
    round.defaultPoints = round.defaultPointsByType.single;
  }
  if (config.introSec != null) round.introSec = config.introSec;
  if (config.summarySec != null) round.summarySec = config.summarySec;
  if (config.leaderboardSec != null) round.leaderboardSec = config.leaderboardSec;
  if (config.answerRevealMode != null) round.answerRevealMode = config.answerRevealMode;
}

/** Импорт только настроек раунда из TXT (без вопросов). */
export function parseRoundConfigTxt(raw: string): RoundConfigImport | null {
  const text = normalizeRawText(raw);
  if (!text) return null;

  // Тот же разбор, что и при импорте вопросов: понимает «Раунд N: …» перед настройками.
  const imported = parseTxtImport(text);
  if (imported.length > 0) {
    const merged: RoundConfigImport = {};
    for (const item of imported) Object.assign(merged, item.config);
    if (hasRoundConfig(merged)) return merged;
  }

  let work = text;
  const lines = work.split('\n');
  const firstLine = (lines[0] || '').trim();
  if (/^\s*Раунд\s+\d+/i.test(firstLine)) {
    work = lines.slice(1).join('\n').trim();
  } else if (
    firstLine &&
    !CONFIG_LINE.test(firstLine) &&
    !isQuestionStart(firstLine) &&
    !isSectionHeader(firstLine)
  ) {
    const hdr = parseRoundHeader(text);
    if (hdr.rest) work = hdr.rest;
  }

  const { config } = parseRoundConfigBlock(work);
  return hasRoundConfig(config) ? config : null;
}

function parseRoundHeader(chunk: string): { title: string; description: string; rest: string } {
  const s = chunk.trim();
  const m = /^([^;]+?)\s*;\s*\(([\s\S]*?)\)\s*;?\s*([\s\S]*)$/m.exec(s);
  if (m) return { title: m[1].trim(), description: m[2].trim(), rest: (m[3] || '').trim() };
  const lines = s.split('\n').map((x) => x.trim()).filter(Boolean);
  const title = lines[0] || 'Раунд';
  let description = '';
  let startIdx = 1;
  if (lines[1] && lines[1].startsWith('(') && lines[1].endsWith(')')) {
    description = lines[1].slice(1, -1).trim();
    startIdx = 2;
  }
  return { title, description, rest: lines.slice(startIdx).join('\n').trim() };
}

function parseRoundTitleLine(roundLine: string): { title: string; description: string } {
  const sm = /^\s*Раунд\s+\d+\s*:\s*(.+)$/i.exec(roundLine.trim());
  const inner = (sm?.[1] || roundLine).trim();
  const dm = /^(.+?)\s*;\s*\(([\s\S]*)\)\s*$/.exec(inner);
  if (dm) return { title: dm[1].trim() || 'Раунд', description: dm[2].trim() };
  return { title: inner || 'Раунд', description: '' };
}

function parseRoundChunk(chunk: string): { round: BuilderRound; config: RoundConfigImport } {
  const r = defaultRound();
  let work = chunk.trim();
  const config: RoundConfigImport = {};

  const lines = work.split('\n');
  const firstLine = (lines[0] || '').trim();
  if (/^\s*Раунд\s+\d+/i.test(firstLine)) {
    const meta = parseRoundTitleLine(firstLine);
    r.title = meta.title;
    r.description = meta.description;
    work = lines.slice(1).join('\n').trim();
    const more = work.split('\n');
    const wrapped = /^\(([\s\S]*)\)\s*$/.exec((more[0] || '').trim());
    if (wrapped) {
      if (!r.description) r.description = wrapped[1].trim();
      work = more.slice(1).join('\n').trim();
    }
  } else if (firstLine && !CONFIG_LINE.test(firstLine) && !isQuestionStart(firstLine)) {
    const hdr = parseRoundHeader(chunk);
    r.title = hdr.title || r.title;
    r.description = hdr.description || '';
    work = hdr.rest;
  }

  const parsed = parseRoundConfigBlock(work);
  Object.assign(config, parsed.config);
  applyRoundConfig(r, parsed.config);
  r.questions = parseQuestionsBlock(parsed.rest);
  return { round: r, config };
}

const QUESTION_PART_SPLIT = /\n(?=\s*(?:(?:текст\s+)?Q\d{1,3}\b|\d{1,3}\.\s))/i;

function splitQuestionParts(block: string): string[] {
  const s = block.trim();
  if (!s) return [];
  return s.split(QUESTION_PART_SPLIT).map((x) => x.trim()).filter(Boolean);
}

/** Убирает префикс «текст» / «текст Q3» из тела вопроса. */
function stripTextQuestionPrefix(raw: string): string {
  return raw.replace(/^\s*текст(?:\s+)?(?:Q\d{1,3}\s+)?/i, '').trim();
}

function partIsTextQuestion(part: string, body: string): boolean {
  return /^\s*текст(?:\s|$)/i.test(part) || /^\s*текст(?:\s|$)/i.test(body);
}

const INLINE_ANSWER_RE =
  /^([\s\S]*?)\s*(?:\|\||=>|→|::|—>|ответ\s*:\s*|ОТВЕТ\s*:\s*|ANSWER\s*:\s*)\s*([\s\S]+)$/i;

function hasStructuredQuestionLines(lines: string[]): boolean {
  return lines.some((l) => isChoiceOptionLine(l) || isMatchItemLine(l) || isMatchPairsLine(l));
}

/** Текстовый вопрос: первая строка — формулировка, далее варианты ответа или inline через ||. */
function parseFreeformTextQuestion(
  lines: string[],
  explanation: string,
  stripPrefix = false,
): BuilderQuestion | null {
  if (!lines.length) return null;
  let prompt = (lines[0] || '').trim();
  if (stripPrefix) prompt = stripTextQuestionPrefix(prompt);
  if (!prompt) return null;
  let answers = lines.slice(1).flatMap((line) => splitTextAnswerVariants(line));
  if (answers.length === 0) {
    const m = INLINE_ANSWER_RE.exec(prompt);
    if (m) {
      prompt = (m[1] || '').trim();
      const a = (m[2] || '').trim();
      if (a) answers = splitTextAnswerVariants(a);
    }
  }
  const q = defaultQuestion();
  q.text = prompt;
  q.type = 'text';
  q.correct = answers;
  applyExplanation(q, explanation);
  return q;
}

function parseTextQuestionBody(body: string, explanation: string): BuilderQuestion | null {
  const peeled = takeExplanation(body.split('\n').map((x) => x.trim()).filter(Boolean));
  const expl = explanation || peeled.explanation;
  return parseFreeformTextQuestion(peeled.lines, expl, true);
}

function parseMatchQuestion(prompt: string, lines: string[]): BuilderQuestion | null {
  const left: BuilderQuestion['matchLeft'] = [];
  const right: BuilderQuestion['matchRight'] = [];
  let pairs: number[] = [];
  for (const line of lines) {
    const lm = /^(?:L|Л|LEFT)\)\s*(.+)$/i.exec(line) || /^(?:LEFT|слева)\s*:\s*(.+)$/i.exec(line);
    if (lm) {
      left!.push({ id: uuid(), label: lm[1].trim(), imageUrl: null });
      continue;
    }
    const rm = /^(?:R|П|RIGHT)\)\s*(.+)$/i.exec(line) || /^(?:RIGHT|справа)\s*:\s*(.+)$/i.exec(line);
    if (rm) {
      right!.push({ id: uuid(), label: rm[1].trim(), imageUrl: null });
      continue;
    }
    const cm = /^(?:=|MATCH|пары)\s*([\d\s,;]+)$/i.exec(line.trim());
    if (cm) {
      pairs = cm[1]
        .split(/[\s,;]+/)
        .map((x) => Number(x))
        .filter((n) => Number.isFinite(n) && n >= 1);
    }
  }
  if (!left?.length || !right?.length) return null;
  const q = defaultMatchingQuestion();
  q.text = prompt;
  q.matchLeft = left;
  q.matchRight = right;
  const n = Math.max(left.length, right.length);
  q.matchCorrect = left.map((_, i) => {
    const v = pairs[i];
    return Number.isFinite(v) && v >= 1 && v <= right.length ? Math.floor(v) : i + 1;
  });
  while (q.matchCorrect.length < n) q.matchCorrect.push(q.matchCorrect.length + 1);
  q.options = [];
  q.correct = [];
  return q;
}

function parseQuestionsBlock(block: string): BuilderQuestion[] {
  const out: BuilderQuestion[] = [];
  const parts = splitQuestionParts(block);
  if (!parts.length) return out;

  for (const part of parts) {
    const qmLegacy = /^(\d{1,3})\.\s*([\s\S]*)$/.exec(part);
    const qmNew = /^\s*(?:текст\s+)?Q(\d{1,3})\s+([\s\S]*)$/i.exec(part);
    const body = qmLegacy ? qmLegacy[2].trim() : qmNew ? qmNew[2].trim() : part.trim();
    if (!body) continue;

    if (partIsTextQuestion(part, body)) {
      const q = parseTextQuestionBody(body, '');
      if (q) out.push(q);
      continue;
    }

    const peeled = takeExplanation(body.split('\n').map((x) => x.trim()).filter(Boolean));
    const lines = peeled.lines;
    const explanation = peeled.explanation;

    if (!hasStructuredQuestionLines(lines)) {
      const q = parseFreeformTextQuestion(lines, explanation, false);
      if (q) {
        out.push(q);
        continue;
      }
    }

    const promptLines: string[] = [];
    let idx = 0;
    while (
      idx < lines.length &&
      !isChoiceOptionLine(lines[idx]) &&
      !isMatchItemLine(lines[idx]) &&
      !isMatchPairsLine(lines[idx])
    ) {
      promptLines.push(lines[idx]);
      idx++;
    }
    const prompt = promptLines.join(' ').trim();
    if (!prompt) continue;

    const rest = lines.slice(idx);
    if (rest.some(isMatchItemLine)) {
      const q = parseMatchQuestion(prompt, rest);
      if (q) {
        applyExplanation(q, explanation);
        out.push(q);
        continue;
      }
    }

    const opts: BuilderQuestion['options'] = [];
    const correctIds: string[] = [];
    for (const line of rest) {
      const omLegacy = /^(\+?)\s*([A-DА-Г])\)\s*(.+)$/.exec(line);
      const omNew = /^([A-DА-Г])\s+(.+)$/.exec(line);
      if (!omLegacy && !omNew) continue;
      const rawLabel = String(omLegacy ? omLegacy[3] : omNew![2]).trim();
      const isCorrect = Boolean(omLegacy && omLegacy[1]) || /\bCORRECT\b/i.test(rawLabel);
      const label = rawLabel.replace(/\s*\bCORRECT\b\s*/gi, ' ').trim();
      const id = uuid();
      opts.push({ id, label, imageUrl: null });
      if (isCorrect) correctIds.push(id);
    }

    if (opts.length === 0) {
      const m = INLINE_ANSWER_RE.exec(prompt);
      if (m) {
        const q = defaultQuestion();
        q.text = (m[1] || '').trim();
        q.type = 'text';
        const a = (m[2] || '').trim();
        q.correct = a ? splitTextAnswerVariants(a) : [];
        applyExplanation(q, explanation);
        out.push(q);
        continue;
      }
    }

    const q = defaultQuestion();
    q.text = prompt;
    q.options = opts.length ? opts : q.options;
    q.type = correctIds.length > 1 ? 'multiple' : 'single';
    q.correct = correctIds.length ? (q.type === 'multiple' ? correctIds : [correctIds[0]]) : [];
    applyExplanation(q, explanation);
    out.push(q);
  }
  return out;
}

export type TxtImportRound = {
  round: BuilderRound;
  config: RoundConfigImport;
};

export function parseTxtImport(raw: string): TxtImportRound[] {
  const text = normalizeImportText(raw);
  if (!text) return [];

  const hasRounds = /(^|\n)\s*Раунд\s+\d+/i.test(text);
  const chunks = hasRounds
    ? text.split(/\n(?=\s*Раунд\s+\d+)/i).map((x) => x.trim()).filter(Boolean)
    : [text];

  const rounds: TxtImportRound[] = [];
  for (const chunk of chunks) {
    const parsed = parseRoundChunk(chunk);
    if (parsed.round.questions.length === 0 && !hasRoundConfig(parsed.config)) continue;
    rounds.push(parsed);
  }
  return rounds;
}

const OPTION_LETTERS = ['A', 'B', 'C', 'D'] as const;

function serializeQuestion(q: BuilderQuestion, n: number): string[] {
  const lines: string[] = [];
  const prompt = (q.text || '').trim() || `Вопрос ${n}`;
  const expl = (q.explanation?.text || '').trim();

  if (q.type === 'matching') {
    lines.push(`Q${n} ${prompt}`);
    for (const item of q.matchLeft || []) {
      const label = (item.label || '').trim();
      if (label) lines.push(`L) ${label}`);
    }
    for (const item of q.matchRight || []) {
      const label = (item.label || '').trim();
      if (label) lines.push(`R) ${label}`);
    }
    const pairs = (q.matchCorrect || []).filter((x) => Number.isFinite(Number(x)));
    if (pairs.length) lines.push(`= ${pairs.join(' ')}`);
    if (expl) lines.push(`пояснение: ${expl}`);
    return lines;
  }

  if (usesTextAnswers(q)) {
    lines.push(`текст Q${n} ${prompt}`);
    const answers = (q.correct || []).map((s) => String(s || '').trim()).filter(Boolean);
    for (const a of answers) lines.push(a);
    if (expl) lines.push(`пояснение: ${expl}`);
    return lines;
  }

  lines.push(`Q${n} ${prompt}`);
  const opts = (q.options || []).filter((o) => (o.label || '').trim());
  const correct = new Set(q.correct || []);
  opts.slice(0, OPTION_LETTERS.length).forEach((o, i) => {
    const mark = correct.has(o.id) ? ' CORRECT' : '';
    lines.push(`${OPTION_LETTERS[i]}) ${(o.label || '').trim()}${mark}`);
  });
  if (expl) lines.push(`пояснение: ${expl}`);
  return lines;
}

/** Текст раунда без музыки, фонов и медиа. */
export function serializeRoundToTxt(round: BuilderRound, roundNumber = 1): string {
  const lines: string[] = [];
  const title = (round.title || 'Раунд').trim() || 'Раунд';
  const desc = (round.description || '').trim();
  lines.push(desc ? `Раунд ${roundNumber}: ${title} ; (${desc})` : `Раунд ${roundNumber}: ${title}`);
  lines.push('');
  lines.push('[настройки]');
  lines.push(`время_ответа: ${round.defaultTimer}`);
  lines.push(`время_прочтения: ${round.defaultReadSec}`);
  const byType = normalizeDefaultPointsByType(round.defaultPointsByType, round.defaultPoints);
  lines.push(`цена: ${byType.single}`);
  lines.push(`цена_один: ${byType.single}`);
  lines.push(`цена_несколько: ${byType.multiple}`);
  lines.push(`цена_текст: ${byType.text}`);
  lines.push(`цена_соответствие: ${byType.matching}`);
  lines.push(`цена_скрыто: ${byType.hidden}`);
  lines.push(`экран_раунда: ${round.introSec}`);
  lines.push(`показ_ответа: ${round.summarySec}`);
  lines.push(`итоги: ${round.leaderboardSec}`);
  lines.push(
    `ответы: ${round.answerRevealMode === 'end_of_round' ? 'в_конце_раунда' : 'после_каждого_вопроса'}`,
  );
  lines.push('');
  (round.questions || []).forEach((q, i) => {
    const block = serializeQuestion(q, i + 1);
    if (block.length) {
      lines.push(...block);
      lines.push('');
    }
  });
  return `${lines.join('\n').trim()}\n`;
}

export function roundTxtFilename(round: BuilderRound, index: number): string {
  const slug = (round.title || '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 48);
  const n = index + 1;
  return slug ? `round-${n}-${slug}.txt` : `round-${n}.txt`;
}

export const ROUND_CONFIG_TXT_HELP = `Раунд 1: Название ; (описание)
[настройки]
время_ответа: 20
время_прочтения: 5
цена: 10
экран_раунда: 6
показ_ответа: 2
итоги: 6
ответы: после_каждого_вопроса

Q1 Текст вопроса?
A) Вариант CORRECT
B) Вариант

текст Q2 Открытый вопрос
ответ1 || ответ2

Q3 Сопоставьте столицу
L) Франция
L) Италия
R) Париж
R) Рим
= 2 1

В одном раунде можно смешивать Q1 (выбор), текст Q2 (|| ответы) и matching.
Музыка, картинки и видео в TXT не сохраняются.`;
