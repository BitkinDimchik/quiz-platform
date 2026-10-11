/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { enterBuilderPreviewBody, exitBuilderPreviewBody } from './preview-body';

describe('builder preview body classes', () => {
  afterEach(() => {
    document.body.className = '';
  });

  it('unlocks page scroll after a preview that used a round background', () => {
    document.body.className = 'brand';
    enterBuilderPreviewBody();
    document.body.classList.add('viewport-round-active');

    exitBuilderPreviewBody();

    expect(document.body.classList.contains('preview-fullscreen')).toBe(false);
    expect(document.body.classList.contains('host')).toBe(false);
    expect(document.body.classList.contains('host-quiz-viewing')).toBe(false);
    expect(document.body.classList.contains('viewport-round-active')).toBe(false);
    expect(document.body.classList.contains('brand')).toBe(true);
  });
});
