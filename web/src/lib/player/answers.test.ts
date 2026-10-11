import { describe, expect, it } from 'vitest';
import { mergeAnswerKeyIntoQuestion, shouldKeepPlayerAnswerDraft } from './answers';

describe('shouldKeepPlayerAnswerDraft', () => {
  it('keeps a draft on the same question during question phase', () => {
    expect(shouldKeepPlayerAnswerDraft('q1', 'q1', 'question')).toBe(true);
  });

  it('keeps a draft into reveal so the own answer can be coloured', () => {
    expect(shouldKeepPlayerAnswerDraft('q1', 'q1', 'answer_reveal')).toBe(true);
  });

  it('resets when the question or phase changes', () => {
    expect(shouldKeepPlayerAnswerDraft('q1', 'q2', 'question')).toBe(false);
    expect(shouldKeepPlayerAnswerDraft('q1', 'q1', 'lobby')).toBe(false);
    expect(shouldKeepPlayerAnswerDraft('', 'q1', 'question')).toBe(false);
  });
});

describe('mergeAnswerKeyIntoQuestion', () => {
  it('copies correct ids onto the cached question', () => {
    const q = mergeAnswerKeyIntoQuestion(
      { id: 'q1', type: 'single', prompt: 'P', options: [] },
      { questionId: 'q1', correctOptionIds: ['a'] },
    );
    expect(q.correctOptionIds).toEqual(['a']);
  });

  it('ignores a key for another question', () => {
    const q = mergeAnswerKeyIntoQuestion(
      { id: 'q1', type: 'single', prompt: 'P', options: [] },
      { questionId: 'q2', correctOptionIds: ['a'] },
    );
    expect(q.correctOptionIds).toBeUndefined();
  });
});

