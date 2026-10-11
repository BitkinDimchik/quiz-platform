/** Типы колонок под SQLite (без jsonb / timestamptz / bytea / pg enum). */

export const sqliteJson = { type: 'simple-json' as const, default: '{}' };
export const sqliteDateTime = { type: 'datetime' as const };
export const sqliteUuid = { type: 'varchar' as const, length: 36 };

function blobFromDb(value: Buffer | Uint8Array | string | null): Buffer | null {
  if (value == null) return value;
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  return Buffer.from(value);
}

export const sqliteBlob = {
  type: 'blob' as const,
  transformer: {
    to: (value: Buffer | null) => value,
    from: blobFromDb,
  },
};

