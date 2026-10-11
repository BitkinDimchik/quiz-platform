import { scoreAnswerWithStake, scoreMatchingPerMatchWithStake } from './scoring-policy';

describe('scoreAnswerWithStake', () => {
  it('без ставки даёт стандартную цену и не штрафует', () => {
    expect(scoreAnswerWithStake(10, true, 0)).toEqual({ isCorrect: true, points: 10 });
    expect(scoreAnswerWithStake(10, false, 0)).toEqual({ isCorrect: false, points: 0 });
  });

  it('ставка заменяет стандартную цену', () => {
    expect(scoreAnswerWithStake(10, true, 25)).toEqual({ isCorrect: true, points: 25 });
    expect(scoreAnswerWithStake(10, false, 25)).toEqual({ isCorrect: false, points: -25 });
  });
});

describe('scoreMatchingPerMatchWithStake', () => {
  it('без ставки считает долю от базовых очков', () => {
    expect(scoreMatchingPerMatchWithStake(10, 2, 4, 0)).toEqual({ isCorrect: false, points: 5 });
  });

  it('ставка заменяет базу: полный / ноль / доля', () => {
    expect(scoreMatchingPerMatchWithStake(10, 4, 4, 40)).toEqual({ isCorrect: true, points: 40 });
    expect(scoreMatchingPerMatchWithStake(10, 0, 4, 40)).toEqual({ isCorrect: false, points: -40 });
    expect(scoreMatchingPerMatchWithStake(10, 1, 4, 40)).toEqual({ isCorrect: false, points: 10 });
  });
});
