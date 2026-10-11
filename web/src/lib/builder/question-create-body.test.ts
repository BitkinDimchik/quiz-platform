import { describe, expect, it } from 'vitest';
import { defaultQuestion } from './defaults';
import { questionCreateBody } from './question-create-body';

describe('questionCreateBody', () => {
  it('always sends trimmed explanation keys', () => {
    const q = defaultQuestion();
    q.explanation = { text: '  why  ', image: 'data:image/png;base64,xx', video: ' /uploads/video/a.mp4 ' };
    expect(questionCreateBody(q)).toEqual({
      explanationText: 'why',
      explanationImageUrl: 'data:image/png;base64,xx',
      explanationVideoUrl: '/uploads/video/a.mp4',
    });
  });

  it('sends nulls when explanation is blank', () => {
    const q = defaultQuestion();
    q.explanation = { text: '  ', image: null, video: '  ' };
    expect(questionCreateBody(q)).toEqual({
      explanationText: null,
      explanationImageUrl: null,
      explanationVideoUrl: null,
    });
  });
});
