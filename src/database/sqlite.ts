import { mkdirSync } from 'fs';
import { dirname, isAbsolute, join } from 'path';

export const DEFAULT_SQLITE_RELATIVE_PATH = join('data', 'quiz.sqlite');

export function resolveSqliteDatabasePath(raw?: string): string {
  const value = (raw ?? process.env.DATABASE_PATH ?? DEFAULT_SQLITE_RELATIVE_PATH).trim();
  if (value === ':memory:') return value;
  const abs = isAbsolute(value) ? value : join(process.cwd(), value);
  mkdirSync(dirname(abs), { recursive: true });
  return abs;
}

export function ensureLocalDataDirs(): void {
  const root = process.cwd();
  mkdirSync(join(root, 'data'), { recursive: true });
  mkdirSync(join(root, 'public', 'uploads', 'audio'), { recursive: true });
  mkdirSync(join(root, 'public', 'uploads', 'video'), { recursive: true });
  mkdirSync(join(root, 'public', 'uploads', 'image'), { recursive: true });
  mkdirSync(join(root, 'public', 'uploads', 'avatar'), { recursive: true });
}

export function sqliteTypeOrmOptions(logging = false) {
  ensureLocalDataDirs();
  const database = resolveSqliteDatabasePath();
  return {
    type: 'better-sqlite3' as const,
    database,
    synchronize: true,
    logging,
    enableWAL: database !== ':memory:',
    prepareDatabase: (db: { pragma: (sql: string) => unknown }) => {
      db.pragma('foreign_keys = ON');
      db.pragma('busy_timeout = 5000');
    },
  };
}
