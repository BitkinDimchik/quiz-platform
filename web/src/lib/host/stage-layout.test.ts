/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import {
  applyStageLayout,
  boxBelowAnchor,
  boxForKey,
  clearAppliedLayout,
  copyStageLayoutToTarget,
  displayBoxForInspector,
  outlineFromTextShadow,
  materializeStageLayout,
  parseStageBox,
  parseStageLayout,
  readComputedBoxStyle,
  remapStageLayoutOptionIds,
  setBoxForKey,
  shiftBoxesBelowAnchor,
  nudgeBoxesBelowChanged,
  growBoxToFitOverflow,
  fitTextBoxAfterFontChange,
  stackCenteredBelow,
  stageKeyForAnswer,
  isCompactStageLabel,
} from './stage-layout';

const promptBox = { x: 10, y: 10, w: 80, h: 20 };

describe('parseStageLayout', () => {
  it('keeps a happy prompt box', () => {
    const got = parseStageLayout({ v: 1, prompt: promptBox });
    expect(got?.prompt).toEqual(promptBox);
  });

  it('keeps size and slides overflow x=97 w=20 to x=80 w=20', () => {
    const box = parseStageBox({ x: 97, y: 0, w: 20, h: 20 });
    expect(box).toEqual({ x: 80, y: 0, w: 20, h: 20 });
  });

  it('keeps height when a box is pushed past the bottom', () => {
    const box = parseStageBox({ x: 10, y: 96, w: 20, h: 10 });
    expect(box).toEqual({ x: 10, y: 90, w: 20, h: 10 });
  });

  it('returns null for v=2', () => {
    expect(parseStageLayout({ v: 2, prompt: promptBox })).toBeNull();
  });

  it('drops a junk prompt box', () => {
    expect(parseStageLayout({ v: 1, prompt: { x: 'a', y: 0, w: 10, h: 10 } })).toBeNull();
  });

  it('lowercases color', () => {
    const got = parseStageLayout({
      v: 1,
      prompt: { ...promptBox, color: '#FF00AA' },
    });
    expect(got?.prompt?.color).toBe('#ff00aa');
  });

  it('omits invalid color', () => {
    const got = parseStageLayout({
      v: 1,
      prompt: { ...promptBox, color: 'red' },
    });
    expect(got?.prompt?.color).toBeUndefined();
  });

  it('keeps stroke color and clamps width', () => {
    const got = parseStageBox({
      ...promptBox,
      strokeColor: '#AABBCC',
      strokeWidth: 99,
    });
    expect(got?.strokeColor).toBe('#aabbcc');
    expect(got?.strokeWidth).toBe(8);
  });

  it('keeps strokeWidth of 0 as an explicit no-outline', () => {
    const got = parseStageBox({ ...promptBox, strokeWidth: 0, strokeColor: '#000000' });
    expect(got?.strokeWidth).toBe(0);
    expect(got?.strokeColor).toBe('#000000');
  });

  it('keeps align and valign', () => {
    const got = parseStageBox({ ...promptBox, align: 'left', valign: 'bottom' });
    expect(got?.align).toBe('left');
    expect(got?.valign).toBe('bottom');
  });

  it('drops invalid align', () => {
    const got = parseStageBox({ ...promptBox, align: 'justify', valign: 'center' });
    expect(got?.align).toBeUndefined();
    expect(got?.valign).toBeUndefined();
  });

  it('keeps explanationImage as a slot', () => {
    const got = parseStageLayout({
      v: 1,
      explanation: promptBox,
      explanationImage: { x: 20, y: 40, w: 30, h: 25 },
    });
    expect(got?.explanation).toEqual(promptBox);
    expect(got?.explanationImage).toEqual({ x: 20, y: 40, w: 30, h: 25 });
  });

  it('keeps explanationLabel as a slot', () => {
    const got = parseStageLayout({
      v: 1,
      explanationLabel: { x: 12, y: 8, w: 20, h: 8 },
      explanation: promptBox,
    });
    expect(got?.explanationLabel).toEqual({ x: 12, y: 8, w: 20, h: 8 });
    expect(got?.explanation).toEqual(promptBox);
  });

  it('treats bare {v:1} as null', () => {
    expect(parseStageLayout({ v: 1 })).toBeNull();
  });
});

describe('remapStageLayoutOptionIds', () => {
  it('rewrites answers.a to the new uuid and drops unknown keys', () => {
    const layout = parseStageLayout({
      v: 1,
      answers: {
        a: promptBox,
        gone: promptBox,
      },
    });
    const uuid = '11111111-1111-4111-8111-111111111111';
    const next = remapStageLayoutOptionIds(layout, { a: uuid });
    expect(next?.answers?.[uuid]).toEqual(promptBox);
    expect(next?.answers?.a).toBeUndefined();
    expect(next?.answers?.gone).toBeUndefined();
  });
});

describe('copyStageLayoutToTarget', () => {
  it('copies shared slots and remaps answers by index', () => {
    const layout = parseStageLayout({
      v: 1,
      prompt: promptBox,
      timer: { x: 0, y: 0, w: 10, h: 10 },
      answers: {
        a: { x: 10, y: 40, w: 20, h: 12 },
        b: { x: 40, y: 40, w: 20, h: 12 },
      },
    });
    const next = copyStageLayoutToTarget(
      layout,
      { optionIds: ['a', 'b'], matchLeftIds: [], matchRightIds: [] },
      { optionIds: ['x', 'y', 'z'], matchLeftIds: [], matchRightIds: [] },
    );
    expect(next?.prompt).toEqual(promptBox);
    expect(next?.timer).toEqual({ x: 0, y: 0, w: 10, h: 10 });
    expect(next?.answers?.x).toEqual({ x: 10, y: 40, w: 20, h: 12 });
    expect(next?.answers?.y).toEqual({ x: 40, y: 40, w: 20, h: 12 });
    expect(next?.answers?.z).toBeUndefined();
    expect(next?.answers?.a).toBeUndefined();
  });

  it('remaps matching tiles by index', () => {
    const layout = parseStageLayout({
      v: 1,
      matchLeft: { l1: promptBox },
      matchRight: { r1: { x: 50, y: 10, w: 20, h: 20 } },
    });
    const next = copyStageLayoutToTarget(
      layout,
      { optionIds: [], matchLeftIds: ['l1'], matchRightIds: ['r1'] },
      { optionIds: [], matchLeftIds: ['L2'], matchRightIds: ['R2'] },
    );
    expect(next?.matchLeft?.L2).toEqual(promptBox);
    expect(next?.matchRight?.R2).toEqual({ x: 50, y: 10, w: 20, h: 20 });
    expect(next?.matchLeft?.l1).toBeUndefined();
  });
});

describe('applyStageLayout', () => {
  it('sets percent left on prompt and clears it when key is missing', () => {
    const root = document.createElement('div');
    root.className = 'stage-center';
    const prompt = document.createElement('div');
    prompt.setAttribute('data-stage-key', 'prompt');
    root.appendChild(prompt);
    document.body.appendChild(root);

    applyStageLayout(root, { v: 1, prompt: promptBox });
    expect(prompt.style.left).toBe('10%');
    expect(root.classList.contains('stage-center--custom-layout')).toBe(true);

    applyStageLayout(root, { v: 1, media: promptBox });
    expect(prompt.style.left).toBe('');
    expect(prompt.getAttribute('data-stage-applied')).toBeNull();

    applyStageLayout(root, { v: 1 } as { v: 1 });
    expect(root.classList.contains('stage-center--custom-layout')).toBe(false);

    document.body.removeChild(root);
  });

  it('clears absolute layout during reveal so title sits above answers', () => {
    const root = document.createElement('div');
    root.className = 'stage-center';
    root.setAttribute('data-stage-reveal', '1');
    const meta = document.createElement('div');
    meta.setAttribute('data-stage-key', 'meta');
    meta.textContent = 'Итоги раунда: правильные ответы';
    root.appendChild(meta);
    const prompt = document.createElement('div');
    prompt.setAttribute('data-stage-key', 'prompt');
    root.appendChild(prompt);
    document.body.appendChild(root);

    applyStageLayout(root, { v: 1, meta: { x: 40, y: 34, w: 27, h: 7 }, prompt: promptBox });
    expect(root.classList.contains('stage-center--custom-layout')).toBe(false);
    expect(meta.style.position).toBe('');
    expect(meta.style.left).toBe('');
    expect(meta.style.top).toBe('');
    expect(prompt.style.position).toBe('');

    root.classList.add('stage-center--editing');
    applyStageLayout(root, { v: 1, meta: { x: 40, y: 34, w: 27, h: 7 } });
    expect(meta.style.position).toBe('absolute');
    expect(meta.style.left).toBe('40%');

    document.body.removeChild(root);
  });

  it('applies matching tile keys', () => {
    const root = document.createElement('div');
    const tile = document.createElement('div');
    tile.setAttribute('data-stage-key', 'matchL:left1');
    root.appendChild(tile);
    applyStageLayout(root, {
      v: 1,
      matchLeft: { left1: promptBox },
    });
    expect(tile.style.width).toBe('80%');
  });

  it('does not pin a hidden explanation to the corner', () => {
    const root = document.createElement('div');
    const explanation = document.createElement('div');
    explanation.setAttribute('data-stage-key', 'explanation');
    explanation.style.display = 'none';
    root.appendChild(explanation);
    document.body.appendChild(root);
    applyStageLayout(root, {
      v: 1,
      explanation: { x: 0, y: 0, w: 4, h: 4 },
    });
    expect(explanation.style.left).toBe('');
    expect(explanation.getAttribute('data-stage-applied')).toBeNull();
    document.body.removeChild(root);
  });

  it('keeps a visible explanation after a second apply when CSS hides the slot by default', () => {
    const style = document.createElement('style');
    style.textContent = '.host-stage__explanation { display: none; }';
    document.head.appendChild(style);
    const root = document.createElement('div');
    const explanation = document.createElement('div');
    explanation.className = 'host-stage__explanation';
    explanation.setAttribute('data-stage-key', 'explanation');
    explanation.style.display = 'flex';
    explanation.textContent = 'Потому что';
    const prompt = document.createElement('div');
    prompt.setAttribute('data-stage-key', 'prompt');
    root.appendChild(prompt);
    root.appendChild(explanation);
    document.body.appendChild(root);

    const layout = {
      v: 1 as const,
      prompt: promptBox,
      explanation: { x: 10, y: 40, w: 80, h: 20 },
    };
    applyStageLayout(root, layout);
    applyStageLayout(root, layout);

    expect(explanation.style.display).toBe('flex');
    expect(explanation.style.left).toBe('10%');
    expect(explanation.getAttribute('data-stage-applied')).toBe('1');
    document.body.removeChild(root);
    document.head.removeChild(style);
  });

  it('places text and image explanation as independent boxes', () => {
    const root = document.createElement('div');
    Object.defineProperty(root, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 1000, height: 800, right: 1000, bottom: 800 }),
    });
    const text = document.createElement('div');
    text.setAttribute('data-stage-key', 'explanation');
    text.style.display = 'flex';
    text.textContent = 'Потому что';
    const image = document.createElement('div');
    image.setAttribute('data-stage-key', 'explanationImage');
    image.style.display = 'flex';
    image.innerHTML = '<img alt=""/>';
    root.appendChild(text);
    root.appendChild(image);
    document.body.appendChild(root);

    applyStageLayout(root, {
      v: 1,
      explanation: { x: 10, y: 20, w: 40, h: 10 },
      explanationImage: { x: 55, y: 50, w: 30, h: 25 },
    });

    expect(text.style.left).toBe('10%');
    expect(text.style.top).toBe('20%');
    expect(image.style.left).toBe('55%');
    expect(image.style.top).toBe('50%');
    document.body.removeChild(root);
  });

  it('places the explanation label as its own box', () => {
    const root = document.createElement('div');
    Object.defineProperty(root, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 1000, height: 800, right: 1000, bottom: 800 }),
    });
    const label = document.createElement('div');
    label.setAttribute('data-stage-key', 'explanationLabel');
    label.style.display = 'inline-block';
    label.textContent = 'Пояснение';
    root.appendChild(label);
    document.body.appendChild(root);

    applyStageLayout(root, {
      v: 1,
      explanationLabel: { x: 40, y: 6, w: 18, h: 7 },
    });

    expect(label.style.left).toBe('40%');
    expect(label.style.top).toBe('6%');
    expect(label.style.width).toBe('18%');
    document.body.removeChild(root);
  });

  it('relocks stage size when the lock key changes', () => {
    const root = document.createElement('div');
    let height = 800;
    Object.defineProperty(root, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 1000, height, right: 1000, bottom: height }),
    });
    const prompt = document.createElement('div');
    prompt.setAttribute('data-stage-key', 'prompt');
    root.appendChild(prompt);
    document.body.appendChild(root);

    applyStageLayout(root, { v: 1, prompt: promptBox }, 'q1');
    expect(root.style.minHeight).toBe('800px');
    height = 500;
    applyStageLayout(root, { v: 1, prompt: promptBox }, 'q2');
    expect(root.style.minHeight).toBe('500px');
    expect(root.getAttribute('data-stage-lock-key')).toBe('q2');

    document.body.removeChild(root);
  });

  it('does not materialize an empty meta slot', () => {
    const root = document.createElement('div');
    Object.defineProperty(root, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 1000, height: 800, right: 1000, bottom: 800 }),
    });
    const meta = document.createElement('div');
    meta.setAttribute('data-stage-key', 'meta');
    meta.textContent = '';
    root.appendChild(meta);
    document.body.appendChild(root);

    applyStageLayout(root, { v: 1, meta: { x: 35, y: 25, w: 30, h: 5 } });

    expect(meta.style.display).toBe('none');
    expect(meta.style.position).not.toBe('absolute');
    document.body.removeChild(root);
  });

  it('keeps a visible explanation at its measured position when it has no saved box', () => {
    const root = document.createElement('div');
    Object.defineProperty(root, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 1000, height: 800, right: 1000, bottom: 800 }),
    });
    const prompt = document.createElement('div');
    prompt.setAttribute('data-stage-key', 'prompt');
    prompt.style.display = 'none';
    const expl = document.createElement('div');
    expl.setAttribute('data-stage-key', 'explanation');
    expl.style.display = 'flex';
    expl.textContent = 'Потому что';
    Object.defineProperty(expl, 'getBoundingClientRect', {
      value: () => ({ left: 200, top: 80, width: 400, height: 40, right: 600, bottom: 120 }),
    });
    root.appendChild(prompt);
    root.appendChild(expl);
    document.body.appendChild(root);

    applyStageLayout(root, { v: 1, prompt: { x: 12, y: 4, w: 76, h: 10 } });

    expect(expl.style.left).toBe('20%');
    expect(expl.style.top).toBe('10%');
    expect(expl.style.width).toBe('40%');
    expect(expl.style.height).toBe('5%');
    document.body.removeChild(root);
  });

  it('does not shift answers when explanation replaces the prompt', () => {
    const root = document.createElement('div');
    Object.defineProperty(root, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 1000, height: 800, right: 1000, bottom: 800 }),
    });
    const expl = document.createElement('div');
    expl.setAttribute('data-stage-key', 'explanation');
    expl.style.display = 'flex';
    expl.textContent = 'Потому что';
    Object.defineProperty(expl, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 400, height: 40, right: 400, bottom: 40 }),
    });
    const a1 = document.createElement('div');
    a1.setAttribute('data-stage-key', 'answer:o1');
    const a2 = document.createElement('div');
    a2.setAttribute('data-stage-key', 'answer:o2');
    root.appendChild(expl);
    root.appendChild(a1);
    root.appendChild(a2);
    document.body.appendChild(root);

    applyStageLayout(root, {
      v: 1,
      meta: { x: 35, y: 25, w: 30, h: 5 },
      answers: {
        o1: { x: 10, y: 30, w: 20, h: 12 },
        o2: { x: 40, y: 30, w: 20, h: 12 },
      },
    });

    expect(a1.style.top).toBe('30%');
    expect(a2.style.top).toBe('30%');
    document.body.removeChild(root);
  });

  it('does not remasure answers from flow while editing', () => {
    const root = document.createElement('div');
    root.className = 'stage-center stage-center--editing';
    Object.defineProperty(root, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 1000, height: 800, right: 1000, bottom: 800 }),
    });
    const prompt = document.createElement('div');
    prompt.setAttribute('data-stage-key', 'prompt');
    const answer = document.createElement('div');
    answer.setAttribute('data-stage-key', 'answer:a1');
    answer.className = 'answer stage-answer';
    Object.defineProperty(answer, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 1000, height: 52, right: 1000, bottom: 52 }),
    });
    root.appendChild(prompt);
    root.appendChild(answer);
    document.body.appendChild(root);

    applyStageLayout(root, {
      v: 1,
      prompt: { x: 10, y: 10, w: 80, h: 20 },
      answers: { a1: { x: 10, y: 50, w: 80, h: 8 } },
    });

    expect(answer.style.top).toBe('50%');
    expect(answer.style.left).toBe('10%');
    expect(answer.style.width).toBe('80%');
    expect(answer.style.height).toBe('8%');
    document.body.removeChild(root);
  });

  it('moves answers out from under a visible explanation image', () => {
    const root = document.createElement('div');
    const parent = { left: 0, top: 0, width: 1000, height: 800, right: 1000, bottom: 800 };
    Object.defineProperty(root, 'getBoundingClientRect', { value: () => parent });
    function mockPct(el: HTMLElement) {
      Object.defineProperty(el, 'getBoundingClientRect', {
        configurable: true,
        value: () => {
          const x = parseFloat(el.style.left) || 0;
          const y = parseFloat(el.style.top) || 0;
          const w = parseFloat(el.style.width) || 10;
          const h = parseFloat(el.style.height) || 10;
          return {
            left: (x / 100) * 1000,
            top: (y / 100) * 800,
            width: (w / 100) * 1000,
            height: (h / 100) * 800,
            right: ((x + w) / 100) * 1000,
            bottom: ((y + h) / 100) * 800,
          };
        },
      });
    }
    const image = document.createElement('div');
    image.setAttribute('data-stage-key', 'explanationImage');
    image.style.display = 'flex';
    image.innerHTML = '<img alt=""/>';
    mockPct(image);
    const a1 = document.createElement('div');
    a1.setAttribute('data-stage-key', 'answer:o1');
    mockPct(a1);
    const a2 = document.createElement('div');
    a2.setAttribute('data-stage-key', 'answer:o2');
    mockPct(a2);
    root.appendChild(image);
    root.appendChild(a1);
    root.appendChild(a2);
    document.body.appendChild(root);

    applyStageLayout(root, {
      v: 1,
      explanationImage: { x: 20, y: 4, w: 40, h: 42 },
      answers: {
        o1: { x: 10, y: 28, w: 20, h: 14 },
        o2: { x: 40, y: 28, w: 20, h: 14 },
      },
    });

    expect(parseFloat(a1.style.top)).toBeGreaterThan(46);
    expect(parseFloat(a2.style.top)).toBeGreaterThan(46);
    expect(image.style.top).toBe('4%');
    document.body.removeChild(root);
  });

  it('does not move answers under an explanation image while the editor is open', () => {
    const root = document.createElement('div');
    root.className = 'stage-center--editing';
    Object.defineProperty(root, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 1000, height: 800, right: 1000, bottom: 800 }),
    });
    const image = document.createElement('div');
    image.setAttribute('data-stage-key', 'explanationImage');
    image.style.display = 'flex';
    image.innerHTML = '<img alt=""/>';
    const a1 = document.createElement('div');
    a1.setAttribute('data-stage-key', 'answer:o1');
    root.appendChild(image);
    root.appendChild(a1);
    document.body.appendChild(root);

    applyStageLayout(root, {
      v: 1,
      explanationImage: { x: 20, y: 4, w: 40, h: 42 },
      answers: { o1: { x: 10, y: 28, w: 20, h: 14 } },
    });

    expect(a1.style.top).toBe('28%');
    document.body.removeChild(root);
  });

  it('lets the editor keep timer and text answers at the saved boxes', () => {
    const root = document.createElement('div');
    root.className = 'stage-center--editing';
    Object.defineProperty(root, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 1000, height: 800, right: 1000, bottom: 800 }),
    });
    const timer = document.createElement('div');
    timer.setAttribute('data-stage-key', 'timer');
    const title = document.createElement('div');
    title.setAttribute('data-stage-key', 'correct:title');
    title.textContent = 'Ответ';
    const media = document.createElement('div');
    media.setAttribute('data-stage-key', 'media');
    const img = document.createElement('img');
    media.appendChild(img);
    root.appendChild(timer);
    root.appendChild(title);
    root.appendChild(media);
    document.body.appendChild(root);

    applyStageLayout(root, {
      v: 1,
      timer: { x: 40, y: 22, w: 18, h: 16 },
      correctTexts: { title: { x: 10, y: 60, w: 40, h: 12 } },
      media: { x: 20, y: 8, w: 50, h: 40 },
    });

    expect(timer.style.top).toBe('22%');
    expect(timer.style.left).toBe('40%');
    expect(title.style.top).toBe('60%');
    expect(title.style.left).toBe('10%');
    expect(media.style.width).toBe('50%');
    expect(media.style.height).toBe('40%');
    expect(media.style.getPropertyPriority('max-height')).toBe('important');
    expect(media.style.getPropertyValue('max-height')).toBe('none');
    expect(img.style.getPropertyValue('max-height')).toBe('none');
    document.body.removeChild(root);
  });

  it('keeps authored text-answer boxes after the editor closes', () => {
    const root = document.createElement('div');
    root.className = 'stage-center--custom-layout';
    Object.defineProperty(root, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 1000, height: 800, right: 1000, bottom: 800 }),
    });
    const timer = document.createElement('div');
    timer.setAttribute('data-stage-key', 'timer');
    const title = document.createElement('div');
    title.setAttribute('data-stage-key', 'correct:title');
    title.textContent = 'Правильный ответ:';
    root.appendChild(timer);
    root.appendChild(title);
    document.body.appendChild(root);

    applyStageLayout(root, {
      v: 1,
      timer: { x: 5, y: 8, w: 12, h: 12 },
      correctTexts: { title: { x: 28, y: 40, w: 44, h: 10 } },
    });

    expect(timer.style.top).toBe('8%');
    expect(timer.style.left).toBe('5%');
    expect(title.style.left).toBe('28%');
    expect(title.style.top).toBe('40%');
    expect(title.style.width).toBe('44%');
    document.body.removeChild(root);
  });

  it('places correct texts below the timer without moving the timer', () => {
    const root = document.createElement('div');
    Object.defineProperty(root, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 1000, height: 800, right: 1000, bottom: 800 }),
    });
    const timer = document.createElement('div');
    timer.setAttribute('data-stage-key', 'timer');
    const title = document.createElement('div');
    title.setAttribute('data-stage-key', 'correct:title');
    Object.defineProperty(title, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 200, height: 40, right: 200, bottom: 40 }),
    });
    const item = document.createElement('div');
    item.setAttribute('data-stage-key', 'correct:0');
    Object.defineProperty(item, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 180, height: 40, right: 180, bottom: 40 }),
    });
    root.appendChild(timer);
    root.appendChild(title);
    root.appendChild(item);
    document.body.appendChild(root);

    applyStageLayout(root, { v: 1, timer: { x: 40, y: 12, w: 20, h: 16 } });

    expect(timer.style.top).toBe('0%');
    expect(timer.style.left).toBe('40%');
    expect(parseFloat(title.style.top)).toBeGreaterThan(16);
    expect(parseFloat(item.style.top)).toBeGreaterThan(parseFloat(title.style.top));
    document.body.removeChild(root);
  });

  it('beats theme !important for color, size, background and stroke', () => {
    const root = document.createElement('div');
    const card = document.createElement('div');
    card.setAttribute('data-stage-key', 'answer:o1');
    const cap = document.createElement('div');
    cap.className = 'answer-caption stage-caption';
    cap.textContent = 'A';
    card.appendChild(cap);
    root.appendChild(card);
    document.body.appendChild(root);

    applyStageLayout(root, {
      v: 1,
      answers: {
        o1: {
          ...promptBox,
          fontSize: 42,
          color: '#ff00aa',
          bg: '#112233',
          bgOpacity: 0.5,
          strokeColor: '#000000',
          strokeWidth: 3,
        },
      },
    });

    expect(card.style.getPropertyPriority('color')).toBe('important');
    expect(card.style.color).toMatch(/255,\s*0,\s*170|#ff00aa/i);
    expect(card.style.getPropertyPriority('font-size')).toBe('important');
    expect(card.style.getPropertyValue('font-size')).toBe('42px');
    expect(card.style.getPropertyPriority('background')).toBe('important');
    expect(card.style.background).toMatch(/17,\s*34,\s*51/);
    expect(card.style.getPropertyValue('-webkit-text-stroke')).toMatch(/3px/);
    expect(cap.style.color).toMatch(/255,\s*0,\s*170|#ff00aa/i);
    expect(cap.style.getPropertyValue('font-size')).toBe('42px');
    expect(cap.style.background).toMatch(/17,\s*34,\s*51/);
    expect(cap.style.getPropertyPriority('color')).toBe('important');

    document.body.removeChild(root);
  });

  it('does not wipe the theme outline when only font size changes', () => {
    const root = document.createElement('div');
    const card = document.createElement('div');
    card.setAttribute('data-stage-key', 'prompt');
    root.appendChild(card);
    document.body.appendChild(root);
    applyStageLayout(root, { v: 1, prompt: { ...promptBox, fontSize: 40 } });
    expect(card.style.getPropertyValue('font-size')).toBe('40px');
    expect(card.style.getPropertyValue('text-shadow')).toBe('');
    expect(card.style.getPropertyValue('-webkit-text-stroke')).toBe('');
    document.body.removeChild(root);
  });

  it('clears the theme outline only when stroke width is explicitly 0', () => {
    const root = document.createElement('div');
    const card = document.createElement('div');
    card.setAttribute('data-stage-key', 'prompt');
    root.appendChild(card);
    document.body.appendChild(root);
    applyStageLayout(root, { v: 1, prompt: { ...promptBox, fontSize: 40, strokeWidth: 0 } });
    expect(card.style.getPropertyValue('text-shadow')).toBe('none');
    expect(card.style.getPropertyValue('-webkit-text-stroke')).toBe('');
    document.body.removeChild(root);
  });

  it('centers text in a box by default and honors align', () => {
    const root = document.createElement('div');
    const card = document.createElement('div');
    card.setAttribute('data-stage-key', 'answer:o1');
    card.className = 'answer stage-answer';
    card.textContent = 'A Северус Снейп';
    root.appendChild(card);
    applyStageLayout(root, { v: 1, answers: { o1: promptBox } });
    expect(card.style.getPropertyValue('text-align')).toBe('center');
    expect(card.style.getPropertyPriority('text-align')).toBe('important');
    expect(card.style.getPropertyValue('display')).toBe('grid');
    expect(card.style.getPropertyValue('justify-items')).toBe('center');
    expect(card.style.getPropertyValue('align-items')).toBe('center');

    applyStageLayout(root, {
      v: 1,
      answers: { o1: { ...promptBox, align: 'left', valign: 'bottom' } },
    });
    expect(card.style.getPropertyValue('text-align')).toBe('left');
    expect(card.style.getPropertyValue('justify-items')).toBe('start');
    expect(card.style.getPropertyValue('align-items')).toBe('end');
  });

  it('fills white when only bgOpacity is set', () => {
    const root = document.createElement('div');
    const prompt = document.createElement('div');
    prompt.setAttribute('data-stage-key', 'prompt');
    root.appendChild(prompt);
    applyStageLayout(root, {
      v: 1,
      prompt: { ...promptBox, bgOpacity: 0.25 },
    });
    expect(prompt.style.background).toMatch(/255,\s*255,\s*255/);
  });
});

describe('materializeStageLayout', () => {
  it('fills missing visible keys and keeps hidden snapshot answers', () => {
    const root = document.createElement('div');
    Object.defineProperty(root, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100 }),
    });
    const prompt = document.createElement('div');
    prompt.setAttribute('data-stage-key', 'prompt');
    Object.defineProperty(prompt, 'getBoundingClientRect', {
      value: () => ({ left: 20, top: 10, width: 80, height: 20, right: 100, bottom: 30 }),
    });
    root.appendChild(prompt);
    const snapshot = parseStageLayout({
      v: 1,
      answers: { o1: { x: 1, y: 2, w: 10, h: 10 } },
    });
    const got = materializeStageLayout(root, snapshot);
    expect(got?.answers?.o1).toEqual({ x: 1, y: 2, w: 10, h: 10 });
    expect(got?.prompt?.x).toBe(10);
    expect(got?.prompt?.y).toBe(10);
    expect(got?.prompt?.w).toBe(40);
    expect(got?.prompt?.h).toBe(20);
  });

  it('snapshots a visible explanation from its current rect, not a default top band', () => {
    const root = document.createElement('div');
    Object.defineProperty(root, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 1000, height: 800, right: 1000, bottom: 800 }),
    });
    const expl = document.createElement('div');
    expl.setAttribute('data-stage-key', 'explanation');
    expl.style.display = 'flex';
    expl.textContent = 'Потому что';
    Object.defineProperty(expl, 'getBoundingClientRect', {
      value: () => ({ left: 200, top: 160, width: 500, height: 48, right: 700, bottom: 208 }),
    });
    const img = document.createElement('div');
    img.setAttribute('data-stage-key', 'explanationImage');
    img.style.display = 'flex';
    img.innerHTML = '<img alt=""/>';
    Object.defineProperty(img, 'getBoundingClientRect', {
      value: () => ({ left: 250, top: 220, width: 400, height: 160, right: 650, bottom: 380 }),
    });
    root.appendChild(expl);
    root.appendChild(img);
    document.body.appendChild(root);

    const got = materializeStageLayout(root, null);
    expect(got?.explanation).toEqual({ x: 20, y: 20, w: 50, h: 6 });
    expect(got?.explanationImage?.x).toBe(25);
    expect(got?.explanationImage?.y).toBeCloseTo(27.5, 5);
    expect(got?.explanationImage?.w).toBe(40);
    expect(got?.explanationImage?.h).toBe(20);
    document.body.removeChild(root);
  });

  it('does not snapshot a hidden explanation as a 4% corner box', () => {
    const root = document.createElement('div');
    Object.defineProperty(root, 'getBoundingClientRect', {
      value: () => ({ left: 100, top: 50, width: 200, height: 100, right: 300, bottom: 150 }),
    });
    const prompt = document.createElement('div');
    prompt.setAttribute('data-stage-key', 'prompt');
    Object.defineProperty(prompt, 'getBoundingClientRect', {
      value: () => ({ left: 120, top: 60, width: 80, height: 20, right: 200, bottom: 80 }),
    });
    const explanation = document.createElement('div');
    explanation.setAttribute('data-stage-key', 'explanation');
    explanation.style.display = 'none';
    Object.defineProperty(explanation, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 }),
    });
    root.appendChild(prompt);
    root.appendChild(explanation);
    document.body.appendChild(root);
    const got = materializeStageLayout(root, null);
    expect(got?.prompt?.x).toBe(10);
    expect(got?.explanation).toBeUndefined();
    document.body.removeChild(root);
  });

  it('drops a leftover 4% explanation snapshot while the slot is hidden', () => {
    const root = document.createElement('div');
    Object.defineProperty(root, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100 }),
    });
    const explanation = document.createElement('div');
    explanation.setAttribute('data-stage-key', 'explanation');
    explanation.style.display = 'none';
    Object.defineProperty(explanation, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 }),
    });
    root.appendChild(explanation);
    document.body.appendChild(root);
    const snapshot = parseStageLayout({
      v: 1,
      prompt: promptBox,
      explanation: { x: 0, y: 0, w: 4, h: 4 },
    });
    const got = materializeStageLayout(root, snapshot);
    expect(got?.prompt).toEqual(promptBox);
    expect(got?.explanation).toBeUndefined();
    document.body.removeChild(root);
  });

  it('keeps an existing visible box geometry and styles', () => {
    const root = document.createElement('div');
    Object.defineProperty(root, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100 }),
    });
    const prompt = document.createElement('div');
    prompt.setAttribute('data-stage-key', 'prompt');
    Object.defineProperty(prompt, 'getBoundingClientRect', {
      value: () => ({ left: 40, top: 20, width: 80, height: 20, right: 120, bottom: 40 }),
    });
    root.appendChild(prompt);
    const snapshot = parseStageLayout({
      v: 1,
      prompt: { x: 10, y: 10, w: 80, h: 20, fontSize: 42, color: '#ff00aa' },
    });
    const got = materializeStageLayout(root, snapshot);
    expect(got?.prompt).toEqual({
      x: 10,
      y: 10,
      w: 80,
      h: 20,
      fontSize: 42,
      color: '#ff00aa',
    });
  });

  it('applies fontFamily from style-only floor box without moving element', () => {
    const root = document.createElement('div');
    Object.defineProperty(root, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100 }),
    });
    const prompt = document.createElement('div');
    prompt.setAttribute('data-stage-key', 'prompt');
    Object.defineProperty(prompt, 'getBoundingClientRect', {
      value: () => ({ left: 40, top: 20, width: 80, height: 20, right: 120, bottom: 40 }),
    });
    root.appendChild(prompt);
    document.body.appendChild(root);

    applyStageLayout(root, {
      v: 1,
      prompt: { x: 0, y: 0, w: 1, h: 1, fontFamily: 'Arial, Helvetica, sans-serif' },
    });

    expect(prompt.style.fontFamily).toContain('Arial');
    expect(prompt.style.left).toBe('20%');
    document.body.removeChild(root);
  });

  it('does not pin the timer to y=0 when text answers were authored', () => {
    const root = document.createElement('div');
    Object.defineProperty(root, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 1000, height: 800, right: 1000, bottom: 800 }),
    });
    const timer = document.createElement('div');
    timer.setAttribute('data-stage-key', 'timer');
    Object.defineProperty(timer, 'getBoundingClientRect', {
      value: () => ({ left: 80, top: 96, width: 120, height: 80, right: 200, bottom: 176 }),
    });
    const title = document.createElement('div');
    title.setAttribute('data-stage-key', 'correct:title');
    title.textContent = 'Правильный ответ:';
    Object.defineProperty(title, 'getBoundingClientRect', {
      value: () => ({ left: 280, top: 320, width: 440, height: 80, right: 720, bottom: 400 }),
    });
    root.appendChild(timer);
    root.appendChild(title);
    document.body.appendChild(root);

    const got = materializeStageLayout(root, {
      v: 1,
      timer: { x: 5, y: 8, w: 12, h: 12 },
      correctTexts: { title: { x: 28, y: 40, w: 44, h: 10 } },
    });
    expect(got?.timer?.y).toBe(8);
    expect(got?.timer?.x).toBe(5);
    expect(got?.correctTexts?.title?.x).toBeCloseTo(28, 5);
    expect(got?.correctTexts?.title?.y).toBe(40);
    document.body.removeChild(root);
  });
});

describe('displayBoxForInspector', () => {
  it('fills missing inspector fields from the painted element', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const spy = vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      fontSize: '32px',
      fontWeight: '700',
      color: 'rgb(10, 20, 30)',
      backgroundColor: 'rgba(255, 255, 255, 0.2)',
      background: '',
      textAlign: 'left',
      justifyItems: '',
      justifyContent: '',
      alignItems: 'flex-end',
      textShadow: 'none',
      getPropertyValue: (prop: string) =>
        prop === '-webkit-text-stroke-width'
          ? '2px'
          : prop === '-webkit-text-stroke-color'
            ? 'rgb(0, 0, 0)'
            : '',
    } as CSSStyleDeclaration);
    const got = displayBoxForInspector({ x: 10, y: 10, w: 80, h: 20 }, el);
    expect(got.fontSize).toBe(32);
    expect(got.fontWeight).toBe(700);
    expect(got.color).toBe('#0a141e');
    expect(got.bg).toBe('#ffffff');
    expect(got.bgOpacity).toBe(0.2);
    expect(got.align).toBe('left');
    expect(got.valign).toBe('bottom');
    expect(got.strokeWidth).toBe(2);
    expect(got.strokeColor).toBe('#000000');
    spy.mockRestore();
    document.body.removeChild(el);
  });

  it('keeps an explicit saved size when computed style is missing', () => {
    const box = { x: 10, y: 10, w: 80, h: 20, fontSize: 48, color: '#ff00aa' };
    expect(displayBoxForInspector(box, null)).toEqual(box);
  });
});

describe('readComputedBoxStyle', () => {
  it('parses rgba backgrounds and bold weight', () => {
    const el = document.createElement('div');
    const spy = vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      fontSize: '28px',
      fontWeight: '700',
      color: 'rgba(0, 0, 0, 0.92)',
      backgroundColor: 'rgba(255, 255, 255, 0.144)',
      background: '',
      textAlign: 'center',
      justifyItems: 'center',
      justifyContent: '',
      alignItems: 'center',
      textShadow: 'none',
      getPropertyValue: () => '',
    } as CSSStyleDeclaration);
    expect(readComputedBoxStyle(el)).toMatchObject({
      fontSize: 28,
      fontWeight: 700,
      color: '#000000',
      bg: '#ffffff',
      bgOpacity: 0.14,
      align: 'center',
      valign: 'middle',
    });
    spy.mockRestore();
  });

  it('reads the theme white outline from text-shadow', () => {
    const el = document.createElement('div');
    const spy = vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      fontSize: '24px',
      fontWeight: '700',
      color: 'rgb(0, 0, 0)',
      backgroundColor: 'transparent',
      background: '',
      textAlign: 'center',
      justifyItems: '',
      justifyContent: '',
      alignItems: '',
      textShadow:
        'rgb(255, 255, 255) -1px 0px 0px, rgb(255, 255, 255) 1px 0px 0px, rgb(255, 255, 255) 0px -1px 0px, rgb(255, 255, 255) 0px 1px 0px',
      getPropertyValue: (prop: string) =>
        prop === 'text-shadow'
          ? 'rgb(255, 255, 255) -1px 0px 0px, rgb(255, 255, 255) 1px 0px 0px'
          : '0px',
    } as CSSStyleDeclaration);
    expect(readComputedBoxStyle(el)).toMatchObject({
      strokeColor: '#ffffff',
      strokeWidth: 1,
    });
    spy.mockRestore();
  });
});

describe('outlineFromTextShadow', () => {
  it('parses the 8-way theme outline', () => {
    expect(
      outlineFromTextShadow(
        '-1px 0 0 rgba(255,255,255,0.98), 1px 0 0 rgba(255,255,255,0.98), 0 -1px 0 rgba(255,255,255,0.98), 0 1px 0 rgba(255,255,255,0.98)',
      ),
    ).toEqual({ hex: '#ffffff', width: 1 });
  });

  it('ignores soft drop shadows', () => {
    expect(outlineFromTextShadow('0 1px 2px rgba(0, 0, 0, 0.75)')).toBeNull();
  });
});

describe('boxForKey / setBoxForKey', () => {
  it('round-trips answer keys', () => {
    let layout = parseStageLayout({ v: 1, prompt: promptBox })!;
    layout = setBoxForKey(layout, stageKeyForAnswer('o1'), promptBox)!;
    expect(boxForKey(layout, 'answer:o1')).toEqual(promptBox);
  });
});

describe('clearAppliedLayout', () => {
  it('is a no-op on a clean stage', () => {
    const root = document.createElement('div');
    clearAppliedLayout(root);
    expect(root.classList.contains('stage-center--custom-layout')).toBe(false);
  });
});

describe('boxBelowAnchor', () => {
  it('puts the child directly under the anchor', () => {
    expect(boxBelowAnchor({ x: 10, y: 20, w: 30, h: 10 }, 30, 8, 2)).toEqual({
      x: 10,
      y: 32,
      w: 30,
      h: 8,
    });
  });
});

describe('shiftBoxesBelowAnchor', () => {
  it('keeps relative spacing and moves the group under the anchor', () => {
    const got = shiftBoxesBelowAnchor(
      [
        { x: 10, y: 30, w: 20, h: 10 },
        { x: 40, y: 36, w: 20, h: 10 },
      ],
      { x: 35, y: 25, w: 30, h: 12 },
      2,
    );
    expect(got[0]).toEqual({ x: 10, y: 39, w: 20, h: 10 });
    expect(got[1]).toEqual({ x: 40, y: 45, w: 20, h: 10 });
  });

  it('does not move boxes that are already below the anchor', () => {
    const boxes = [{ x: 10, y: 50, w: 20, h: 10 }];
    expect(shiftBoxesBelowAnchor(boxes, { x: 0, y: 20, w: 30, h: 10 }, 2)).toEqual(boxes);
  });
});

describe('nudgeBoxesBelowChanged', () => {
  it('moves boxes that sat below the title down by the height growth and keeps their size', () => {
    const prev = { x: 10, y: 10, w: 80, h: 20 };
    const layout = parseStageLayout({
      v: 1,
      prompt: { x: 10, y: 10, w: 80, h: 30 },
      meta: { x: 40, y: 32, w: 18, h: 6 },
      answers: { a1: { x: 10, y: 50, w: 80, h: 8 } },
      timer: { x: 0, y: 0, w: 12, h: 12 },
    });
    expect(layout).toBeTruthy();
    const next = nudgeBoxesBelowChanged(layout!, 'prompt', prev, layout!.prompt!);
    expect(next.meta?.y).toBe(42);
    expect(next.meta?.w).toBe(18);
    expect(next.meta?.h).toBe(6);
    expect(next.answers?.a1?.y).toBe(60);
    expect(next.answers?.a1?.w).toBe(80);
    expect(next.answers?.a1?.h).toBe(8);
    expect(next.timer).toEqual({ x: 0, y: 0, w: 12, h: 12 });
  });

  it('does not move boxes when only the title width changes', () => {
    const prev = { x: 10, y: 10, w: 40, h: 20 };
    const nextBox = { x: 10, y: 10, w: 80, h: 20 };
    const layout = parseStageLayout({
      v: 1,
      prompt: nextBox,
      meta: { x: 40, y: 32, w: 18, h: 6 },
      answers: { a1: { x: 10, y: 50, w: 80, h: 8 } },
    });
    const next = nudgeBoxesBelowChanged(layout!, 'prompt', prev, nextBox);
    expect(next.meta?.y).toBe(32);
    expect(next.answers?.a1?.y).toBe(50);
    expect(next.answers?.a1?.w).toBe(80);
  });
});

describe('fitTextBoxAfterFontChange', () => {
  function overflowEl(key: string, clientH: number, scrollH: number) {
    const el = document.createElement('div');
    el.setAttribute('data-stage-key', key);
    Object.defineProperties(el, {
      clientWidth: { value: 200 },
      clientHeight: { value: clientH },
      scrollWidth: { value: 200 },
      scrollHeight: { value: scrollH },
    });
    return el;
  }

  it('grows the box by overflowing text and keeps top-left', () => {
    const box = { x: 30, y: 70, w: 40, h: 6, fontSize: 48 };
    const next = growBoxToFitOverflow(box, { extraW: 0, extraH: 40 }, { width: 1000, height: 800 });
    expect(next.x).toBe(30);
    expect(next.y).toBe(70);
    expect(next.w).toBe(40);
    expect(next.h).toBe(11);
    expect(next.fontSize).toBe(48);
  });

  it('does not grow when text already fits', () => {
    const box = { x: 10, y: 10, w: 40, h: 10 };
    expect(growBoxToFitOverflow(box, { extraW: 0, extraH: 0 }, { width: 1000, height: 800 })).toEqual(box);
  });

  it('grows a correct-text box and pushes the overlapping neighbor down', () => {
    const item = { x: 30, y: 70, w: 40, h: 6, fontSize: 48 };
    const layout = parseStageLayout({
      v: 1,
      correctTexts: {
        title: { x: 30, y: 60, w: 40, h: 8, fontSize: 24 },
        '0': item,
      },
      answers: { a1: { x: 30, y: 74, w: 40, h: 6 } },
    });
    expect(layout).toBeTruthy();
    const next = fitTextBoxAfterFontChange(
      layout!,
      'correct:0',
      item,
      overflowEl('correct:0', 40, 80),
      { width: 1000, height: 800 },
    );
    const grown = next.correctTexts?.['0'];
    expect(grown?.h).toBe(11);
    expect(grown?.y).toBe(70);
    expect(next.correctTexts?.title?.y).toBe(60);
    expect(next.answers?.a1?.y).toBeGreaterThanOrEqual(grown!.y + grown!.h);
  });

  it('does not move image or timer slots', () => {
    const box = { x: 10, y: 10, w: 20, h: 12 };
    const layout = parseStageLayout({ v: 1, timer: box, prompt: { x: 10, y: 24, w: 80, h: 10 } });
    const el = overflowEl('timer', 40, 90);
    el.className = 'timer-circle';
    const next = fitTextBoxAfterFontChange(layout!, 'timer', box, el, { width: 1000, height: 800 });
    expect(next.timer).toEqual(box);
    expect(next.prompt?.y).toBe(24);
  });
});

describe('compact stage labels', () => {
  it('keeps a short meta label on one line', () => {
    const root = document.createElement('div');
    root.className = 'stage-center';
    const meta = document.createElement('div');
    meta.setAttribute('data-stage-key', 'meta');
    meta.className = 'stage-meta';
    meta.textContent = 'Правильный ответ';
    root.appendChild(meta);
    document.body.appendChild(root);
    applyStageLayout(root, { v: 1, meta: { x: 40, y: 28, w: 10, h: 4 } });
    expect(isCompactStageLabel(meta)).toBe(true);
    expect(meta.style.getPropertyValue('white-space')).toBe('nowrap');
    expect(meta.style.getPropertyValue('min-width')).toBe('min-content');
    expect(meta.style.getPropertyValue('min-height')).toBe('min-content');
    document.body.removeChild(root);
  });
});

describe('stackCenteredBelow', () => {
  it('stacks items under the timer and keeps the timer box unused', () => {
    const timer = { x: 40, y: 10, w: 20, h: 15 };
    const got = stackCenteredBelow(timer, [{ w: 30, h: 8 }, { w: 24, h: 8 }], 2);
    expect(got[0]?.y).toBe(27);
    expect(got[1]?.y).toBe(37);
    expect(got[0]?.x).toBe(35);
    expect(timer).toEqual({ x: 40, y: 10, w: 20, h: 15 });
  });
});
