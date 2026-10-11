import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseTxtImport } from './import-txt';

const NEURO_DIR = resolve(__dirname, '../../../../раунды после нейро сортировки');

function countExpectedQuestions(raw: string): number {
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  let count = 0;
  for (const line of lines) {
    const t = line.trim();
    if (/^(?:текст\s+)?Q\d+\b/i.test(t) || /^\d{1,3}\.\s/.test(t)) count++;
  }
  return count;
}

function isBrokenQuestion(q: ReturnType<typeof parseTxtImport>[0]['round']['questions'][0]): boolean {
  if (q.type === 'single' || q.type === 'multiple') {
    return !q.options?.length || !q.correct?.length;
  }
  if (q.type === 'text') return !q.correct?.length;
  return false;
}

describe('neuro-sorted round files', () => {
  const files = readdirSync(NEURO_DIR)
    .filter((f) => f.endsWith('.txt'))
    .sort();

  for (const file of files) {
    it(`imports ${file} completely`, () => {
      const raw = readFileSync(join(NEURO_DIR, file), 'utf8');
      const expected = countExpectedQuestions(raw);
      const parsed = parseTxtImport(raw);
      expect(parsed).toHaveLength(1);
      const qs = parsed[0].round.questions;
      const broken = qs.filter(isBrokenQuestion);

      expect(qs.length, `expected ${expected} questions`).toBe(expected);
      expect(broken, JSON.stringify(broken.map((q) => ({ type: q.type, text: q.text.slice(0, 80) })), null, 2)).toEqual([]);
    });
  }
});
