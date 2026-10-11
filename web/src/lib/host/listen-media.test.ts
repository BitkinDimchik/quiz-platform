import { describe, expect, it } from 'vitest';
import { questionHasListenMedia } from './listen-media';

describe('questionHasListenMedia', () => {
  it('is false without media', () => {
    expect(questionHasListenMedia(null)).toBe(false);
    expect(questionHasListenMedia({})).toBe(false);
    expect(questionHasListenMedia({ audioUrl: '  ', videoUrl: '' })).toBe(false);
  });

  it('detects host view urls and builder media', () => {
    expect(questionHasListenMedia({ audioUrl: 'https://x/a.mp3' })).toBe(true);
    expect(questionHasListenMedia({ videoUrl: 'https://x/v.mp4' })).toBe(true);
    expect(questionHasListenMedia({ media: { audio: ' https://x/a.mp3 ' } })).toBe(true);
    expect(questionHasListenMedia({ media: { video: 'https://x/v.mp4' } })).toBe(true);
  });
});
