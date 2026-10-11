import { parseStageLayout, stageFontsFromLayout } from './stage-layout';

describe('stageFontsFromLayout', () => {
  it('returns only authored font families', () => {
    const layout = parseStageLayout({
      v: 1,
      prompt: { x: 10, y: 10, w: 80, h: 20, fontFamily: 'Georgia, serif' },
      answers: {
        o1: { x: 10, y: 40, w: 30, h: 12, fontFamily: 'Arial' },
        o2: { x: 50, y: 40, w: 30, h: 12 },
      },
    });
    expect(stageFontsFromLayout(layout)).toEqual({
      prompt: 'Georgia, serif',
      answers: { o1: 'Arial' },
    });
  });

  it('returns undefined when layout has no fonts', () => {
    const layout = parseStageLayout({ v: 1, prompt: { x: 10, y: 10, w: 80, h: 20 } });
    expect(stageFontsFromLayout(layout)).toBeUndefined();
  });
});
