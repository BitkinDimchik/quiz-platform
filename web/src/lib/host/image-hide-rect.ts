export type ImageHideRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export const DEFAULT_IMAGE_HIDE_RECT: ImageHideRect = { x: 35, y: 35, w: 30, h: 30 };
export const MAX_IMAGE_HIDE_RECTS = 8;

const MIN_SIZE = 8;

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

/** Parse overlay box as % of the image. Invalid input -> null. */
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

/** One rect, an array, or null. Empty / invalid -> null. */
export function parseImageHideRects(raw: unknown): ImageHideRect[] | null {
  if (Array.isArray(raw)) {
    const out: ImageHideRect[] = [];
    for (const item of raw) {
      const parsed = parseImageHideRect(item);
      if (parsed) out.push(parsed);
      if (out.length >= MAX_IMAGE_HIDE_RECTS) break;
    }
    return out.length ? out : null;
  }
  const one = parseImageHideRect(raw);
  return one ? [one] : null;
}

/** Prefer `imageHideRects`, fall back to legacy single `imageHideRect`. */
export function hideRectsFromQuestion(q: {
  imageHideRects?: unknown;
  imageHideRect?: unknown;
}): ImageHideRect[] | null {
  return parseImageHideRects(q.imageHideRects) ?? parseImageHideRects(q.imageHideRect);
}

export function nextImageHideRect(existing: ImageHideRect[]): ImageHideRect {
  const n = existing.length;
  return (
    parseImageHideRect({
      x: 10 + (n % 4) * 18,
      y: 10 + Math.floor(n / 4) * 18,
      w: 22,
      h: 22,
    }) || DEFAULT_IMAGE_HIDE_RECT
  );
}

export function shouldShowImageHideRect(
  phase?: string | null,
  showCorrect?: boolean,
): boolean {
  if (showCorrect) return false;
  if (phase === 'answer_reveal' || phase === 'round_summary' || phase === 'round_replay') {
    return false;
  }
  return true;
}

export function appendStageImage(
  parent: HTMLElement,
  src: string,
  hide: ImageHideRect | ImageHideRect[] | null,
  showHide: boolean,
): HTMLImageElement {
  const img = document.createElement('img');
  img.src = src;
  img.alt = '';
  const rects = parseImageHideRects(hide);
  if (!rects || !showHide) {
    parent.appendChild(img);
    return img;
  }
  const wrap = document.createElement('div');
  wrap.className = 'stage-media__hide-wrap';
  wrap.appendChild(img);
  for (const hideRect of rects) {
    const rect = document.createElement('div');
    rect.className = 'stage-media__hide-rect';
    rect.style.left = `${hideRect.x}%`;
    rect.style.top = `${hideRect.y}%`;
    rect.style.width = `${hideRect.w}%`;
    rect.style.height = `${hideRect.h}%`;
    wrap.appendChild(rect);
  }
  parent.appendChild(wrap);
  return img;
}
