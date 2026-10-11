import { parseImageHideRect, parseImageHideRects } from './image-hide-rect';

describe('parseImageHideRect', () => {
  it('returns null for junk', () => {
    expect(parseImageHideRect(null)).toBeNull();
    expect(parseImageHideRect('x')).toBeNull();
    expect(parseImageHideRect({ x: 1, y: 2 })).toBeNull();
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
});

describe('parseImageHideRects', () => {
  it('accepts a legacy single rect or an array', () => {
    expect(parseImageHideRects({ x: 10, y: 20, w: 30, h: 40 })).toEqual([
      { x: 10, y: 20, w: 30, h: 40 },
    ]);
    expect(
      parseImageHideRects([
        { x: 10, y: 20, w: 30, h: 40 },
        { x: 50, y: 10, w: 20, h: 15 },
      ]),
    ).toHaveLength(2);
  });
});
