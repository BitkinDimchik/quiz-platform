import { parseStageFontFamily } from './stage-layout';

export const STAGE_TYPE_ROLES = ['heading', 'answers', 'labels'] as const;
export type StageTypeRole = (typeof STAGE_TYPE_ROLES)[number];

export type StageTypeStyle = {
  fontFamily?: string;
  fontSize?: number;
};

export type StageTypeStyles = Partial<Record<StageTypeRole, StageTypeStyle>>;

const SIZE_MIN = 16;
const SIZE_MAX = 72;

function clampSize(n: number): number {
  return Math.min(SIZE_MAX, Math.max(SIZE_MIN, n));
}

export function parseStageTypeStyle(raw: unknown): StageTypeStyle | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const rec = raw as Record<string, unknown>;
  const out: StageTypeStyle = {};
  const ff = parseStageFontFamily(rec.fontFamily);
  if (ff) out.fontFamily = ff;
  const fs = typeof rec.fontSize === 'number' ? rec.fontSize : Number(rec.fontSize);
  if (Number.isFinite(fs)) out.fontSize = clampSize(Math.round(fs));
  if (!out.fontFamily && out.fontSize == null) return undefined;
  return out;
}

export function parseStageTypeStyles(raw: unknown): StageTypeStyles | null {
  if (raw == null) return null;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  const out: StageTypeStyles = {};
  for (const role of STAGE_TYPE_ROLES) {
    const parsed = parseStageTypeStyle(rec[role]);
    if (parsed) out[role] = parsed;
  }
  return out;
}
