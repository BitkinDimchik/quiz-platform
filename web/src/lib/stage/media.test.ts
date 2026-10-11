/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { appendQuestionStageVideo } from './media';

describe('appendQuestionStageVideo flags', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('default/solo: muted autoplay, no controls', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    appendQuestionStageVideo(root, 'https://example.test/clip.mp4');
    const v = root.querySelector('video') as HTMLVideoElement | null;
    expect(v).toBeTruthy();
    expect(v!.controls).toBe(false);
    expect(v!.autoplay).toBe(true);
    expect(v!.hasAttribute('muted')).toBe(true);
  });

  it('live flags: controls, no autoplay, not muted-forced', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    appendQuestionStageVideo(root, 'https://example.test/clip.mp4', {
      autoplay: false,
      controls: true,
    });
    const v = root.querySelector('video') as HTMLVideoElement | null;
    expect(v).toBeTruthy();
    expect(v!.controls).toBe(true);
    expect(v!.autoplay).toBe(false);
    expect(v!.hasAttribute('autoplay')).toBe(false);
    expect(v!.muted).toBe(false);
  });
});
