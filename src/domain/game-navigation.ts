import { Round } from '../entities/round.entity';

export type RoundLayout = { round: Round; questionIds: string[] };
export type RevisionLayout = { rounds: RoundLayout[] };

export type NextNavStep =
  | { kind: 'question'; roundId: string; questionId: string }
  | { kind: 'leaderboard'; roundId: string }
  | { kind: 'finished' };

function flatten(layout: RevisionLayout): Array<{ round: Round; questionId: string }> {
  const out: Array<{ round: Round; questionId: string }> = [];
  for (const rl of layout.rounds) {
    for (const qid of rl.questionIds) {
      out.push({ round: rl.round, questionId: qid });
    }
  }
  return out;
}

export function firstQuestion(layout: RevisionLayout): { roundId: string; questionId: string } | null {
  const head = layout.rounds[0];
  if (!head?.questionIds.length) return null;
  return { roundId: head.round.id, questionId: head.questionIds[0] };
}

export function afterReveal(currentQuestionId: string, layout: RevisionLayout): NextNavStep {
  const flat = flatten(layout);
  const idx = flat.findIndex((x) => x.questionId === currentQuestionId);
  if (idx < 0) return { kind: 'finished' };

  const { round: curRound } = flat[idx];
  const nextIdx = idx + 1;

  if (nextIdx < flat.length && flat[nextIdx].round.id === curRound.id) {
    return {
      kind: 'question',
      roundId: curRound.id,
      questionId: flat[nextIdx].questionId,
    };
  }

  // Always show intermediate leaderboard between rounds.
  // Final results are still handled by "finished" after the last round.
  if (nextIdx < flat.length) {
    return { kind: 'leaderboard', roundId: curRound.id };
  }

  const rIdx = layout.rounds.findIndex((r) => r.round.id === curRound.id);
  if (rIdx + 1 < layout.rounds.length) {
    const nr = layout.rounds[rIdx + 1];
    const q0 = nr.questionIds[0];
    if (q0) return { kind: 'question', roundId: nr.round.id, questionId: q0 };
  }
  return { kind: 'finished' };
}

export function afterLeaderboard(leaderboardRoundId: string, layout: RevisionLayout): NextNavStep {
  const idx = layout.rounds.findIndex((r) => r.round.id === leaderboardRoundId);
  if (idx < 0) return { kind: 'finished' };
  if (idx + 1 < layout.rounds.length) {
    const nr = layout.rounds[idx + 1];
    const q0 = nr.questionIds[0];
    if (q0) return { kind: 'question', roundId: nr.round.id, questionId: q0 };
  }
  return { kind: 'finished' };
}

export function isLastQuestionInRound(layout: RevisionLayout, currentQuestionId: string): boolean {
  for (const rl of layout.rounds) {
    const ids = rl.questionIds || [];
    const idx = ids.indexOf(currentQuestionId);
    if (idx >= 0) return idx === ids.length - 1;
  }
  return false;
}
