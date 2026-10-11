import { formatFontFamilyCss, parseStageFontFamily } from './stage-fonts';

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

const SLOT_KEYS = [
  'prompt',
  'media',
  'timer',
  'meta',
  'explanationLabel',
  'explanation',
  'explanationImage',
  'explanationVideo',
  'textHint',
] as const;
type SlotKey = (typeof SLOT_KEYS)[number];

const MAP_KEYS = ['answers', 'matchLeft', 'matchRight', 'correctTexts'] as const;
type MapKey = (typeof MAP_KEYS)[number];

const KEY_RE = /^[A-Za-z0-9_-]{1,80}$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

export function hasStageBoxes(layout: StageLayout | null | undefined): boolean {
  return parseStageLayout(layout) != null;
}

export function isQuestionUuid(id: string | null | undefined): id is string {
  return typeof id === 'string' && UUID_RE.test(id);
}

export type StageKeyPath =
  | { kind: 'slot'; slot: SlotKey }
  | { kind: 'map'; map: MapKey; id: string };

export function parseStageKey(key: string): StageKeyPath | null {
  if ((SLOT_KEYS as readonly string[]).includes(key)) {
    return { kind: 'slot', slot: key as SlotKey };
  }
  const m = /^(answer|matchL|matchR|correct):([A-Za-z0-9_-]{1,80})$/.exec(key);
  if (!m) return null;
  const map: MapKey =
    m[1] === 'answer' ? 'answers' : m[1] === 'matchL' ? 'matchLeft' : m[1] === 'matchR' ? 'matchRight' : 'correctTexts';
  return { kind: 'map', map, id: m[2] };
}

export function isExplanationKey(key: string): boolean {
  return key === 'explanationLabel' || key === 'explanation' || key === 'explanationImage' || key === 'explanationVideo';
}

function explanationKeyOrder(key: string): number {
  if (key === 'explanationLabel') return 0;
  if (key === 'explanation') return 1;
  if (key === 'explanationImage') return 2;
  if (key === 'explanationVideo') return 3;
  return 9;
}

export function stageKeyForAnswer(optionId: string): string {
  return `answer:${optionId}`;
}
export function stageKeyForMatchL(id: string): string {
  return `matchL:${id}`;
}
export function stageKeyForMatchR(id: string): string {
  return `matchR:${id}`;
}
export function stageKeyForCorrect(index: number): string {
  return `correct:${index}`;
}

export function isTextAnswerKey(key: string): boolean {
  return key === 'textHint' || key.startsWith('correct:');
}

export function isAnswerLikeKey(key: string): boolean {
  if (isTextAnswerKey(key)) return true;
  const p = parseStageKey(key);
  return p?.kind === 'map';
}

export function boxForKey(layout: StageLayout, key: string): StageBox | undefined {
  const p = parseStageKey(key);
  if (!p) return undefined;
  if (p.kind === 'slot') return layout[p.slot];
  return layout[p.map]?.[p.id];
}

export function eachStageBox(layout: StageLayout, fn: (key: string, box: StageBox) => void) {
  for (const k of SLOT_KEYS) {
    const b = layout[k];
    if (b) fn(k, b);
  }
  const prefixes: Record<MapKey, string> = {
    answers: 'answer',
    matchLeft: 'matchL',
    matchRight: 'matchR',
    correctTexts: 'correct',
  };
  for (const mk of MAP_KEYS) {
    const map = layout[mk];
    if (!map) continue;
    for (const [id, b] of Object.entries(map)) fn(`${prefixes[mk]}:${id}`, b);
  }
}

export function setBoxForKey(layout: StageLayout, key: string, box: StageBox | null): StageLayout {
  const p = parseStageKey(key);
  const next: StageLayout = { ...layout, answers: { ...layout.answers }, matchLeft: { ...layout.matchLeft }, matchRight: { ...layout.matchRight }, correctTexts: { ...layout.correctTexts } };
  if (!p) return next;
  if (p.kind === 'slot') {
    if (box) next[p.slot] = box;
    else delete next[p.slot];
  } else {
    const map = { ...(next[p.map] || {}) };
    if (box) map[p.id] = box;
    else delete map[p.id];
    if (Object.keys(map).length) next[p.map] = map;
    else delete next[p.map];
  }
  return parseStageLayout(next) || { v: 1 };
}

export function remapStageLayoutOptionIds(
  layout: StageLayout | null,
  idMap: Record<string, string>,
): StageLayout | null {
  if (!layout) return null;
  const src = layout.answers;
  if (!src) return parseStageLayout(layout);
  const answers: Record<string, StageBox> = {};
  for (const [oldId, box] of Object.entries(src)) {
    const nid = idMap[oldId];
    if (nid && KEY_RE.test(nid)) answers[nid] = box;
  }
  const next: StageLayout = { ...layout };
  if (Object.keys(answers).length) next.answers = answers;
  else delete next.answers;
  return parseStageLayout(next);
}

export type StageLayoutIdSets = {
  optionIds: string[];
  matchLeftIds: string[];
  matchRightIds: string[];
};

function remapKeyedBoxes(
  src: Record<string, StageBox> | undefined,
  fromIds: string[],
  toIds: string[],
): Record<string, StageBox> | undefined {
  if (!src) return undefined;
  const keys = fromIds.length ? fromIds : Object.keys(src);
  const out: Record<string, StageBox> = {};
  const n = Math.min(keys.length, toIds.length);
  for (let i = 0; i < n; i++) {
    const box = src[keys[i]];
    const nid = toIds[i];
    if (box && nid && KEY_RE.test(nid)) out[nid] = box;
  }
  return Object.keys(out).length ? out : undefined;
}

/** Copy shared slots as-is; rewrite answer/match keys by index onto the target question. */
export function copyStageLayoutToTarget(
  layout: StageLayout | null,
  from: StageLayoutIdSets,
  to: StageLayoutIdSets,
): StageLayout | null {
  if (!layout) return null;
  const next: StageLayout = { ...layout };
  const answers = remapKeyedBoxes(layout.answers, from.optionIds, to.optionIds);
  const matchLeft = remapKeyedBoxes(layout.matchLeft, from.matchLeftIds, to.matchLeftIds);
  const matchRight = remapKeyedBoxes(layout.matchRight, from.matchRightIds, to.matchRightIds);
  if (answers) next.answers = answers;
  else delete next.answers;
  if (matchLeft) next.matchLeft = matchLeft;
  else delete next.matchLeft;
  if (matchRight) next.matchRight = matchRight;
  else delete next.matchRight;
  return parseStageLayout(next);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function boxBackground(box: StageBox): string | null {
  if (!box.bg && box.bgOpacity == null) return null;
  const rgb = hexToRgb(box.bg || '#ffffff');
  if (!rgb) return null;
  const a = box.bgOpacity == null ? 1 : box.bgOpacity;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`;
}

const TEXT_CHILD_SEL =
  '.answer-caption, .stage-caption, .host-stage__explanation-text, .timer-circle__text, .host-match__cap, .host-match__badge';
const BG_CHILD_SEL = '.answer-caption, .stage-caption, .host-match__cap';

function parseCssColor(input: string): { hex: string; a: number } | null {
  const raw = (input || '').trim().toLowerCase();
  if (!raw || raw === 'transparent' || raw === 'none') return null;
  if (COLOR_RE.test(raw)) return { hex: raw, a: 1 };
  const m =
    /^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(raw);
  if (!m) return null;
  const r = clamp(Math.round(Number(m[1])), 0, 255);
  const g = clamp(Math.round(Number(m[2])), 0, 255);
  const b = clamp(Math.round(Number(m[3])), 0, 255);
  let a = 1;
  if (m[4] != null) {
    a = m[4].endsWith('%') ? Number(m[4].slice(0, -1)) / 100 : Number(m[4]);
  }
  if (!Number.isFinite(a)) a = 1;
  a = clamp(Math.round(a * 100) / 100, 0, 1);
  if (a <= 0) return null;
  const hex = `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
  return { hex, a };
}

function splitCssList(input: string): string[] {
  const out: string[] = [];
  let buf = '';
  let depth = 0;
  for (const ch of input) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      if (buf.trim()) out.push(buf.trim());
      buf = '';
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

/** Обводка сцены часто рисуется 8-сторонним text-shadow, а не -webkit-text-stroke. */
export function outlineFromTextShadow(input: string): { hex: string; width: number } | null {
  const raw = (input || '').trim();
  if (!raw || raw === 'none') return null;
  let hex = '';
  let width = 0;
  for (const chunk of splitCssList(raw)) {
    const colorMatch = /rgba?\([^)]+\)|#[0-9a-fA-F]{3,8}/i.exec(chunk);
    if (!colorMatch) continue;
    const color = parseCssColor(colorMatch[0]);
    if (!color) continue;
    const rest = `${chunk.slice(0, colorMatch.index)} ${chunk.slice(colorMatch.index + colorMatch[0].length)}`
      .replace(/\binset\b/gi, '')
      .trim();
    const nums = rest.match(/-?[\d.]+/g);
    if (!nums || nums.length < 2) continue;
    const x = parseFloat(nums[0]);
    const y = parseFloat(nums[1]);
    const blur = nums[2] != null ? parseFloat(nums[2]) : 0;
    if (![x, y, blur].every(Number.isFinite)) continue;
    if (blur > 1 || (x === 0 && y === 0)) continue;
    if (!hex) hex = color.hex;
    width = Math.max(width, Math.abs(x), Math.abs(y));
  }
  if (!hex || !(width > 0)) return null;
  return { hex, width: clamp(Math.round(width), 1, 8) };
}

function readPaintedStroke(cs: CSSStyleDeclaration): { hex: string; width: number } | null {
  const strokeW = parseFloat(cs.getPropertyValue('-webkit-text-stroke-width') || '0');
  const strokeC = parseCssColor(cs.getPropertyValue('-webkit-text-stroke-color') || '');
  if (Number.isFinite(strokeW) && strokeW > 0 && strokeC) {
    return { hex: strokeC.hex, width: clamp(Math.round(strokeW), 1, 8) };
  }
  return outlineFromTextShadow(cs.textShadow || cs.getPropertyValue('text-shadow') || '');
}

function cssAlign(v: string): StageBox['align'] | undefined {
  if (v === 'left' || v === 'start' || v === 'flex-start') return 'left';
  if (v === 'right' || v === 'end' || v === 'flex-end') return 'right';
  if (v === 'center') return 'center';
  return undefined;
}

function cssValign(v: string): StageBox['valign'] | undefined {
  if (v === 'top' || v === 'start' || v === 'flex-start' || v === 'self-start') return 'top';
  if (v === 'bottom' || v === 'end' || v === 'flex-end' || v === 'self-end') return 'bottom';
  if (v === 'middle' || v === 'center') return 'middle';
  return undefined;
}

/** Read the styles currently painted on a stage slot, for the inspector. */
export function readComputedBoxStyle(el: HTMLElement): Partial<StageBox> {
  const textEl =
    (el.querySelector(TEXT_CHILD_SEL) as HTMLElement | null) || el;
  const bgEl = (el.querySelector(BG_CHILD_SEL) as HTMLElement | null) || el;
  const cs = getComputedStyle(textEl);
  const boxCs = getComputedStyle(el);
  const bgCs = getComputedStyle(bgEl);
  const out: Partial<StageBox> = {};
  const fs = parseFloat(cs.fontSize);
  if (Number.isFinite(fs) && fs > 0) out.fontSize = clamp(Math.round(fs), 10, 96);
  const fw = parseInt(cs.fontWeight, 10);
  if (Number.isFinite(fw)) out.fontWeight = fw >= 600 ? 700 : 400;
  const ff = parseStageFontFamily(cs.fontFamily);
  if (ff) out.fontFamily = ff;
  const color = parseCssColor(cs.color);
  if (color) out.color = color.hex;
  const bg = parseCssColor(bgCs.backgroundColor) || parseCssColor(bgCs.background);
  if (bg) {
    out.bg = bg.hex;
    out.bgOpacity = bg.a;
  }
  const align = cssAlign(cs.textAlign) || cssAlign(boxCs.justifyItems) || cssAlign(boxCs.justifyContent);
  if (align) out.align = align;
  const valign = cssValign(boxCs.alignItems) || cssValign(boxCs.justifyContent);
  if (valign) out.valign = valign;
  const stroke = readPaintedStroke(cs) || (textEl !== el ? readPaintedStroke(boxCs) : null);
  if (stroke) {
    out.strokeWidth = stroke.width;
    out.strokeColor = stroke.hex;
  }
  return out;
}

export function displayBoxForInspector(box: StageBox, el: HTMLElement | null): StageBox {
  if (!el) return box;
  const computed = readComputedBoxStyle(el);
  return (
    parseStageBox({
      ...box,
      fontSize: computed.fontSize ?? box.fontSize,
      fontWeight: computed.fontWeight ?? box.fontWeight,
      fontFamily: computed.fontFamily ?? box.fontFamily,
      color: computed.color ?? box.color,
      bg: computed.bg ?? box.bg,
      bgOpacity: computed.bgOpacity ?? box.bgOpacity,
      strokeColor: computed.strokeColor ?? box.strokeColor,
      strokeWidth: computed.strokeWidth ?? box.strokeWidth,
      align: computed.align ?? box.align,
      valign: computed.valign ?? box.valign,
    }) || box
  );
}

function setImp(el: HTMLElement, prop: string, value: string | null) {
  if (value == null || value === '') el.style.removeProperty(prop);
  else el.style.setProperty(prop, value, 'important');
}

function strokeShadow(color: string, w: number): string {
  const dirs = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ];
  return dirs.map(([x, y]) => `${x * w}px ${y * w}px 0 ${color}`).join(', ');
}

function paintAlign(el: HTMLElement, box: StageBox) {
  const align = box.align || 'center';
  const valign = box.valign || 'middle';
  setImp(el, 'text-align', align);
  if (el.classList.contains('timer-circle') || el.getAttribute('data-stage-key') === 'timer') {
    return;
  }
  const visual = el.classList.contains('answer--visual') || !!el.querySelector('img, video');
  const main =
    align === 'left' ? 'start' : align === 'right' ? 'end' : 'center';
  const cross =
    valign === 'top' ? 'start' : valign === 'bottom' ? 'end' : 'center';
  if (isExplanationSlot(el)) {
    setImp(el, 'flex-direction', 'column');
    setImp(
      el,
      'justify-content',
      cross === 'start' ? 'flex-start' : cross === 'end' ? 'flex-end' : 'center',
    );
    setImp(el, 'align-items', main === 'start' ? 'flex-start' : main === 'end' ? 'flex-end' : 'center');
    if (explanationHasContent(el)) el.style.display = 'flex';
    return;
  }
  if (visual) {
    setImp(el, 'display', 'flex');
    setImp(el, 'flex-direction', 'column');
    setImp(el, 'justify-content', cross === 'start' ? 'flex-start' : cross === 'end' ? 'flex-end' : 'center');
    setImp(el, 'align-items', main === 'start' ? 'flex-start' : main === 'end' ? 'flex-end' : 'center');
    return;
  }
  setImp(el, 'display', 'grid');
  setImp(el, 'justify-items', main);
  setImp(el, 'align-items', cross);
}

const STYLE_PROPS = [
  'fontSize',
  'fontWeight',
  'fontFamily',
  'color',
  'bg',
  'bgOpacity',
  'strokeColor',
  'strokeWidth',
  'align',
  'valign',
] as const;

export function boxHasAuthoredStyle(box: StageBox): boolean {
  return STYLE_PROPS.some((k) => box[k] !== undefined);
}

export function mergeAuthoredStyles(target: StageBox, authored: StageBox): StageBox {
  const merged: Record<string, unknown> = { ...target };
  for (const k of STYLE_PROPS) {
    const v = authored[k];
    if (v !== undefined) merged[k] = v;
  }
  return parseStageBox(merged) || target;
}

function paintTextStyle(el: HTMLElement, box: StageBox) {
  if (box.fontSize != null) setImp(el, 'font-size', `${box.fontSize}px`);
  else setImp(el, 'font-size', null);
  if (box.fontWeight != null) setImp(el, 'font-weight', String(box.fontWeight));
  else setImp(el, 'font-weight', null);
  if (box.fontFamily) setImp(el, 'font-family', formatFontFamilyCss(box.fontFamily));
  else setImp(el, 'font-family', null);
  if (box.color) setImp(el, 'color', box.color);
  else setImp(el, 'color', null);
  const sw = box.strokeWidth && box.strokeWidth > 0 ? box.strokeWidth : 0;
  if (sw && box.strokeColor) {
    setImp(el, '-webkit-text-stroke', `${sw}px ${box.strokeColor}`);
    setImp(el, 'paint-order', 'stroke fill');
    setImp(el, 'text-shadow', strokeShadow(box.strokeColor, sw));
  } else if (box.strokeWidth === 0) {
    setImp(el, 'text-shadow', 'none');
    setImp(el, '-webkit-text-stroke', null);
    setImp(el, 'paint-order', null);
  } else {
    setImp(el, 'text-shadow', null);
    setImp(el, '-webkit-text-stroke', null);
    setImp(el, 'paint-order', null);
  }
}

const MEDIA_CHILD_SEL =
  'img, video, iframe, .stage-media__video-shell, .stage-media__hide-wrap, .host-match__img';

const APPLIED_ATTR = 'data-stage-applied';

function paintBackground(el: HTMLElement, box: StageBox) {
  const bg = boxBackground(box);
  if (bg) {
    setImp(el, 'background', bg);
    setImp(el, 'background-color', bg);
    setImp(el, 'backdrop-filter', 'none');
  } else {
    setImp(el, 'background', null);
    setImp(el, 'background-color', null);
    setImp(el, 'backdrop-filter', null);
  }
}

const COMPACT_LABEL_KEYS = new Set(['meta', 'explanationLabel', 'correct:title']);
const COMPACT_LABEL_MAX_CHARS = 48;

export function isCompactStageLabel(el: HTMLElement): boolean {
  const key = el.getAttribute('data-stage-key') || '';
  if (!COMPACT_LABEL_KEYS.has(key)) return false;
  const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
  return text.length > 0 && text.length <= COMPACT_LABEL_MAX_CHARS;
}

function applyBoxToEl(el: HTMLElement, box: StageBox) {
  const compact = isCompactStageLabel(el);
  setImp(el, 'position', 'absolute');
  setImp(el, 'left', `${box.x}%`);
  setImp(el, 'top', `${box.y}%`);
  setImp(el, 'width', `${box.w}%`);
  setImp(el, 'height', `${box.h}%`);
  setImp(el, 'max-width', 'none');
  setImp(el, 'max-height', 'none');
  setImp(el, 'min-width', compact ? 'min-content' : '0');
  setImp(el, 'min-height', compact ? 'min-content' : '0');
  setImp(el, 'white-space', compact ? 'nowrap' : null);
  setImp(el, 'overflow', 'visible');
  el.style.boxSizing = 'border-box';
  el.style.zIndex =
    el.getAttribute('data-stage-key') === 'explanationImage' ||
    el.getAttribute('data-stage-key') === 'explanationVideo'
      ? '3'
      : isExplanationSlot(el)
        ? '4'
        : '2';
  paintBackground(el, box);
  paintTextStyle(el, box);
  paintAlign(el, box);
  el.querySelectorAll<HTMLElement>(TEXT_CHILD_SEL).forEach((child) => {
    paintTextStyle(child, box);
    setImp(child, 'text-align', box.align || 'center');
  });
  el.querySelectorAll<HTMLElement>(BG_CHILD_SEL).forEach((child) => paintBackground(child, box));
  el.querySelectorAll<HTMLElement>(MEDIA_CHILD_SEL).forEach((child) => {
    setImp(child, 'max-width', 'none');
    setImp(child, 'max-height', 'none');
    setImp(child, 'width', '100%');
    setImp(child, 'height', '100%');
    setImp(child, 'object-fit', 'contain');
  });
  el.setAttribute(APPLIED_ATTR, '1');
  if (compact) growCompactLabelToFit(el, box);
}

function growCompactLabelToFit(el: HTMLElement, box: StageBox) {
  const parent = el.closest('.stage-center');
  if (!(parent instanceof HTMLElement)) return;
  const parentRect = parent.getBoundingClientRect();
  if (!(parentRect.width > 0) || !(parentRect.height > 0)) return;
  const extraW = el.scrollWidth - el.clientWidth;
  const extraH = el.scrollHeight - el.clientHeight;
  if (extraW < 1 && extraH < 1) return;
  const w = Math.min(box.w + (Math.max(0, extraW) / parentRect.width) * 100, 100 - box.x);
  const h = Math.min(box.h + (Math.max(0, extraH) / parentRect.height) * 100, 100 - box.y);
  const x = clamp(box.x - (w - box.w) / 2, 0, 100 - w);
  setImp(el, 'left', `${x}%`);
  setImp(el, 'width', `${w}%`);
  setImp(el, 'height', `${h}%`);
}

const CLEAR_PROPS = [
  'position',
  'left',
  'top',
  'width',
  'height',
  'max-width',
  'max-height',
  'min-width',
  'min-height',
  'white-space',
  'overflow',
  'object-fit',
  'box-sizing',
  'z-index',
  'font-size',
  'font-weight',
  'font-family',
  'color',
  'background',
  'background-color',
  'backdrop-filter',
  'text-align',
  'display',
  'flex-direction',
  'justify-content',
  'justify-items',
  'align-items',
  'text-shadow',
  '-webkit-text-stroke',
  'paint-order',
];

function stripAppliedNode(el: HTMLElement) {
  CLEAR_PROPS.forEach((p) => el.style.removeProperty(p));
  el.querySelectorAll<HTMLElement>(`${TEXT_CHILD_SEL}, ${BG_CHILD_SEL}, ${MEDIA_CHILD_SEL}`).forEach((child) => {
    CLEAR_PROPS.forEach((p) => child.style.removeProperty(p));
  });
  el.removeAttribute(APPLIED_ATTR);
}

function unlockStageSize(stageCenter: HTMLElement) {
  stageCenter.style.removeProperty('min-width');
  stageCenter.style.removeProperty('min-height');
  stageCenter.removeAttribute('data-stage-lock-size');
  stageCenter.removeAttribute('data-stage-lock-key');
}

function hideEmptyMetaSlot(stageCenter: HTMLElement) {
  const meta = stageCenter.querySelector<HTMLElement>('[data-stage-key="meta"]');
  if (meta && !(meta.textContent || '').trim()) meta.style.display = 'none';
}

export function clearAppliedLayout(stageCenter: HTMLElement) {
  const nodes = stageCenter.querySelectorAll<HTMLElement>(`[${APPLIED_ATTR}]`);
  nodes.forEach((el) => stripAppliedNode(el));
  stageCenter.classList.remove('stage-center--custom-layout');
  unlockStageSize(stageCenter);
  hideEmptyMetaSlot(stageCenter);
}

function lockStageSize(stageCenter: HTMLElement) {
  if (stageCenter.getAttribute('data-stage-lock-size') === '1') return;
  const r = stageCenter.getBoundingClientRect();
  if (r.width > 0) stageCenter.style.minWidth = `${Math.round(r.width)}px`;
  if (r.height > 0) stageCenter.style.minHeight = `${Math.round(r.height)}px`;
  stageCenter.setAttribute('data-stage-lock-size', '1');
}

function shouldUseRevealStack(stageCenter: HTMLElement): boolean {
  if (stageCenter.classList.contains('stage-center--editing')) return false;
  return (
    stageCenter.getAttribute('data-stage-reveal') === '1' ||
    stageCenter.getAttribute('data-stage-swap') === 'explanation'
  );
}

export function applyStageLayout(
  stageCenter: HTMLElement,
  layout: StageLayout | null,
  lockKey?: string,
) {
  // Custom absolute boxes fight the reveal stack (question → explanation → title → answers).
  // Inline !important positions cannot be overridden by CSS, so clear them during reveal play.
  if (shouldUseRevealStack(stageCenter)) {
    clearAppliedLayout(stageCenter);
    return;
  }
  const parsed = parseStageLayout(layout);
  if (!parsed) {
    clearAppliedLayout(stageCenter);
    return;
  }
  const prevKey = stageCenter.getAttribute('data-stage-lock-key');
  const keyChanged = Boolean(lockKey) && prevKey !== lockKey;
  const wasLocked = stageCenter.getAttribute('data-stage-lock-size') === '1';
  const lockedW = stageCenter.style.minWidth;
  const lockedH = stageCenter.style.minHeight;
  const nodes = stageCenter.querySelectorAll<HTMLElement>(`[${APPLIED_ATTR}]`);
  nodes.forEach((el) => stripAppliedNode(el));
  if (keyChanged || !wasLocked) {
    if (wasLocked) {
      unlockStageSize(stageCenter);
      stageCenter.classList.remove('stage-center--custom-layout');
      void stageCenter.offsetHeight;
    }
    lockStageSize(stageCenter);
    if (lockKey) stageCenter.setAttribute('data-stage-lock-key', lockKey);
  } else if (wasLocked) {
    if (lockedW) stageCenter.style.minWidth = lockedW;
    if (lockedH) stageCenter.style.minHeight = lockedH;
    stageCenter.setAttribute('data-stage-lock-size', '1');
    if (prevKey) stageCenter.setAttribute('data-stage-lock-key', prevKey);
  }
  stageCenter.classList.add('stage-center--custom-layout');
  const editing = stageCenter.classList.contains('stage-center--editing');
  const parentRect = stageCenter.getBoundingClientRect();
  const els = [...stageCenter.querySelectorAll<HTMLElement>('[data-stage-key]')];
  const explEls = els
    .filter((el) => isExplanationKey(el.getAttribute('data-stage-key') || ''))
    .sort((a, b) => {
      const ka = a.getAttribute('data-stage-key') || '';
      const kb = b.getAttribute('data-stage-key') || '';
      return explanationKeyOrder(ka) - explanationKeyOrder(kb);
    });
  const textAnswerEls = els.filter((el) => isTextAnswerKey(el.getAttribute('data-stage-key') || ''));
  const answerEls = els.filter((el) => {
    const key = el.getAttribute('data-stage-key') || '';
    return isAnswerLikeKey(key) && !isTextAnswerKey(key);
  });
  const rest = els.filter((el) => {
    const key = el.getAttribute('data-stage-key') || '';
    return !isExplanationKey(key) && !isAnswerLikeKey(key);
  });
  rest.forEach((el) => applySlotBox(el, el.getAttribute('data-stage-key') || '', parsed, parentRect, editing));
  explEls.forEach((el) =>
    applySlotBox(el, el.getAttribute('data-stage-key') || 'explanation', parsed, parentRect, editing),
  );
  applyTextAnswerSlots(textAnswerEls, parsed, parentRect, stageCenter, editing);
  applyAnswerSlots(answerEls, parsed, parentRect, editing);
  resolveExplanationOverlaps(stageCenter, explEls, [...textAnswerEls, ...answerEls], parentRect);
  hideEmptyMetaSlot(stageCenter);
}

export function pctBoxFromRects(
  parent: DOMRect,
  child: DOMRect,
): StageBox | null {
  if (!(parent.width > 0) || !(parent.height > 0)) return null;
  if (child.width < 8 || child.height < 8) return null;
  return parseStageBox({
    x: ((child.left - parent.left) / parent.width) * 100,
    y: ((child.top - parent.top) / parent.height) * 100,
    w: (child.width / parent.width) * 100,
    h: (child.height / parent.height) * 100,
  });
}

function isExplanationSlot(el: HTMLElement): boolean {
  return isExplanationKey(el.getAttribute('data-stage-key') || '');
}

function explanationHasContent(el: HTMLElement): boolean {
  return el.childElementCount > 0 || (el.textContent || '').trim().length > 0;
}

function isDisplayedStageSlot(el: HTMLElement): boolean {
  if (isExplanationSlot(el)) return explanationHasContent(el);
  const st = getComputedStyle(el);
  return st.display !== 'none' && st.visibility !== 'hidden';
}

function isFloorBox(box: StageBox): boolean {
  return box.w <= 4 && box.h <= 4;
}

export function boxBelowAnchor(
  anchor: StageBox,
  w: number,
  h: number,
  gapPct: number,
): StageBox | null {
  return parseStageBox({
    x: anchor.x,
    y: anchor.y + anchor.h + gapPct,
    w,
    h,
  });
}

export function boxesOverlap(a: StageBox, b: StageBox, gap = 0): boolean {
  return (
    a.x < b.x + b.w + gap &&
    a.x + a.w + gap > b.x &&
    a.y < b.y + b.h + gap &&
    a.y + a.h + gap > b.y
  );
}

export function unionBox(boxes: StageBox[]): StageBox | null {
  if (!boxes.length) return null;
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map((b) => b.x + b.w));
  const bottom = Math.max(...boxes.map((b) => b.y + b.h));
  return parseStageBox({ x, y, w: right - x, h: bottom - y });
}

export function shiftBoxesBelowAnchor(
  boxes: StageBox[],
  anchor: StageBox,
  gapPct: number,
): StageBox[] {
  if (!boxes.length) return boxes;
  const floor = anchor.y + anchor.h + gapPct;
  const minY = Math.min(...boxes.map((b) => b.y));
  const delta = floor - minY;
  if (!(delta > 0)) return boxes;
  return boxes.map((b) => parseStageBox({ ...b, y: b.y + delta }) || b);
}

/**
 * When a box grows downward, shift only the objects that already sat below it
 * by the same delta. Never move them up or change their size.
 */
export function nudgeBoxesBelowChanged(
  layout: StageLayout,
  key: string,
  prev: StageBox,
  next: StageBox,
): StageLayout {
  const dy = next.y + next.h - (prev.y + prev.h);
  if (!(dy > 0.01)) return layout;
  const oldBottom = prev.y + prev.h;
  let out = layout;
  eachStageBox(layout, (k, b) => {
    if (k === key) return;
    if (b.y + 0.5 < oldBottom) return;
    const y = Math.min(b.y + dy, Math.max(b.y, 100 - b.h));
    if (!(y > b.y + 0.01)) return;
    const box = parseStageBox({ ...b, y });
    if (box) out = setBoxForKey(out, k, { ...box, w: b.w, h: b.h, x: b.x });
  });
  return out;
}

export function readContentOverflowPx(el: HTMLElement): { extraW: number; extraH: number } {
  const prev = el.style.getPropertyValue('overflow');
  const prevPri = el.style.getPropertyPriority('overflow');
  el.style.setProperty('overflow', 'hidden', 'important');
  const extraW = Math.max(0, el.scrollWidth - el.clientWidth);
  const extraH = Math.max(0, el.scrollHeight - el.clientHeight);
  if (prev) el.style.setProperty('overflow', prev, prevPri);
  else el.style.removeProperty('overflow');
  return { extraW, extraH };
}

export function isTextFitStageSlot(el: HTMLElement): boolean {
  const key = el.getAttribute('data-stage-key') || '';
  if (key === 'timer' || key === 'media' || key === 'explanationImage' || key === 'explanationVideo') return false;
  if (el.classList.contains('timer-circle') || el.classList.contains('answer--visual')) return false;
  if (key.startsWith('matchL:') || key.startsWith('matchR:')) {
    return !el.querySelector('img, video, .host-match__img');
  }
  return true;
}

/** Keep top-left; grow width/height so overflowing text stays inside the box. */
export function growBoxToFitOverflow(
  box: StageBox,
  overflowPx: { extraW: number; extraH: number },
  parent: { width: number; height: number },
): StageBox {
  if (!(parent.width > 0) || !(parent.height > 0)) return box;
  const dw = overflowPx.extraW > 0.5 ? (overflowPx.extraW / parent.width) * 100 : 0;
  const dh = overflowPx.extraH > 0.5 ? (overflowPx.extraH / parent.height) * 100 : 0;
  if (dw < 0.05 && dh < 0.05) return box;
  return parseStageBox({ ...box, w: box.w + dw, h: box.h + dh }) || box;
}

/**
 * After a box grew (font size etc.), move neighbors that now overlap it downward.
 * Objects above the grown box stay put.
 */
export function pushOverlappingBoxesBelow(
  layout: StageLayout,
  key: string,
  grown: StageBox,
  gapPct = 0.6,
): StageLayout {
  const items: { key: string; box: StageBox }[] = [];
  eachStageBox(layout, (k, b) => items.push({ key: k, box: b }));
  const others = items.filter((item) => item.key !== key).sort((a, b) => a.box.y - b.box.y);
  let out = layout;
  for (const item of others) {
    const current = boxForKey(out, item.key);
    if (!current) continue;
    if (!boxesOverlap(grown, current, gapPct)) continue;
    if (current.y + current.h / 2 < grown.y + grown.h / 2) continue;
    const y = Math.min(grown.y + grown.h + gapPct, Math.max(current.y, 100 - current.h));
    if (!(y > current.y + 0.01)) continue;
    const box = parseStageBox({ ...current, y });
    if (!box) continue;
    out = setBoxForKey(out, item.key, { ...box, w: current.w, h: current.h, x: current.x });
    out = nudgeBoxesBelowChanged(out, item.key, current, box);
  }
  return out;
}

export function fitTextBoxAfterFontChange(
  layout: StageLayout,
  key: string,
  boxBeforeFit: StageBox,
  el: HTMLElement,
  parent: { width: number; height: number },
): StageLayout {
  if (!isTextFitStageSlot(el)) return layout;
  const fitted = growBoxToFitOverflow(boxBeforeFit, readContentOverflowPx(el), parent);
  if (fitted.w <= boxBeforeFit.w + 0.05 && fitted.h <= boxBeforeFit.h + 0.05) return layout;
  let next = setBoxForKey(layout, key, fitted);
  next = nudgeBoxesBelowChanged(next, key, boxBeforeFit, fitted);
  return pushOverlappingBoxesBelow(next, key, fitted);
}

export function stackCenteredBelow(
  anchor: StageBox,
  sizes: { w: number; h: number }[],
  gapPct: number,
): StageBox[] {
  const cx = anchor.x + anchor.w / 2;
  let y = anchor.y + anchor.h + gapPct;
  const out: StageBox[] = [];
  for (const s of sizes) {
    const box = parseStageBox({
      x: cx - s.w / 2,
      y,
      w: s.w,
      h: s.h,
    });
    if (!box) continue;
    out.push(box);
    y = box.y + box.h + gapPct;
  }
  return out;
}

function resolveSlotBox(
  el: HTMLElement,
  key: string,
  parsed: StageLayout,
  parentRect: DOMRect,
): StageBox | null {
  const box = boxForKey(parsed, key);
  const measured = pctBoxFromRects(parentRect, el.getBoundingClientRect());
  if (box && !isFloorBox(box)) return box;
  if (box && isFloorBox(box) && boxHasAuthoredStyle(box)) {
    if (measured && !isFloorBox(measured)) return mergeAuthoredStyles(measured, box);
    return null;
  }
  return measured;
}

function textAnswerSortValue(key: string): number {
  if (key === 'correct:title') return -2;
  if (key === 'textHint') return -1;
  const n = /^correct:(\d+)$/.exec(key);
  return n ? Number(n[1]) : 99;
}

function pinTimerTop(box: StageBox): StageBox {
  return box.y === 0 ? box : { ...box, y: 0 };
}

function hasAuthoredTextAnswers(parsed: StageLayout): boolean {
  if (parsed.textHint && (!isFloorBox(parsed.textHint) || boxHasAuthoredStyle(parsed.textHint))) return true;
  return Object.values(parsed.correctTexts || {}).some(
    (box) => !isFloorBox(box) || boxHasAuthoredStyle(box),
  );
}

function applyTextAnswerSlots(
  textAnswerEls: HTMLElement[],
  parsed: StageLayout,
  parentRect: DOMRect,
  stageCenter: HTMLElement,
  editing: boolean,
) {
  const visible = textAnswerEls
    .filter((el) => isDisplayedStageSlot(el))
    .sort(
      (a, b) =>
        textAnswerSortValue(a.getAttribute('data-stage-key') || '') -
        textAnswerSortValue(b.getAttribute('data-stage-key') || ''),
    );
  if (!visible.length) return;
  if (editing) {
    visible.forEach((el) => {
      const box = boxForKey(parsed, el.getAttribute('data-stage-key') || '');
      if (box && !isFloorBox(box)) applyBoxToEl(el, box);
    });
    return;
  }
  if (hasAuthoredTextAnswers(parsed)) {
    visible.forEach((el) => {
      const box = resolveSlotBox(el, el.getAttribute('data-stage-key') || '', parsed, parentRect);
      if (box) applyBoxToEl(el, box);
    });
    return;
  }
  const timer = stageCenter.querySelector<HTMLElement>('[data-stage-key="timer"]');
  const timerBoxRaw =
    boxForKey(parsed, 'timer') ||
    (timer && isDisplayedStageSlot(timer) ? pctBoxFromRects(parentRect, timer.getBoundingClientRect()) : null);
  const timerBox = timerBoxRaw ? pinTimerTop(timerBoxRaw) : null;
  const gapPct = parentRect.height > 0 ? (8 / parentRect.height) * 100 : 1;
  const sizes = visible.map((el) => {
    const r = el.getBoundingClientRect();
    const saved = resolveSlotBox(el, el.getAttribute('data-stage-key') || '', parsed, parentRect);
    const w =
      saved && !isFloorBox(saved) ? saved.w : Math.max(parentRect.width > 0 ? (r.width / parentRect.width) * 100 : 20, 12);
    const h =
      saved && !isFloorBox(saved)
        ? saved.h
        : Math.max(parentRect.height > 0 ? (Math.max(r.height, 24) / parentRect.height) * 100 : 6, 4);
    return { el, w, h };
  });
  if (!timerBox) {
    visible.forEach((el) => {
      const box = resolveSlotBox(el, el.getAttribute('data-stage-key') || '', parsed, parentRect);
      if (box) applyBoxToEl(el, box);
    });
    return;
  }
  const stacked = stackCenteredBelow(timerBox, sizes, gapPct);
  sizes.forEach((item, i) => {
    const box = stacked[i];
    if (box) applyBoxToEl(item.el, box);
  });
}

function readAppliedBox(el: HTMLElement, parentRect: DOMRect): StageBox | null {
  const box = pctBoxFromRects(parentRect, el.getBoundingClientRect());
  return box && !isFloorBox(box) ? box : null;
}

function restackOverlappingExplanation(
  explEls: HTMLElement[],
  parentRect: DOMRect,
  gapPct: number,
): StageBox[] {
  const items = explEls
    .filter((el) => isDisplayedStageSlot(el))
    .map((el) => {
      const box = readAppliedBox(el, parentRect);
      return box ? { el, box } : null;
    })
    .filter((x): x is { el: HTMLElement; box: StageBox } => !!x);
  if (!items.length) return [];
  let overlap = false;
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (boxesOverlap(items[i].box, items[j].box, gapPct)) overlap = true;
    }
  }
  if (overlap) {
    let y = items[0].box.y;
    for (const item of items) {
      const box = parseStageBox({ ...item.box, y }) || item.box;
      applyBoxToEl(item.el, box);
      item.box = box;
      y = box.y + box.h + gapPct;
    }
  }
  return items.map((item) => item.box);
}

function resolveExplanationOverlaps(
  stageCenter: HTMLElement,
  explEls: HTMLElement[],
  answerLikeEls: HTMLElement[],
  parentRect: DOMRect,
) {
  if (stageCenter.classList.contains('stage-center--editing')) return;
  const hasImage = explEls.some(
    (el) =>
      (el.getAttribute('data-stage-key') === 'explanationImage' ||
        el.getAttribute('data-stage-key') === 'explanationVideo') &&
      isDisplayedStageSlot(el),
  );
  if (!hasImage) return;
  const gapPct = parentRect.height > 0 ? (12 / parentRect.height) * 100 : 1;
  const explBoxes = restackOverlappingExplanation(explEls, parentRect, gapPct);
  const anchor = unionBox(explBoxes);
  if (!anchor) return;
  const meta = stageCenter.querySelector<HTMLElement>('[data-stage-key="meta"]');
  const movers = [...answerLikeEls, ...(meta ? [meta] : [])].filter((el) =>
    isDisplayedStageSlot(el),
  );
  const items = movers
    .map((el) => {
      const box = readAppliedBox(el, parentRect);
      return box && boxesOverlap(box, anchor, gapPct) ? { el, box } : null;
    })
    .filter((x): x is { el: HTMLElement; box: StageBox } => !!x);
  if (!items.length) return;
  const shifted = shiftBoxesBelowAnchor(
    items.map((item) => item.box),
    anchor,
    gapPct,
  );
  items.forEach((item, i) => {
    const box = shifted[i];
    if (box) applyBoxToEl(item.el, box);
  });
}

function applyAnswerSlots(
  answerEls: HTMLElement[],
  parsed: StageLayout,
  parentRect: DOMRect,
  editing: boolean,
) {
  const visible = answerEls.filter((el) => isDisplayedStageSlot(el));
  const items = visible
    .map((el) => {
      const key = el.getAttribute('data-stage-key') || '';
      const authored = boxForKey(parsed, key);
      if (editing) {
        return authored && !isFloorBox(authored) ? { el, box: authored } : null;
      }
      if (authored && isFloorBox(authored)) {
        if (!boxHasAuthoredStyle(authored)) return null;
        const measured = pctBoxFromRects(parentRect, el.getBoundingClientRect());
        if (!measured || isFloorBox(measured)) return null;
        return { el, box: mergeAuthoredStyles(measured, authored) };
      }
      const box = resolveSlotBox(el, key, parsed, parentRect);
      return box && !isFloorBox(box) ? { el, box } : null;
    })
    .filter((x): x is { el: HTMLElement; box: StageBox } => !!x);
  items.forEach((item) => applyBoxToEl(item.el, item.box));
}

function applySlotBox(
  el: HTMLElement,
  key: string,
  parsed: StageLayout,
  parentRect: DOMRect,
  editing: boolean,
) {
  if (key === 'meta' && !(el.textContent || '').trim()) {
    el.style.display = 'none';
    return;
  }
  if (!isDisplayedStageSlot(el)) return;
  const box = boxForKey(parsed, key);
  const pinTimer = key === 'timer' && !editing && !hasAuthoredTextAnswers(parsed);
  if (isExplanationKey(key)) {
    if (box && !isFloorBox(box)) {
      applyBoxToEl(el, box);
      return;
    }
    if (editing) return;
    const measured = pctBoxFromRects(parentRect, el.getBoundingClientRect());
    if (measured && !isFloorBox(measured)) applyBoxToEl(el, measured);
    return;
  }
  if (!box) return;
  if (isFloorBox(box)) {
    if (editing) return;
    const measured = pctBoxFromRects(parentRect, el.getBoundingClientRect());
    if (measured && !isFloorBox(measured)) {
      const merged = boxHasAuthoredStyle(box) ? mergeAuthoredStyles(measured, box) : measured;
      applyBoxToEl(el, pinTimer ? pinTimerTop(merged) : merged);
    }
    return;
  }
  applyBoxToEl(el, pinTimer ? pinTimerTop(box) : box);
}

/** Fill missing boxes for visible keys; keep hidden snapshot boxes. */
export function materializeStageLayout(
  stageCenter: HTMLElement,
  snapshot: StageLayout | null,
): StageLayout | null {
  let layout: StageLayout = snapshot ? { ...snapshot, v: 1 } : { v: 1 };
  const editing = stageCenter.classList.contains('stage-center--editing');
  const pinTimer = !editing && !hasAuthoredTextAnswers(layout);
  const parent = stageCenter.getBoundingClientRect();
  const els = stageCenter.querySelectorAll<HTMLElement>('[data-stage-key]');
  els.forEach((el) => {
    const key = el.getAttribute('data-stage-key') || '';
    const existing = boxForKey(layout, key);
    if (!isDisplayedStageSlot(el)) {
      if (existing && isFloorBox(existing)) {
        layout = setBoxForKey(layout, key, null);
      }
      return;
    }
    if (existing && !isFloorBox(existing)) {
      if (key === 'timer' && pinTimer && existing.y !== 0) {
        layout = setBoxForKey(layout, key, pinTimerTop(existing));
      }
      return;
    }
    const box = pctBoxFromRects(parent, el.getBoundingClientRect());
    if (box && !isFloorBox(box)) {
      layout = setBoxForKey(layout, key, key === 'timer' && pinTimer ? pinTimerTop(box) : box);
    } else if (existing && isFloorBox(existing)) {
      layout = setBoxForKey(layout, key, null);
    }
  });
  return parseStageLayout(layout);
}

export function snapPx(n: number, grid = 8): number {
  return Math.round(n / grid) * grid;
}
