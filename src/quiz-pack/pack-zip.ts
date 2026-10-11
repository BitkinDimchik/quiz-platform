import { mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import * as yauzl from 'yauzl';
import { DomainError } from '../common/domain-error';
import { assertSafeZipPath } from './pack-media';

const MAX_ENTRIES = 2000;
const MAX_ENTRY_BYTES = 120 * 1024 * 1024;
const MAX_QUIZ_JSON_BYTES = 32 * 1024 * 1024;

function normalizeName(fileName: string): string {
  return String(fileName || '').replace(/\\/g, '/');
}

function mapZipErr(err: unknown): Error {
  if (err instanceof DomainError) return err;
  const msg = err instanceof Error ? err.message : String(err);
  if (/invalid relative path/i.test(msg) || /invalid zip entry path/i.test(msg)) {
    return DomainError.validation('invalid zip entry path');
  }
  return err instanceof Error ? err : new Error(msg);
}

export async function listZipEntryNames(zipPath: string): Promise<string[]> {
  const zipfile = await yauzl.openPromise(zipPath, {
    lazyEntries: true,
    decodeStrings: true,
    autoClose: false,
  });
  try {
    const names: string[] = [];
    for await (const entry of zipfile.eachEntry()) {
      const name = normalizeName(entry.fileName);
      if (!name.endsWith('/')) names.push(name);
      if (names.length > MAX_ENTRIES) {
        throw DomainError.validation('zip has too many entries');
      }
    }
    return names;
  } catch (e) {
    throw mapZipErr(e);
  } finally {
    try {
      zipfile.close();
    } catch {
      /* already closed */
    }
  }
}

export async function readZipEntryBuffer(zipPath: string, entryName: string, maxBytes: number): Promise<Buffer> {
  const zipfile = await yauzl.openPromise(zipPath, {
    lazyEntries: true,
    decodeStrings: true,
    autoClose: false,
  });
  try {
    for await (const entry of zipfile.eachEntry()) {
      const name = normalizeName(entry.fileName);
      if (name !== entryName) continue;
      if (entry.uncompressedSize > maxBytes) {
        throw DomainError.validation('zip entry is too large');
      }
      const stream = await zipfile.openReadStreamPromise(entry);
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of stream) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buf.length;
        if (size > maxBytes) {
          throw DomainError.validation('zip entry is too large');
        }
        chunks.push(buf);
      }
      return Buffer.concat(chunks);
    }
    throw DomainError.validation(`zip entry not found: ${entryName}`);
  } catch (e) {
    throw mapZipErr(e);
  } finally {
    try {
      zipfile.close();
    } catch {
      /* already closed */
    }
  }
}

export async function extractZipEntriesToDir(
  zipPath: string,
  destDir: string,
  wanted: Set<string>,
): Promise<void> {
  const zipfile = await yauzl.openPromise(zipPath, {
    lazyEntries: true,
    decodeStrings: true,
    autoClose: false,
  });
  try {
    for await (const entry of zipfile.eachEntry()) {
      const name = normalizeName(entry.fileName);
      if (name.endsWith('/') || !wanted.has(name)) continue;
      const safe = assertSafeZipPath(name);
      if (entry.uncompressedSize > MAX_ENTRY_BYTES) {
        throw DomainError.validation('zip entry is too large');
      }
      const abs = join(destDir, ...safe.split('/'));
      const stream = await zipfile.openReadStreamPromise(entry);
      await mkdir(dirname(abs), { recursive: true });
      await pipeline(stream, createWriteStream(abs));
    }
  } catch (e) {
    throw mapZipErr(e);
  } finally {
    try {
      zipfile.close();
    } catch {
      /* already closed */
    }
  }
}

export const ZIP_LIMITS = {
  MAX_ENTRIES,
  MAX_ENTRY_BYTES,
  MAX_QUIZ_JSON_BYTES,
};
