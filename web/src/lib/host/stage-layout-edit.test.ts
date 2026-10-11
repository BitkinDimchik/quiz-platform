/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { alignBoxToBox, alignBoxToStage, applyBoxSize, boxSizePx, centerBoxOnStage, clampPanelPos, copyBoxSizeToKeys, imageSlotKeysFromStage, moveBox, resizeBox, setBoxSizePx, snapBoxToTargets } from './stage-layout-edit';

const box = { x: 20, y: 20, w: 40, h: 30 };

describe('stage-layout-edit', () => {
  it('moves by percent delta', () => {
    expect(moveBox(box, 5, -5)).toEqual({ x: 25, y: 15, w: 40, h: 30 });
  });

  it('resizes east and south', () => {
    const next = resizeBox(box, 'se', 10, 5);
    expect(next.w).toBe(50);
    expect(next.h).toBe(35);
    expect(next.x).toBe(20);
  });
});

describe('clampPanelPos', () => {
  const panel = { width: 200, height: 100 };
  const parent = { width: 800, height: 600 };

  it('keeps a point inside the padded parent', () => {
    expect(clampPanelPos(40, 50, panel, parent)).toEqual({ left: 40, top: 50 });
  });

  it('lets the panel hang off every edge and keeps a visible strip', () => {
    expect(clampPanelPos(900, 700, panel, parent)).toEqual({ left: 752, top: 552 });
    expect(clampPanelPos(-2000, -2000, panel, parent)).toEqual({ left: -152, top: -52 });
  });

  it('lets a tall panel hang below so the grip can reach the bottom', () => {
    expect(clampPanelPos(8, 900, { width: 340, height: 456 }, parent).top).toBe(552);
  });
});

describe('snap and stage anchors', () => {
  it('snaps box center to the sheet 50% axis', () => {
    const box = { x: 41, y: 10, w: 20, h: 10 };
    const got = snapBoxToTargets(box, { xs: [0, 50, 100], ys: [0, 50, 100] }, 3);
    expect(got.box.x).toBe(40);
    expect(got.guides).toEqual([{ axis: 'x', at: 50 }]);
  });

  it('centers a box on the sheet', () => {
    const box = { x: 10, y: 10, w: 20, h: 10 };
    expect(centerBoxOnStage(box, 'x')).toEqual({ x: 40, y: 10, w: 20, h: 10 });
    expect(centerBoxOnStage(box, 'both')).toEqual({ x: 40, y: 45, w: 20, h: 10 });
  });

  it('aligns a box to another box center', () => {
    const box = { x: 0, y: 0, w: 10, h: 10 };
    const target = { x: 20, y: 30, w: 40, h: 20 };
    expect(alignBoxToBox(box, target, 'centerX')).toEqual({ x: 35, y: 0, w: 10, h: 10 });
    expect(alignBoxToBox(box, target, 'centerY')).toEqual({ x: 0, y: 35, w: 10, h: 10 });
    expect(alignBoxToStage(box, 'right').x).toBe(90);
  });
});

describe('box size', () => {
  const stage = { width: 1000, height: 800 };
  const box = { x: 10, y: 20, w: 30, h: 25 };

  it('converts percent size to pixels', () => {
    expect(boxSizePx(box, stage)).toEqual({ w: 300, h: 200 });
  });

  it('sets pixel size back to percent without moving top-left', () => {
    expect(setBoxSizePx(box, 400, 160, stage)).toEqual({ x: 10, y: 20, w: 40, h: 20 });
  });

  it('slides left if the new width would overflow', () => {
    const next = applyBoxSize({ x: 80, y: 10, w: 10, h: 10 }, 40, 10);
    expect(next.w).toBe(40);
    expect(next.h).toBe(10);
    expect(next.x).toBe(60);
    expect(next.y).toBe(10);
  });

  it('copies width and height onto other image slots', () => {
    const layout = copyBoxSizeToKeys(
      {
        v: 1,
        answers: {
          a: { x: 10, y: 10, w: 40, h: 30 },
          b: { x: 55, y: 12, w: 20, h: 18 },
        },
      },
      { x: 10, y: 10, w: 40, h: 30 },
      ['answer:b'],
    );
    expect(layout.answers?.a).toEqual({ x: 10, y: 10, w: 40, h: 30 });
    expect(layout.answers?.b).toEqual({ x: 55, y: 12, w: 40, h: 30 });
  });

  it('lists visible visual-answer keys from the stage', () => {
    const root = document.createElement('div');
    const a = document.createElement('div');
    a.setAttribute('data-stage-key', 'answer:a1');
    a.className = 'answer--visual';
    const b = document.createElement('div');
    b.setAttribute('data-stage-key', 'prompt');
    const hidden = document.createElement('div');
    hidden.setAttribute('data-stage-key', 'media');
    hidden.style.display = 'none';
    hidden.innerHTML = '<img alt=""/>';
    root.appendChild(a);
    root.appendChild(b);
    root.appendChild(hidden);
    document.body.appendChild(root);
    expect(imageSlotKeysFromStage(root)).toEqual(['answer:a1']);
    document.body.removeChild(root);
  });
});
