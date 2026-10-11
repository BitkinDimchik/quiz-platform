export type ImageHideRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

const MIN_SIZE = 8;
const MAX_RECTS = 8;

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function parseImageHideRect(raw: unknown): ImageHideRect | null {
  if (!isRecord(raw)) return null;
  const x = num(raw.x);
  const y = num(raw.y);
  const w = num(raw.w);
  const h = num(raw.h);
  if (x == null || y == null || w == null || h == null) return null;
  const cx = clamp(x, 0, 100 - MIN_SIZE);
  const cy = clamp(y, 0, 100 - MIN_SIZE);
  return {
    x: cx,
    y: cy,
    w: clamp(w, MIN_SIZE, 100 - cx),
    h: clamp(h, MIN_SIZE, 100 - cy),
  };
}

export function parseImageHideRects(raw: unknown): ImageHideRect[] | null {
  if (Array.isArray(raw)) {
    const out: ImageHideRect[] = [];
    for (const item of raw) {
      const parsed = parseImageHideRect(item);
      if (parsed) out.push(parsed);
      if (out.length >= MAX_RECTS) break;
    }
    return out.length ? out : null;
  }
  const one = parseImageHideRect(raw);
  return one ? [one] : null;
}

export function hideRectsFromMeta(meta: { imageHideRects?: unknown; imageHideRect?: unknown }): ImageHideRect[] | null {
  return parseImageHideRects(meta.imageHideRects) ?? parseImageHideRects(meta.imageHideRect);
}
