import type { StageBox, StageLayout } from './stage-layout';
import { boxForKey, eachStageBox, parseStageBox, setBoxForKey, snapPx } from './stage-layout';

export type ResizeDir = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export const RESIZE_DIRS: ResizeDir[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

export function moveBox(box: StageBox, dxPct: number, dyPct: number): StageBox {
  return parseStageBox({ ...box, x: box.x + dxPct, y: box.y + dyPct }) || box;
}

export function resizeBox(box: StageBox, dir: ResizeDir, dxPct: number, dyPct: number): StageBox {
  let { x, y, w, h } = box;
  if (dir.includes('e')) w += dxPct;
  if (dir.includes('s')) h += dyPct;
  if (dir.includes('w')) {
    x += dxPct;
    w -= dxPct;
  }
  if (dir.includes('n')) {
    y += dyPct;
    h -= dyPct;
  }
  return parseStageBox({ ...box, x, y, w, h }) || box;
}

export function pxDeltaToPct(
  dx: number,
  dy: number,
  parent: DOMRect,
): { dxPct: number; dyPct: number } {
  return {
    dxPct: parent.width > 0 ? (dx / parent.width) * 100 : 0,
    dyPct: parent.height > 0 ? (dy / parent.height) * 100 : 0,
  };
}

export function snapDeltaPx(dx: number, dy: number): { dx: number; dy: number } {
  return { dx: snapPx(dx), dy: snapPx(dy) };
}

export type SnapGuide = { axis: 'x' | 'y'; at: number };

export function snapThresholdPct(parent: DOMRect, px = 10): number {
  return parent.width > 0 ? (px / parent.width) * 100 : 1;
}

export function collectSnapTargets(layout: StageLayout, skipKey: string): { xs: number[]; ys: number[] } {
  const xs = [0, 50, 100];
  const ys = [0, 50, 100];
  eachStageBox(layout, (key, box) => {
    if (key === skipKey) return;
    xs.push(box.x, box.x + box.w / 2, box.x + box.w);
    ys.push(box.y, box.y + box.h / 2, box.y + box.h);
  });
  return { xs, ys };
}

function nearest(value: number, targets: number[], thresh: number): { at: number; d: number } | null {
  let best: { at: number; d: number } | null = null;
  for (const at of targets) {
    const d = Math.abs(value - at);
    if (d <= thresh && (!best || d < best.d)) best = { at, d };
  }
  return best;
}

export function snapBoxToTargets(
  box: StageBox,
  targets: { xs: number[]; ys: number[] },
  thresh: number,
): { box: StageBox; guides: SnapGuide[] } {
  const guides: SnapGuide[] = [];
  const left = box.x;
  const cx = box.x + box.w / 2;
  const right = box.x + box.w;
  const xHits = [
    { hit: nearest(left, targets.xs, thresh), apply: (at: number) => at },
    { hit: nearest(cx, targets.xs, thresh), apply: (at: number) => at - box.w / 2 },
    { hit: nearest(right, targets.xs, thresh), apply: (at: number) => at - box.w },
  ].filter((c) => c.hit) as Array<{ hit: { at: number; d: number }; apply: (at: number) => number }>;
  xHits.sort((a, b) => a.hit.d - b.hit.d);
  let x = box.x;
  if (xHits[0]) {
    x = xHits[0].apply(xHits[0].hit.at);
    guides.push({ axis: 'x', at: xHits[0].hit.at });
  }

  const top = box.y;
  const cy = box.y + box.h / 2;
  const bottom = box.y + box.h;
  const yHits = [
    { hit: nearest(top, targets.ys, thresh), apply: (at: number) => at },
    { hit: nearest(cy, targets.ys, thresh), apply: (at: number) => at - box.h / 2 },
    { hit: nearest(bottom, targets.ys, thresh), apply: (at: number) => at - box.h },
  ].filter((c) => c.hit) as Array<{ hit: { at: number; d: number }; apply: (at: number) => number }>;
  yHits.sort((a, b) => a.hit.d - b.hit.d);
  let y = box.y;
  if (yHits[0]) {
    y = yHits[0].apply(yHits[0].hit.at);
    guides.push({ axis: 'y', at: yHits[0].hit.at });
  }

  return { box: parseStageBox({ ...box, x, y }) || box, guides };
}

export function centerBoxOnStage(box: StageBox, axis: 'x' | 'y' | 'both'): StageBox {
  let x = box.x;
  let y = box.y;
  if (axis === 'x' || axis === 'both') x = 50 - box.w / 2;
  if (axis === 'y' || axis === 'both') y = 50 - box.h / 2;
  return parseStageBox({ ...box, x, y }) || box;
}

export function alignBoxToStage(
  box: StageBox,
  edge: 'left' | 'right' | 'top' | 'bottom',
): StageBox {
  let x = box.x;
  let y = box.y;
  if (edge === 'left') x = 0;
  if (edge === 'right') x = 100 - box.w;
  if (edge === 'top') y = 0;
  if (edge === 'bottom') y = 100 - box.h;
  return parseStageBox({ ...box, x, y }) || box;
}

export type BoxAnchor = 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom';

export function alignBoxToBox(box: StageBox, target: StageBox, mode: BoxAnchor): StageBox {
  let x = box.x;
  let y = box.y;
  if (mode === 'left') x = target.x;
  if (mode === 'centerX') x = target.x + target.w / 2 - box.w / 2;
  if (mode === 'right') x = target.x + target.w - box.w;
  if (mode === 'top') y = target.y;
  if (mode === 'centerY') y = target.y + target.h / 2 - box.h / 2;
  if (mode === 'bottom') y = target.y + target.h - box.h;
  return parseStageBox({ ...box, x, y }) || box;
}

export type PanelPos = { left: number; top: number };

export function clampPanelPos(
  left: number,
  top: number,
  panel: { width: number; height: number },
  parent: { width: number; height: number },
  pad = 8,
  minVisible = 40,
): PanelPos {
  const visW = Math.min(Math.max(minVisible, 1), Math.max(panel.width, 1));
  const visH = Math.min(Math.max(minVisible, 1), Math.max(panel.height, 1));
  const minL = pad - (panel.width - visW);
  const maxL = parent.width - visW - pad;
  const minT = pad - (panel.height - visH);
  const maxT = parent.height - visH - pad;
  return {
    left: clampNum(left, minL, maxL),
    top: clampNum(top, minT, maxT),
  };
}

function clampNum(n: number, a: number, b: number): number {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return Math.min(hi, Math.max(lo, n));
}

export type StagePxSize = { width: number; height: number };

export function boxSizePx(box: StageBox, stage: StagePxSize): { w: number; h: number } {
  return {
    w: Math.max(1, Math.round((box.w / 100) * stage.width)),
    h: Math.max(1, Math.round((box.h / 100) * stage.height)),
  };
}

/** Keep top-left when possible; slide left/up if the new size would overflow the stage. */
export function applyBoxSize(box: StageBox, w: number, h: number): StageBox {
  const cw = clampNum(w, 4, 100);
  const ch = clampNum(h, 4, 100);
  let x = box.x;
  let y = box.y;
  if (x + cw > 100) x = Math.max(0, 100 - cw);
  if (y + ch > 100) y = Math.max(0, 100 - ch);
  return parseStageBox({ ...box, x, y, w: cw, h: ch }) || box;
}

export function setBoxSizePx(
  box: StageBox,
  widthPx: number,
  heightPx: number,
  stage: StagePxSize,
): StageBox {
  if (!(stage.width > 0) || !(stage.height > 0)) return box;
  return applyBoxSize(box, (widthPx / stage.width) * 100, (heightPx / stage.height) * 100);
}

export function isImageSlotEl(el: HTMLElement): boolean {
  const key = el.getAttribute('data-stage-key') || '';
  if (el.classList.contains('answer--visual')) return true;
  if (key === 'explanationImage' || key === 'media') {
    return !!el.querySelector('img, video, iframe, .stage-media__video-shell, .stage-media__hide-wrap');
  }
  if (key.startsWith('matchL:') || key.startsWith('matchR:')) {
    return !!el.querySelector('img, video, .host-match__img');
  }
  return false;
}

export function imageSlotKeysFromStage(stage: HTMLElement): string[] {
  const keys: string[] = [];
  stage.querySelectorAll<HTMLElement>('[data-stage-key]').forEach((el) => {
    if (!isImageSlotEl(el)) return;
    const st = getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden') return;
    const key = el.getAttribute('data-stage-key');
    if (key) keys.push(key);
  });
  return keys;
}

export function copyBoxSizeToKeys(
  layout: StageLayout,
  source: StageBox,
  keys: string[],
): StageLayout {
  let next = layout;
  for (const key of keys) {
    const box = boxForKey(next, key);
    if (!box) continue;
    next = setBoxForKey(next, key, applyBoxSize(box, source.w, source.h));
  }
  return next;
}
