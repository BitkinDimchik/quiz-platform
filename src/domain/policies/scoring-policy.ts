export type GradedResult = { isCorrect: boolean | null; points: number };

/** Начисление очков без бонуса за скорость — только базовые правила. */
export function scoreAnswer(basePoints: number, correct: boolean | null): GradedResult {
  if (correct === null) return { isCorrect: null, points: 0 };
  if (!correct) return { isCorrect: false, points: 0 };
  return { isCorrect: true, points: basePoints };
}

/**
 * Ставка заменяет стандартную цену вопроса.
 * Без ставки (0) — обычные очки и без риска потери.
 */
export function scoreAnswerWithStake(
  basePoints: number,
  correct: boolean | null,
  stakeAmt: number,
): GradedResult {
  if (stakeAmt > 0) {
    if (correct === true) return { isCorrect: true, points: stakeAmt };
    if (correct === false) return { isCorrect: false, points: -stakeAmt };
    return { isCorrect: null, points: 0 };
  }
  return scoreAnswer(basePoints, correct);
}

/**
 * Очки за matching в режиме per_match: ⌊basePoints × correctCount / n⌋, без бонуса за скорость.
 */
export function scoreMatchingPerMatch(
  basePoints: number,
  correctCount: number,
  n: number,
): GradedResult {
  if (n <= 0 || correctCount < 0) return { isCorrect: false, points: 0 };
  const earned = Math.floor((basePoints * correctCount) / n);
  const fully = correctCount === n && n > 0;
  return { isCorrect: fully, points: earned };
}

/** Matching per_match: ставка заменяет базовую цену, частичный результат — доля ставки. */
export function scoreMatchingPerMatchWithStake(
  basePoints: number,
  correctCount: number,
  n: number,
  stakeAmt: number,
): GradedResult {
  if (n <= 0 || correctCount < 0) {
    return { isCorrect: false, points: stakeAmt > 0 ? -stakeAmt : 0 };
  }
  if (stakeAmt > 0) {
    if (correctCount === n) return { isCorrect: true, points: stakeAmt };
    if (correctCount === 0) return { isCorrect: false, points: -stakeAmt };
    return { isCorrect: false, points: Math.floor((stakeAmt * correctCount) / n) };
  }
  return scoreMatchingPerMatch(basePoints, correctCount, n);
}
