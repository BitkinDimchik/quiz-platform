import { describe, expect, it } from 'vitest';
import { formatOptionDisplayLabel, stripOptionLetterPrefix } from './format';

describe('formatOptionDisplayLabel', () => {
  it('puts a parenthesis after the option letter', () => {
    expect(formatOptionDisplayLabel('Шоколадные лягушки', 0)).toBe('A) Шоколадные лягушки');
    expect(formatOptionDisplayLabel('Кислотные леденцы', 1)).toBe('B) Кислотные леденцы');
  });

  it('strips a leftover letter prefix before adding A)', () => {
    expect(formatOptionDisplayLabel('A) Шоколадные лягушки', 0)).toBe('A) Шоколадные лягушки');
    expect(formatOptionDisplayLabel('A. Шоколадные лягушки', 0)).toBe('A) Шоколадные лягушки');
  });
});

describe('stripOptionLetterPrefix', () => {
  it('removes A) prefixes', () => {
    expect(stripOptionLetterPrefix('A) Лакричные палочки')).toBe('Лакричные палочки');
    expect(stripOptionLetterPrefix('B. текст')).toBe('текст');
    expect(stripOptionLetterPrefix('В: ответ')).toBe('ответ');
  });

  it('keeps sentences that start with a one-letter word', () => {
    expect(stripOptionLetterPrefix('В честь')).toBe('В честь');
    expect(stripOptionLetterPrefix('А потом')).toBe('А потом');
    expect(stripOptionLetterPrefix('A cat')).toBe('A cat');
  });
});
