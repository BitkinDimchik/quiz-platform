import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { resolveSqliteDatabasePath } from './sqlite';

describe('resolveSqliteDatabasePath', () => {
  const prev = process.env.DATABASE_PATH;

  afterEach(() => {
    if (prev === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = prev;
  });

  it('uses :memory: as-is', () => {
    expect(resolveSqliteDatabasePath(':memory:')).toBe(':memory:');
  });

  it('resolves relative path under cwd and creates parent dir', () => {
    const dir = mkdtempSync(join(tmpdir(), 'quiz-sqlite-'));
    try {
      const file = join(dir, 'nested', 'quiz.sqlite');
      const resolved = resolveSqliteDatabasePath(file);
      expect(resolved).toBe(file);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
