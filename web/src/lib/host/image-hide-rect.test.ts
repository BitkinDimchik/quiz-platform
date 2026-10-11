/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_IMAGE_HIDE_RECT,
  appendStageImage,
  hideRectsFromQuestion,
  parseImageHideRect,
  parseImageHideRects,
  shouldShowImageHideRect,
} from './image-hide-rect';

describe('parseImageHideRect', () => {
  it('returns null for junk', () => {
    expect(parseImageHideRect(null)).toBeNull();
    expect(parseImageHideRect('x')).toBeNull();
    expect(parseImageHideRect({ x: 1, y: 2 })).toBeNull();
    expect(parseImageHideRect({ x: 'a', y: 1, w: 10, h: 10 })).toBeNull();
  });

  it('clamps to the image box', () => {
    expect(parseImageHideRect({ x: -10, y: 200, w: 5, h: 5 })).toEqual({
      x: 0,
      y: 92,
      w: 8,
      h: 8,
    });
    expect(parseImageHideRect({ x: 90, y: 90, w: 40, h: 40 })).toEqual({
      x: 90,
      y: 90,
      w: 10,
      h: 10,
    });
  });

  it('accepts numeric strings', () => {
    expect(parseImageHideRect({ x: '10', y: '20', w: '30', h: '15' })).toEqual({
      x: 10,
      y: 20,
      w: 30,
      h: 15,
    });
  });

  it('keeps the default box', () => {
    expect(parseImageHideRect(DEFAULT_IMAGE_HIDE_RECT)).toEqual(DEFAULT_IMAGE_HIDE_RECT);
  });
});

describe('parseImageHideRects', () => {
  it('wraps a single rect', () => {
    expect(parseImageHideRects({ x: 10, y: 20, w: 30, h: 40 })).toEqual([
      { x: 10, y: 20, w: 30, h: 40 },
    ]);
  });

  it('parses an array and drops junk', () => {
    expect(
      parseImageHideRects([
        { x: 10, y: 20, w: 30, h: 40 },
        { x: 1 },
        { x: 50, y: 10, w: 20, h: 15 },
      ]),
    ).toEqual([
      { x: 10, y: 20, w: 30, h: 40 },
      { x: 50, y: 10, w: 20, h: 15 },
    ]);
  });

  it('prefers imageHideRects over a single imageHideRect', () => {
    expect(
      hideRectsFromQuestion({
        imageHideRect: { x: 1, y: 1, w: 10, h: 10 },
        imageHideRects: [{ x: 20, y: 20, w: 10, h: 10 }],
      }),
    ).toEqual([{ x: 20, y: 20, w: 10, h: 10 }]);
  });
});

describe('shouldShowImageHideRect', () => {
  it('hides on reveal phases and when showing correct answers', () => {
    expect(shouldShowImageHideRect('question', false)).toBe(true);
    expect(shouldShowImageHideRect('question_read', false)).toBe(true);
    expect(shouldShowImageHideRect('answer_reveal', false)).toBe(false);
    expect(shouldShowImageHideRect('question', true)).toBe(false);
    expect(shouldShowImageHideRect('round_summary', false)).toBe(false);
  });
});

describe('appendStageImage', () => {
  it('wraps the image with an overlay when shown', () => {
    const root = document.createElement('div');
    appendStageImage(root, 'data:image/gif;base64,xx', { x: 10, y: 20, w: 30, h: 40 }, true);
    const wrap = root.querySelector('.stage-media__hide-wrap');
    const rect = root.querySelector('.stage-media__hide-rect') as HTMLElement;
    expect(wrap).toBeTruthy();
    expect(rect.style.left).toBe('10%');
    expect(rect.style.top).toBe('20%');
    expect(rect.style.width).toBe('30%');
    expect(rect.style.height).toBe('40%');
  });

  it('skips overlay when hidden', () => {
    const root = document.createElement('div');
    appendStageImage(root, 'data:image/gif;base64,xx', { x: 10, y: 20, w: 30, h: 40 }, false);
    expect(root.querySelector('.stage-media__hide-rect')).toBeNull();
    expect(root.querySelector('img')).toBeTruthy();
  });

  it('draws every overlay rect', () => {
    const root = document.createElement('div');
    appendStageImage(
      root,
      'data:image/gif;base64,xx',
      [
        { x: 10, y: 20, w: 30, h: 40 },
        { x: 50, y: 10, w: 20, h: 15 },
      ],
      true,
    );
    const rects = [...root.querySelectorAll('.stage-media__hide-rect')] as HTMLElement[];
    expect(rects).toHaveLength(2);
    expect(rects[1].style.left).toBe('50%');
    expect(rects[1].style.top).toBe('10%');
  });
});
