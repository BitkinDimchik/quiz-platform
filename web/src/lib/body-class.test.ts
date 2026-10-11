/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { applyBodyClassForPath } from './body-class';

describe('applyBodyClassForPath', () => {
  afterEach(() => {
    document.body.className = '';
  });

  it('sets route body class', () => {
    applyBodyClassForPath('/builder');
    expect(document.body.className).toBe('brand');
  });

  it('keeps preview-fullscreen when route class is reapplied', () => {
    document.body.className = 'brand preview-fullscreen';
    applyBodyClassForPath('/builder');
    expect(document.body.classList.contains('brand')).toBe(true);
    expect(document.body.classList.contains('preview-fullscreen')).toBe(true);
  });

  it('drops the host theme after leaving the room', () => {
    document.body.className = 'host brand host-quiz-viewing viewport-round-active';
    applyBodyClassForPath('/quizzes');
    expect(document.body.className).toBe('brand');
  });

  it('keeps host-quiz-viewing while still on the host route', () => {
    document.body.className = 'host brand host-quiz-viewing';
    applyBodyClassForPath('/host');
    expect(document.body.classList.contains('host')).toBe(true);
    expect(document.body.classList.contains('brand')).toBe(true);
    expect(document.body.classList.contains('host-quiz-viewing')).toBe(true);
    expect(document.body.classList.contains('preview-host')).toBe(false);
  });

  it('marks standalone preview so its CSS does not apply to the live host', () => {
    applyBodyClassForPath('/preview-host');
    expect(document.body.classList.contains('preview-host')).toBe(true);
    expect(document.body.classList.contains('host')).toBe(true);
    applyBodyClassForPath('/host');
    expect(document.body.classList.contains('preview-host')).toBe(false);
  });
});
