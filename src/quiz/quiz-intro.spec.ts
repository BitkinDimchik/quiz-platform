import { quizIntroPresentation } from './quiz-intro';

describe('quizIntroPresentation', () => {
  it('uses quiz title and trimmed description', () => {
    expect(
      quizIntroPresentation({
        title: '  Кино  ',
        description: '  Угадайте фильмы  ',
      }),
    ).toEqual({ title: 'Кино', description: 'Угадайте фильмы', introSec: 6 });
  });

  it('falls back to a generic title and empty description', () => {
    expect(quizIntroPresentation(null)).toEqual({ title: 'Квиз', description: '', introSec: 6 });
    expect(quizIntroPresentation({ title: '  ', description: null })).toEqual({
      title: 'Квиз',
      description: '',
      introSec: 6,
    });
  });

  it('reads introSec from quiz meta', () => {
    expect(quizIntroPresentation({ title: 'A', meta: { introSec: 12 } }).introSec).toBe(12);
    expect(quizIntroPresentation({ title: 'A', meta: { introSec: '8' } }).introSec).toBe(8);
    expect(quizIntroPresentation({ title: 'A', meta: { introSec: 0 } }).introSec).toBe(6);
  });
});
