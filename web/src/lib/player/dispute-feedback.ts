import type { OpenDispute, PlayerQuestion } from './types';

export type DisputeApprovalInput = Pick<OpenDispute, 'proposerPlayerId' | 'questionId' | 'status'> | null | undefined;

/** После зачёта оспаривания помечаем ответ автора спора как правильный. */
export function markOwnAnswerCorrectIfDisputeApproved(
  question: PlayerQuestion | null,
  dispute: DisputeApprovalInput,
  myPlayerId: string | null | undefined,
  outcome?: string,
): PlayerQuestion | null {
  if (!question) return question;
  const approved = outcome === 'approved' || dispute?.status === 'approved';
  if (!approved || !dispute || !myPlayerId) return question;
  if (String(dispute.proposerPlayerId || '') !== String(myPlayerId)) return question;
  if (dispute.questionId && String(dispute.questionId) !== String(question.id)) return question;
  const pa = question.playerAnswer || {};
  if (pa.isCorrect === true) return question;
  return { ...question, playerAnswer: { ...pa, isCorrect: true } };
}
