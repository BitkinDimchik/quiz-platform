import { describe, expect, it } from 'vitest';
import {
  defaultMatchingQuestion,
  defaultPointsByTypeDefaults,
  defaultQuestion,
  defaultRound,
  effectiveQuestionPoints,
  effectiveQuestionReadSec,
  effectiveQuestionTimer,
  ensureChoiceOptions,
  ensureIndexes,
  emptyQuizDraft,
  emptyUi,
  isQuestionComplete,
  isRoundComplete,
  mapBuilderTypeToApi,
} from './defaults';

describe('builder defaults', () => {
  it('creates first round and question for an empty draft', () => {
    const draft = emptyQuizDraft();
    const ui = ensureIndexes(draft, emptyUi());

    expect(draft.rounds).toHaveLength(1);
    expect(draft.rounds[0].questions).toHaveLength(1);
    expect(ui.activeRoundIdx).toBe(0);
    expect(ui.activeQuestionIdx).toBe(0);
  });

  it('does not trim option labels while normalizing (typing spaces)', () => {
    const draft = emptyQuizDraft();
    ensureIndexes(draft, emptyUi());
    draft.rounds[0].questions[0].options[0].label = 'В ';
    ensureIndexes(draft, emptyUi());
    expect(draft.rounds[0].questions[0].options[0].label).toBe('В ');
  });

  it('restores real options when switching matching back to single choice', () => {
    const q = defaultMatchingQuestion();

    q.type = 'single';
    ensureChoiceOptions(q);

    expect(q.options).toHaveLength(2);
    expect(q.options[0]).toMatchObject({ label: '', imageUrl: null });
    expect(q.matchLeft).toBeUndefined();
    expect(q.matchRight).toBeUndefined();
  });

  it('restores real options when a text question becomes multiple choice', () => {
    const q = defaultQuestion();
    q.type = 'text';
    q.options = [];

    q.type = 'multiple';
    ensureChoiceOptions(q);

    expect(q.options).toHaveLength(2);
  });

  it('inherits round timing until question overrides', () => {
    const round = defaultRound();
    round.defaultTimer = 20;
    round.defaultReadSec = 5;
    const q = defaultQuestion();
    expect(effectiveQuestionTimer(round, q)).toBe(20);
    expect(effectiveQuestionReadSec(round, q)).toBe(5);
    q.useRoundTimer = false;
    q.timer = 12;
    q.useRoundReadSec = false;
    q.readSec = 4;
    expect(effectiveQuestionTimer(round, q)).toBe(12);
    expect(effectiveQuestionReadSec(round, q)).toBe(4);
  });

  it('inherits round points until question overrides', () => {
    const round = defaultRound();
    round.defaultPoints = 5;
    round.defaultPointsByType = defaultPointsByTypeDefaults(5);
    const q = defaultQuestion();
    expect(effectiveQuestionPoints(round, q)).toBe(5);
    q.useRoundPoints = false;
    q.points = 10;
    expect(effectiveQuestionPoints(round, q)).toBe(10);
  });

  it('inherits points by question type', () => {
    const round = defaultRound();
    round.defaultPointsByType = {
      single: 1,
      multiple: 2,
      text: 3,
      matching: 4,
      hidden: 5,
    };
    const q = defaultQuestion();
    expect(effectiveQuestionPoints(round, q)).toBe(1);
    q.type = 'text';
    expect(effectiveQuestionPoints(round, q)).toBe(3);
    q.type = 'matching';
    expect(effectiveQuestionPoints(round, q)).toBe(4);
    q.type = 'hidden';
    expect(effectiveQuestionPoints(round, q)).toBe(5);
  });

  it('marks choice questions incomplete without a correct option', () => {
    const q = defaultQuestion();
    q.text = 'Test?';
    q.options[0].label = 'A';
    q.options[1].label = 'B';
    q.correct = [];
    expect(isQuestionComplete(q)).toBe(false);
    q.correct = [q.options[0].id];
    expect(isQuestionComplete(q)).toBe(true);
  });

  it('marks round incomplete when any question is incomplete', () => {
    const round = defaultRound();
    round.title = 'R1';
    round.questions = [defaultQuestion()];
    const q = round.questions[0];
    q.text = 'Q?';
    q.options[0].label = 'A';
    q.options[1].label = 'B';
    q.correct = [];
    expect(isRoundComplete(round)).toBe(false);
    q.correct = [q.options[0].id];
    expect(isRoundComplete(round)).toBe(true);
  });

  it('starts questions with empty answer explanation', () => {
    expect(defaultQuestion().explanation).toEqual({ text: '', image: null, video: '' });
    expect(defaultMatchingQuestion().explanation).toEqual({ text: '', image: null, video: '' });
  });

  it('requires an image for hidden questions', () => {
    const q = defaultQuestion();
    q.type = 'hidden';
    q.hiddenAnswer = 'text';
    q.text = 'Что скрыто?';
    q.correct = ['кот'];
    q.media = { image: null, video: '', audio: '' };
    expect(isQuestionComplete(q)).toBe(false);
    q.media.image = '/uploads/image/x.jpg';
    expect(isQuestionComplete(q)).toBe(true);
  });

  it('maps hidden builder type to single_choice or text_input', () => {
    const q = defaultQuestion();
    q.type = 'hidden';
    q.hiddenAnswer = 'single';
    expect(mapBuilderTypeToApi(q)).toBe('single_choice');
    q.hiddenAnswer = 'text';
    expect(mapBuilderTypeToApi(q)).toBe('text_input');
  });
});
