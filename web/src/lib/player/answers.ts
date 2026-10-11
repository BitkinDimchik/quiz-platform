import type {
  AnswerKeyPayload,
  AnswerPayload,
  MatchData,
  PlayerAnswer,
  PlayerQuestion,
  QuestionOption,
} from './types';
import { isMultipleChoiceType } from './types';

export function validateMatchOrder(arr: number[], n: number): boolean {
  if (!arr || arr.length !== n) return false;
  const seen: Record<number, boolean> = Object.create(null);
  for (let i = 0; i < n; i++) {
    const x = arr[i];
    if (!Number.isFinite(x) || !Number.isInteger(x) || x < 1 || x > n) return false;
    if (seen[x]) return false;
    seen[x] = true;
  }
  return true;
}

export function buildAnswerPayload(args: {
  question: PlayerQuestion;
  questionType: string | null;
  selectedOptionId: string | null;
  selectedOptionIds: string[];
  textAnswer: string;
  matchOrder: number[];
}): AnswerPayload {
  const { question, questionType, selectedOptionId, selectedOptionIds, textAnswer, matchOrder } = args;
  const payload: AnswerPayload = { questionId: question.id };

  if (questionType === 'matching') {
    const n = matchOrder.length;
    const seen: Record<number, boolean> = Object.create(null);
    for (let j = 0; j < matchOrder.length; j++) {
      const x = matchOrder[j];
      if (!Number.isFinite(x) || !Number.isInteger(x) || x < 1 || x > n) {
        throw new Error(`Укажите для каждой строки число от 1 до ${n}`);
      }
      if (seen[x]) throw new Error('Номера ответов не должны повторяться');
      seen[x] = true;
    }
    payload.matchOrder = matchOrder.slice();
    return payload;
  }

  if (questionType === 'text_input') {
    const tv = String(textAnswer || '').trim();
    if (!tv) throw new Error('Введите ответ');
    payload.textAnswer = tv;
    return payload;
  }

  if (isMultipleChoiceType(questionType)) {
    if (!selectedOptionIds || !selectedOptionIds.length) throw new Error('Выберите варианты');
    payload.selectedOptionIds = selectedOptionIds.slice();
  } else {
    if (!selectedOptionId) throw new Error('Выберите вариант');
    payload.selectedOptionIds = [selectedOptionId];
  }
  return payload;
}

export function defaultMatchOrder(m: MatchData, playerAnswer?: PlayerAnswer | null): number[] {
  const n = m.left.length;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    let prev =
      playerAnswer && playerAnswer.matchOrder && playerAnswer.matchOrder[i] != null
        ? Number(playerAnswer.matchOrder[i])
        : i + 1;
    if (!Number.isFinite(prev)) prev = i + 1;
    out.push(prev);
  }
  return out;
}

export function optionHasVisual(opts: QuestionOption[]): boolean {
  return opts.some((o) => !!(o.imageUrl || '').trim());
}

export function isPlayerRevealPhase(phase: string | null | undefined): boolean {
  return phase === 'answer_reveal' || phase === 'round_replay' || phase === 'round_summary';
}

export function shouldKeepPlayerAnswerDraft(
  prevQuestionId: string | null | undefined,
  nextQuestionId: string | null | undefined,
  phase: string | null,
): boolean {
  const prev = String(prevQuestionId || '');
  const next = String(nextQuestionId || '');
  if (!next || prev !== next) return false;
  return phase === 'question' || isPlayerRevealPhase(phase);
}

export function paintPlayerOptionSelection(selectedIds: string[]): void {
  const root = document.getElementById('answers');
  if (!root) return;
  const set = new Set(selectedIds.map(String));
  const nodes = root.querySelectorAll('[data-opt]');
  for (let i = 0; i < nodes.length; i++) {
    const el = nodes[i];
    const id = el.getAttribute('data-opt') || '';
    el.classList.toggle('selected', set.has(id));
  }
}

export function paintPlayerSubmitDisabled(disabled: boolean): void {
  const btn = document.getElementById('btnSubmit') as HTMLButtonElement | null;
  if (!btn) return;
  btn.disabled = disabled;
  btn.classList.toggle('stage-btn-submit--disabled', disabled);
}

export function paintPlayerTextValue(value: string): void {
  const el = document.getElementById('textAnswer') as HTMLTextAreaElement | null;
  if (el && el.value !== value) el.value = value;
}

export function mergeAnswerKeyIntoQuestion(
  q: PlayerQuestion,
  key: AnswerKeyPayload | null | undefined,
): PlayerQuestion {
  if (!key || String(key.questionId) !== String(q.id)) return q;
  const next: PlayerQuestion = { ...q };
  if (key.correctOptionIds) next.correctOptionIds = key.correctOptionIds.slice();
  if (key.correctTexts) next.correctTexts = key.correctTexts.slice();
  if (key.matchCorrect && next.match) {
    next.match = { ...next.match, correct: key.matchCorrect.slice() };
  }
  return next;
}

export function paintPlayerReveal(args: {
  selectedIds: string[];
  correctIds: string[];
}): void {
  const root = document.getElementById('answers');
  if (!root) return;
  const selected = new Set(args.selectedIds.map(String));
  const correct = new Set(args.correctIds.map(String));
  const nodes = root.querySelectorAll('[data-opt]');
  for (let i = 0; i < nodes.length; i++) {
    const el = nodes[i];
    const id = el.getAttribute('data-opt') || '';
    const isSelected = selected.has(id);
    const isCorrect = correct.has(id);
    el.classList.toggle('selected', isSelected);
    el.classList.add('disabled');
    if (!correct.size) continue;
    el.classList.toggle('correct', isCorrect);
    el.classList.toggle('wrong', isSelected && !isCorrect);
    el.classList.toggle('stage-answer--missed-correct', isCorrect && !isSelected);
  }
}
