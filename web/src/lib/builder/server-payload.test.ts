import { describe, expect, it } from 'vitest';
import { applyServerPayload } from './server-payload';

describe('applyServerPayload explanation', () => {
  it('maps nested explanation from GET payload', () => {
    const img = 'data:image/png;base64,xx';
    const draft = applyServerPayload({
      title: 'T',
      rounds: [
        {
          title: 'R1',
          questions: [
            {
              text: 'Q?',
              type: 'single',
              options: [{ id: 'a', label: 'A', imageUrl: null }],
              correct: ['a'],
              timer: 15,
              explanation: { text: 'why', image: img },
            },
          ],
        },
      ],
    });
    expect(draft.rounds[0].questions[0].explanation).toEqual({ text: 'why', image: img, video: '' });
  });

  it('defaults explanation when GET question has none', () => {
    const draft = applyServerPayload({
      title: 'T',
      rounds: [
        {
          title: 'R1',
          questions: [
            {
              text: 'Q?',
              type: 'single',
              options: [{ id: 'a', label: 'A', imageUrl: null }],
              correct: ['a'],
              timer: 15,
            },
          ],
        },
      ],
    });
    expect(draft.rounds[0].questions[0].explanation).toEqual({ text: '', image: null, video: '' });
  });

  it('falls back to flat explanationText/explanationImageUrl', () => {
    const draft = applyServerPayload({
      title: 'T',
      rounds: [
        {
          title: 'R1',
          questions: [
            {
              text: 'Q?',
              type: 'single',
              options: [{ id: 'a', label: 'A', imageUrl: null }],
              correct: ['a'],
              timer: 15,
              explanationText: 'flat why',
              explanationImageUrl: 'data:image/png;base64,yy',
            },
          ],
        },
      ],
    });
    expect(draft.rounds[0].questions[0].explanation).toEqual({
      text: 'flat why',
      image: 'data:image/png;base64,yy',
      video: '',
    });
  });

  it('maps id and stageLayout from GET payload', () => {
    const draft = applyServerPayload({
      title: 'T',
      rounds: [
        {
          title: 'R1',
          questions: [
            {
              id: '11111111-1111-4111-8111-111111111111',
              text: 'Q?',
              type: 'single',
              options: [{ id: 'a', label: 'A', imageUrl: null }],
              correct: ['a'],
              timer: 15,
              stageLayout: { v: 1, prompt: { x: 10, y: 10, w: 80, h: 20 } },
            },
          ],
        },
      ],
    });
    const q = draft.rounds[0].questions[0];
    expect(q.id).toBe('11111111-1111-4111-8111-111111111111');
    expect(q.stageLayout?.prompt?.x).toBe(10);
  });

  it('maps imageHideRect to hidden + single', () => {
    const draft = applyServerPayload({
      title: 'T',
      rounds: [
        {
          title: 'R1',
          questions: [
            {
              text: 'Что скрыто?',
              type: 'single',
              options: [{ id: 'a', label: 'A', imageUrl: null }],
              correct: ['a'],
              timer: 15,
              imageHideRect: { x: 10, y: 20, w: 30, h: 40 },
            },
          ],
        },
      ],
    });
    const q = draft.rounds[0].questions[0];
    expect(q.type).toBe('hidden');
    expect(q.hiddenAnswer).toBe('single');
    expect(q.imageHideRect).toEqual({ x: 10, y: 20, w: 30, h: 40 });
  });

  it('maps imageHideRect + text to hidden + text', () => {
    const draft = applyServerPayload({
      title: 'T',
      rounds: [
        {
          title: 'R1',
          questions: [
            {
              text: 'Что скрыто?',
              type: 'text',
              options: [],
              correct: ['кот'],
              timer: 15,
              imageHideRect: { x: 5, y: 5, w: 50, h: 50 },
            },
          ],
        },
      ],
    });
    const q = draft.rounds[0].questions[0];
    expect(q.type).toBe('hidden');
    expect(q.hiddenAnswer).toBe('text');
    expect(q.imageHideRect).toEqual({ x: 5, y: 5, w: 50, h: 50 });
  });

  it('maps imageHideRects array to hidden', () => {
    const draft = applyServerPayload({
      title: 'T',
      rounds: [
        {
          title: 'R1',
          questions: [
            {
              text: 'Что скрыто?',
              type: 'single',
              options: [{ id: 'a', label: 'A', imageUrl: null }],
              correct: ['a'],
              timer: 15,
              imageHideRects: [
                { x: 10, y: 20, w: 30, h: 40 },
                { x: 50, y: 10, w: 20, h: 15 },
              ],
            },
          ],
        },
      ],
    });
    const q = draft.rounds[0].questions[0];
    expect(q.type).toBe('hidden');
    expect(q.imageHideRects).toEqual([
      { x: 10, y: 20, w: 30, h: 40 },
      { x: 50, y: 10, w: 20, h: 15 },
    ]);
  });

  it('maps stageTypeStyles from GET payload', () => {
    const draft = applyServerPayload({
      title: 'T',
      stageTypeStyles: { heading: { fontSize: 40, fontFamily: 'Georgia, serif' } },
      rounds: [],
    });
    expect(draft.stageTypeStyles).toEqual({ heading: { fontSize: 40, fontFamily: 'Georgia, serif' } });
  });
});
