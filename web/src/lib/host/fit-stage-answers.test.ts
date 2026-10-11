/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import {
  answerColOptions,
  answersOverflowPx,
  fitStageAnswers,
  preferredAnswerFontMaxPx,
} from './fit-stage-answers';

describe('answerColOptions', () => {
  it('prefers larger tiles first', () => {
    expect(answerColOptions(4)).toEqual([2, 4]);
    expect(answerColOptions(5)).toEqual([3, 5]);
    expect(answerColOptions(6)).toEqual([3, 2, 6]);
    expect(answerColOptions(3)).toEqual([3, 2]);
    expect(answerColOptions(2)).toEqual([2]);
  });
});

describe('preferredAnswerFontMaxPx', () => {
  afterEach(() => {
    document.documentElement.style.removeProperty('--stage-answers-font-size');
  });

  it('reads builder stage type size', () => {
    document.documentElement.style.setProperty('--stage-answers-font-size', '40px');
    expect(preferredAnswerFontMaxPx()).toBe(40);
  });

  it('falls back to legacy max when unset', () => {
    expect(preferredAnswerFontMaxPx()).toBe(22);
  });
});

describe('fitStageAnswers', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    document.documentElement.style.removeProperty('--stage-answers-font-size');
  });

  function mount(count: number, visual: boolean) {
    const center = document.createElement('div');
    center.className = 'stage-center';
    const answers = document.createElement('div');
    answers.id = 'stageAnswers';
    answers.className = 'grid-answers host-stage__answers' + (visual ? ' grid-answers--visual' : '');
    for (let i = 0; i < count; i++) {
      const tile = document.createElement('div');
      tile.className = 'answer' + (visual ? ' answer--visual' : '');
      if (visual) {
        const img = document.createElement('img');
        tile.appendChild(img);
      }
      answers.appendChild(tile);
    }
    center.appendChild(answers);
    document.body.appendChild(center);
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 2400 });
    Object.defineProperty(center, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 0, bottom: 900, left: 0, right: 1320, width: 1320, height: 900 }),
    });
    Object.defineProperty(answers, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        top: 280,
        bottom: 280 + answers.scrollHeight,
        left: 0,
        right: 1320,
        width: 1320,
        height: answers.scrollHeight,
      }),
    });
    Object.defineProperty(answers, 'scrollHeight', {
      configurable: true,
      get() {
        const cols = Number(answers.dataset.cols || 2);
        const rows = Math.ceil(count / cols);
        const imgH = Number.parseInt(answers.style.getPropertyValue('--stage-answer-img-max-h') || '250', 10);
        return rows * (visual ? imgH + 20 : 80);
      },
    });
    return { center, answers };
  }

  it('keeps 2 columns and grows images when 2x2 fits', () => {
    const { center, answers } = mount(4, true);
    fitStageAnswers(center);
    expect(answers.dataset.cols).toBe('2');
    const h = Number.parseInt(answers.style.getPropertyValue('--stage-answer-img-max-h') || '0', 10);
    expect(h).toBeGreaterThanOrEqual(250);
  });

  it('uses 4 columns when 2 rows of 4 visual answers overflow', () => {
    const { center, answers } = mount(4, true);
    Object.defineProperty(center, 'getBoundingClientRect', {
      value: () => ({ top: 0, bottom: 560, left: 0, right: 1320, width: 1320, height: 560 }),
    });
    fitStageAnswers(center);
    expect(answers.dataset.cols).toBe('4');
  });

  it('shrinks images when even a single row overflows', () => {
    const { center, answers } = mount(4, true);
    Object.defineProperty(center, 'getBoundingClientRect', {
      value: () => ({ top: 0, bottom: 400, left: 0, right: 1320, width: 1320, height: 400 }),
    });
    fitStageAnswers(center);
    expect(answers.dataset.cols).toBe('4');
    const h = Number.parseInt(answers.style.getPropertyValue('--stage-answer-img-max-h') || '0', 10);
    expect(h).toBeGreaterThan(0);
    expect(h).toBeLessThan(250);
  });

  it('does not change answers that already have a saved layout', () => {
    const { center, answers } = mount(4, true);
    answers.querySelector('.answer')?.setAttribute('data-stage-applied', '1');
    fitStageAnswers(center);
    expect(answers.dataset.cols).toBeUndefined();
  });

  it('uses 2 columns for text tiles when they fit', () => {
    const { center, answers } = mount(4, false);
    fitStageAnswers(center);
    expect(answers.dataset.count).toBe('4');
    expect(answers.dataset.cols).toBe('2');
  });

  it('does not override builder answer font size when tiles fit', () => {
    document.documentElement.style.setProperty('--stage-answers-font-size', '40px');
    const { center, answers } = mount(4, false);
    fitStageAnswers(center);
    expect(answers.style.getPropertyValue('--stage-answer-font')).toBe('');
  });

  it('sets and grows question media when leftover height remains', () => {
    const { center, answers } = mount(4, true);
    const media = document.createElement('div');
    media.id = 'stageMedia';
    media.appendChild(document.createElement('img'));
    center.insertBefore(media, answers);
    Object.defineProperty(center, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 0, bottom: 1100, left: 0, right: 1320, width: 1320, height: 1100 }),
    });
    Object.defineProperty(answers, 'getBoundingClientRect', {
      configurable: true,
      value: () => {
        const mediaH = Number.parseInt(center.style.getPropertyValue('--stage-media-max-h') || '280', 10);
        const top = 40 + mediaH;
        return {
          top,
          bottom: top + answers.scrollHeight,
          left: 0,
          right: 1320,
          width: 1320,
          height: answers.scrollHeight,
        };
      },
    });
    fitStageAnswers(center);
    expect(answers.dataset.cols).toBe('2');
    const mediaH = Number.parseInt(center.style.getPropertyValue('--stage-media-max-h') || '0', 10);
    expect(mediaH).toBeGreaterThan(280);
    const imgH = Number.parseInt(answers.style.getPropertyValue('--stage-answer-img-max-h') || '0', 10);
    expect(imgH).toBeGreaterThan(250);
  });

  it('reports overflow from remaining stage height', () => {
    const { center, answers } = mount(4, true);
    answers.dataset.cols = '2';
    answers.style.setProperty('--stage-answer-img-max-h', '250px');
    Object.defineProperty(center, 'getBoundingClientRect', {
      value: () => ({ top: 0, bottom: 600, left: 0, right: 1320, width: 1320, height: 600 }),
    });
    expect(answersOverflowPx(answers, center)).toBeGreaterThan(1);
    answers.dataset.cols = '4';
    expect(answersOverflowPx(answers, center)).toBeLessThanOrEqual(0);
  });

  it('does not grow 2x2 tiles past the viewport when the stage box expands', () => {
    const { center, answers } = mount(4, true);
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 });
    Object.defineProperty(center, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        top: 0,
        bottom: 280 + answers.scrollHeight,
        left: 0,
        right: 1320,
        width: 1320,
        height: 280 + answers.scrollHeight,
      }),
    });
    fitStageAnswers(center);
    expect(answers.dataset.cols).toBe('2');
    const h = Number.parseInt(answers.style.getPropertyValue('--stage-answer-img-max-h') || '0', 10);
    expect(h).toBeGreaterThanOrEqual(250);
    expect(h).toBeLessThan(378);
    expect(280 + answers.scrollHeight).toBeLessThanOrEqual(900);
  });

  it('shrinks the explanation image so answers stay on the stage', () => {
    const { center, answers } = mount(4, true);
    center.setAttribute('data-stage-swap', 'explanation');
    const expl = document.createElement('div');
    expl.id = 'stageExplanationImage';
    const img = document.createElement('img');
    img.className = 'host-stage__explanation-img';
    expl.appendChild(img);
    center.insertBefore(expl, answers);
    Object.defineProperty(center, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 0, bottom: 700, left: 0, right: 1320, width: 1320, height: 700 }),
    });
    Object.defineProperty(answers, 'getBoundingClientRect', {
      configurable: true,
      value: () => {
        const explH = Number.parseInt(center.style.getPropertyValue('--stage-expl-img-max-h') || '360', 10);
        const top = 80 + explH;
        return {
          top,
          bottom: top + answers.scrollHeight,
          left: 0,
          right: 1320,
          width: 1320,
          height: answers.scrollHeight,
        };
      },
    });
    fitStageAnswers(center);
    const explH = Number.parseInt(center.style.getPropertyValue('--stage-expl-img-max-h') || '0', 10);
    expect(explH).toBeGreaterThanOrEqual(180);
    expect(explH).toBeLessThanOrEqual(360);
    expect(80 + explH + answers.scrollHeight).toBeLessThanOrEqual(716);
  });
});
