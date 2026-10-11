import { describe, expect, it } from 'vitest';
import { defaultMatchingQuestion, defaultQuestion, defaultRound } from './defaults';
import { applyRoundConfig, parseRoundConfigTxt, parseTxtImport, roundTxtFilename, serializeRoundToTxt } from './import-txt';

describe('parseRoundConfigTxt', () => {
  it('parses standalone config file', () => {
    const cfg = parseRoundConfigTxt(`
# комментарий
[настройки]
время_ответа: 20
время_прочтения: 5
цена: 10
экран_раунда: 6
показ_ответа: 2
итоги: 6
ответы: в_конце_раунда
`);
    expect(cfg).toEqual({
      defaultTimer: 20,
      defaultReadSec: 5,
      defaultPoints: 10,
      introSec: 6,
      summarySec: 2,
      leaderboardSec: 6,
      answerRevealMode: 'end_of_round',
    });
  });

  it('accepts english keys', () => {
    const cfg = parseRoundConfigTxt('timer=12\nread=4\npoints=3\nreveal=per_question');
    expect(cfg).toEqual({
      defaultTimer: 12,
      defaultReadSec: 4,
      defaultPoints: 3,
      answerRevealMode: 'per_question',
    });
  });

  it('parses config after round header line', () => {
    const cfg = parseRoundConfigTxt(`
Раунд 1: Базовая история ; (Выбор из 4 вариантов)
время_ответа: 20
время_прочтения: 5
цена: 10
`);
    expect(cfg).toEqual({
      defaultTimer: 20,
      defaultReadSec: 5,
      defaultPoints: 10,
    });
  });
});

describe('parseTxtImport with round config', () => {
  it('applies config before questions', () => {
    const parsed = parseTxtImport(`
Раунд 1: Тест ; (Правила)
время_ответа: 25
цена: 5

Q1 Какой цвет неба?
A) Синий CORRECT
B) Красный
`);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].config.defaultTimer).toBe(25);
    expect(parsed[0].config.defaultPoints).toBe(5);
    expect(parsed[0].round.defaultTimer).toBe(25);
    expect(parsed[0].round.defaultPoints).toBe(5);
    expect(parsed[0].round.title).toBe('Тест');
    expect(parsed[0].round.description).toBe('Правила');
    expect(parsed[0].round.questions).toHaveLength(1);
  });

  it('does not treat round title and settings as a question', () => {
    const parsed = parseTxtImport(`
Раунд 8: Фантастические существа и животные  
(Фантастические существа и животные)

[настройки]  
время_ответа: 15  
время_прочтения: 3  
цена: 1  
экран_раунда: 6  
показ_ответа: 6  
итоги: 6  
ответы: после_каждого_вопроса  

текст Q1 Как зовут сову Гарри Поттера || Букля || Хедвиг  
текст Q2 Как называется дракон Хагрида || Норберт
`);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].round.title).toBe('Фантастические существа и животные');
    expect(parsed[0].round.description).toBe('Фантастические существа и животные');
    expect(parsed[0].round.defaultTimer).toBe(15);
    expect(parsed[0].round.summarySec).toBe(6);
    expect(parsed[0].round.questions).toHaveLength(2);
    expect(parsed[0].round.questions[0].type).toBe('text');
    expect(parsed[0].round.questions[0].text).toBe('Как зовут сову Гарри Поттера');
    expect(parsed[0].round.questions[0].correct).toEqual(['Букля', 'Хедвиг']);
    expect(parsed[0].round.questions.map((q) => q.text).join(' ')).not.toMatch(/настройки|время_ответа/);
  });

  it('imports mixed question types in one round', () => {
    const parsed = parseTxtImport(`
Раунд 1: Смешанный ; (разные типы)

Q1 Какой цвет неба?
A) Синий CORRECT
B) Красный

текст Q2 Как зовут сову Гарри Поттера || Букля || Хедвиг

3. текст Как называется дракон Хагрида || Норберт

Q4 Сопоставьте
L) Франция
L) Италия
R) Париж
R) Рим
= 2 1

Q5 Вопрос без вариантов || только || текстовый || ответ
`);
    expect(parsed).toHaveLength(1);
    const qs = parsed[0].round.questions;
    expect(qs).toHaveLength(5);
    expect(qs[0].type).toBe('single');
    expect(qs[0].text).toBe('Какой цвет неба?');
    expect(qs[0].options.map((o) => o.label)).toEqual(['Синий', 'Красный']);
    expect(qs[1].type).toBe('text');
    expect(qs[1].text).toBe('Как зовут сову Гарри Поттера');
    expect(qs[1].correct).toEqual(['Букля', 'Хедвиг']);
    expect(qs[2].type).toBe('text');
    expect(qs[2].text).toBe('Как называется дракон Хагрида');
    expect(qs[2].correct).toEqual(['Норберт']);
    expect(qs[3].type).toBe('matching');
    expect(qs[3].matchCorrect).toEqual([2, 1]);
    expect(qs[4].type).toBe('text');
    expect(qs[4].correct).toEqual(['только', 'текстовый', 'ответ']);
  });

  it('imports Q-format text questions without «текст» prefix', () => {
    const parsed = parseTxtImport(`
Раунд 1: Тест

Q2 Во что профессор МакГонагалл предлагала превратить Гарри и Рона за опоздание на урок
в карманные часы
карманные часы
в часы

Q11 Какое существо нападает на учеников на Хэллоуин в Хогвартсе
тролль
горный тролль
`);
    expect(parsed[0].round.questions).toHaveLength(2);
    expect(parsed[0].round.questions[0].type).toBe('text');
    expect(parsed[0].round.questions[0].text).toContain('МакГонагалл');
    expect(parsed[0].round.questions[0].correct).toEqual(['в карманные часы', 'карманные часы', 'в часы']);
    expect(parsed[0].round.questions[1].type).toBe('text');
    expect(parsed[0].round.questions[1].correct).toEqual(['тролль', 'горный тролль']);
  });

  it('applyRoundConfig merges only explicit keys', () => {
    const round = defaultRound();
    round.defaultTimer = 15;
    applyRoundConfig(round, { defaultTimer: 30, defaultPoints: 7 });
    expect(round.defaultTimer).toBe(30);
    expect(round.defaultPoints).toBe(7);
    expect(round.defaultReadSec).toBe(3);
  });
});

describe('serializeRoundToTxt', () => {
  it('writes text only and round-trips choice and text questions', () => {
    const round = defaultRound();
    round.title = 'Разминка';
    round.description = 'Без картинок';
    round.music = 'secret.mp3';
    round.background = '/bg.png';
    round.defaultTimer = 20;
    round.defaultPoints = 4;
    round.answerRevealMode = 'end_of_round';
    const choice = defaultQuestion();
    choice.text = 'Столица Франции?';
    choice.options = [
      { id: 'a', label: 'Париж', imageUrl: '/paris.jpg' },
      { id: 'b', label: 'Рим', imageUrl: null },
    ];
    choice.correct = ['a'];
    choice.media = { image: '/q.png', video: 'https://youtu.be/x', audio: 'a.mp3' };
    choice.music = 'q.mp3';
    choice.explanation = { text: 'Эйфелева башня', image: '/eiffel.png', video: '' };
    const text = defaultQuestion();
    text.type = 'text';
    text.text = 'Река в Лондоне';
    text.correct = ['Темза', 'Thames'];
    round.questions = [choice, text];

    const txt = serializeRoundToTxt(round, 2);
    expect(txt).toContain('Раунд 2: Разминка ; (Без картинок)');
    expect(txt).toContain('время_ответа: 20');
    expect(txt).toContain('ответы: в_конце_раунда');
    expect(txt).toContain('A) Париж CORRECT');
    expect(txt).toContain('текст Q2 Река в Лондоне');
    expect(txt).toContain('Темза');
    expect(txt).toContain('Thames');
    expect(txt).toContain('пояснение: Эйфелева башня');
    expect(txt).not.toContain('secret.mp3');
    expect(txt).not.toContain('/bg.png');
    expect(txt).not.toContain('/paris.jpg');
    expect(txt).not.toContain('youtu.be');
    expect(txt).not.toContain('/eiffel.png');

    const parsed = parseTxtImport(txt);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].round.title).toBe('Разминка');
    expect(parsed[0].round.description).toBe('Без картинок');
    expect(parsed[0].round.defaultTimer).toBe(20);
    expect(parsed[0].round.music).toBe('');
    expect(parsed[0].round.questions).toHaveLength(2);
    expect(parsed[0].round.questions[0].options.map((o) => o.label)).toEqual(['Париж', 'Рим']);
    expect(parsed[0].round.questions[0].options[0].imageUrl).toBeNull();
    expect(parsed[0].round.questions[0].explanation?.text).toBe('Эйфелева башня');
    expect(parsed[0].round.questions[0].explanation?.image).toBeNull();
    expect(parsed[0].round.questions[1].type).toBe('text');
    expect(parsed[0].round.questions[1].correct).toEqual(['Темза', 'Thames']);
  });

  it('round-trips matching labels without media', () => {
    const round = defaultRound();
    const q = defaultMatchingQuestion();
    q.text = 'Столицы';
    q.matchLeft = [
      { id: 'l1', label: 'Франция', imageUrl: '/f.png' },
      { id: 'l2', label: 'Италия', imageUrl: null },
    ];
    q.matchRight = [
      { id: 'r1', label: 'Рим', imageUrl: null },
      { id: 'r2', label: 'Париж', imageUrl: null },
    ];
    q.matchCorrect = [2, 1];
    round.questions = [q];

    const parsed = parseTxtImport(serializeRoundToTxt(round, 1));
    const got = parsed[0].round.questions[0];
    expect(got.type).toBe('matching');
    expect(got.matchLeft?.map((o) => o.label)).toEqual(['Франция', 'Италия']);
    expect(got.matchRight?.map((o) => o.label)).toEqual(['Рим', 'Париж']);
    expect(got.matchCorrect).toEqual([2, 1]);
    expect(got.matchLeft?.[0].imageUrl).toBeNull();
  });

  it('builds a safe filename from the round title', () => {
    expect(roundTxtFilename({ ...defaultRound(), title: 'Разминка / 1' }, 0)).toBe(
      'round-1-Разминка-1.txt',
    );
    expect(roundTxtFilename(defaultRound(), 3)).toBe('round-4-Раунд.txt');
  });
});
