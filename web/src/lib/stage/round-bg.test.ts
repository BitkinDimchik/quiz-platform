/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { applyViewportRoundBg, clearViewportRoundBg, resolveStageBackground } from './round-bg';

describe('resolveStageBackground', () => {
  it('keeps the round background', () => {
    expect(resolveStageBackground('/r.jpg', '/q.jpg')).toBe('/r.jpg');
  });

  it('falls back to the quiz splash', () => {
    expect(resolveStageBackground(null, '/q.jpg')).toBe('/q.jpg');
    expect(resolveStageBackground('  ', 'gradient:linear-gradient(red, blue)')).toBe(
      'gradient:linear-gradient(red, blue)',
    );
  });
});

describe('viewport round background class', () => {
  afterEach(() => {
    document.body.className = '';
    document.getElementById('viewportRoundBg')?.remove();
  });

  it('clears viewport-round-active even after the overlay node is gone', () => {
    const el = document.createElement('div');
    el.id = 'viewportRoundBg';
    document.body.appendChild(el);
    applyViewportRoundBg('/bg.jpg');
    expect(document.body.classList.contains('viewport-round-active')).toBe(true);
    el.remove();

    clearViewportRoundBg();

    expect(document.body.classList.contains('viewport-round-active')).toBe(false);
  });
});
