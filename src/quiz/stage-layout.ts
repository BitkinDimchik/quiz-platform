/**
 * Буквы любых алфавитов (бывают шрифты с русскими именами) и цифры;
 * символы, которыми можно сломать CSS (; { } : < > \ /), не пропускаем.
 */
const FONT_FAMILY_RE = /^[\p{L}\p{M}\p{N}\s,.'"\-_&()+]{1,160}$/u;

export function parseStageFontFamily(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const s = raw.trim();
  if (!s || !FONT_FAMILY_RE.test(s)) return undefined;
  return s;
}

export type StageBox = {
  x: number;
  y: number;
  w: number;
  h: number;
  fontSize?: number;
  fontWeight?: 400 | 700;
  fontFamily?: string;
  color?: string;
  bg?: string;
  bgOpacity?: number;
  strokeColor?: string;
  strokeWidth?: number;
  align?: 'left' | 'center' | 'right';
  valign?: 'top' | 'middle' | 'bottom';
};

export type StageLayout = {
  v: 1;
  prompt?: StageBox;
  media?: StageBox;
  timer?: StageBox;
  meta?: StageBox;
  explanation?: StageBox;
  explanationImage?: StageBox;
  explanationVideo?: StageBox;
  explanationLabel?: StageBox;
  textHint?: StageBox;
  answers?: Record<string, StageBox>;
  matchLeft?: Record<string, StageBox>;
  matchRight?: Record<string, StageBox>;
  correctTexts?: Record<string, StageBox>;
};

const SLOT_KEYS = ['prompt', 'media', 'timer', 'meta', 'explanationLabel', 'explanation', 'explanationImage', 'explanationVideo', 'textHint'] as const;
type SlotKey = (typeof SLOT_KEYS)[number];
const MAP_KEYS = ['answers', 'matchLeft', 'matchRight', 'correctTexts'] as const;
type MapKey = (typeof MAP_KEYS)[number];
const KEY_RE = /^[A-Za-z0-9_-]{1,80}$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

export function parseStageBox(raw: unknown): StageBox | null {
  if (!isRecord(raw)) return null;
  const x = typeof raw.x === 'number' ? raw.x : Number(raw.x);
  const y = typeof raw.y === 'number' ? raw.y : Number(raw.y);
  const w = typeof raw.w === 'number' ? raw.w : Number(raw.w);
  const h = typeof raw.h === 'number' ? raw.h : Number(raw.h);
  if (![x, y, w, h].every((n) => Number.isFinite(n))) return null;
  const bw = clamp(w, 4, 100);
  const bh = clamp(h, 4, 100);
  const box: StageBox = {
    x: clamp(x, 0, 100 - bw),
    y: clamp(y, 0, 100 - bh),
    w: bw,
    h: bh,
  };
  const fs = typeof raw.fontSize === 'number' ? raw.fontSize : Number(raw.fontSize);
  if (Number.isFinite(fs)) box.fontSize = clamp(Math.round(fs), 10, 96);
  if (raw.fontWeight === 400 || raw.fontWeight === 700) box.fontWeight = raw.fontWeight;
  const ff = parseStageFontFamily(raw.fontFamily);
  if (ff) box.fontFamily = ff;
  if (typeof raw.color === 'string' && COLOR_RE.test(raw.color)) {
    box.color = raw.color.toLowerCase();
  }
  if (typeof raw.bg === 'string' && COLOR_RE.test(raw.bg)) {
    box.bg = raw.bg.toLowerCase();
  }
  const op = typeof raw.bgOpacity === 'number' ? raw.bgOpacity : Number(raw.bgOpacity);
  if (Number.isFinite(op)) box.bgOpacity = clamp(op, 0, 1);
  if (typeof raw.strokeColor === 'string' && COLOR_RE.test(raw.strokeColor)) {
    box.strokeColor = raw.strokeColor.toLowerCase();
  }
  const sw = typeof raw.strokeWidth === 'number' ? raw.strokeWidth : Number(raw.strokeWidth);
  if (Number.isFinite(sw)) {
    box.strokeWidth = sw <= 0 ? 0 : clamp(Math.round(sw), 1, 8);
  }
  if (raw.align === 'left' || raw.align === 'center' || raw.align === 'right') box.align = raw.align;
  if (raw.valign === 'top' || raw.valign === 'middle' || raw.valign === 'bottom') box.valign = raw.valign;
  return box;
}

function parseBoxMap(raw: unknown): Record<string, StageBox> | undefined {
  if (!isRecord(raw)) return undefined;
  const out: Record<string, StageBox> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!KEY_RE.test(k)) continue;
    const box = parseStageBox(v);
    if (box) out[k] = box;
  }
  return Object.keys(out).length ? out : undefined;
}

export function parseStageLayout(raw: unknown): StageLayout | null {
  if (!isRecord(raw)) return null;
  if (raw.v !== 1) return null;
  const layout: StageLayout = { v: 1 };
  let boxes = 0;
  for (const k of SLOT_KEYS) {
    const box = parseStageBox(raw[k]);
    if (box) {
      layout[k] = box;
      boxes++;
    }
  }
  for (const k of MAP_KEYS) {
    const map = parseBoxMap(raw[k]);
    if (map) {
      layout[k] = map;
      boxes++;
    }
  }
  return boxes ? layout : null;
}

/** Шрифты блоков сцены — можно отдать игроку без координат раскладки. */
export type StageFonts = {
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

function fontFromBox(box?: StageBox): string | undefined {
  return box?.fontFamily;
}

function fontsFromMap(map?: Record<string, StageBox>): Record<string, string> | undefined {
  if (!map) return undefined;
  const out: Record<string, string> = {};
  for (const [k, box] of Object.entries(map)) {
    if (box.fontFamily) out[k] = box.fontFamily;
  }
  return Object.keys(out).length ? out : undefined;
}

export function stageFontsFromLayout(layout: StageLayout | null | undefined): StageFonts | undefined {
  if (!layout) return undefined;
  const out: StageFonts = {};
  const prompt = fontFromBox(layout.prompt);
  if (prompt) out.prompt = prompt;
  const meta = fontFromBox(layout.meta);
  if (meta) out.meta = meta;
  const explanation = fontFromBox(layout.explanation);
  if (explanation) out.explanation = explanation;
  const explanationLabel = fontFromBox(layout.explanationLabel);
  if (explanationLabel) out.explanationLabel = explanationLabel;
  const textHint = fontFromBox(layout.textHint);
  if (textHint) out.textHint = textHint;
  const answers = fontsFromMap(layout.answers);
  if (answers) out.answers = answers;
  const matchLeft = fontsFromMap(layout.matchLeft);
  if (matchLeft) out.matchLeft = matchLeft;
  const matchRight = fontsFromMap(layout.matchRight);
  if (matchRight) out.matchRight = matchRight;
  const correctTexts = fontsFromMap(layout.correctTexts);
  if (correctTexts) out.correctTexts = correctTexts;
  return Object.keys(out).length ? out : undefined;
}
