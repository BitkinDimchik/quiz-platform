import { unlink } from 'fs/promises';
import { join, resolve, sep } from 'path';
import { matchUploadUrl } from './pack-media';
import type { PackMediaKind } from './pack-types';

const UPLOAD_IN_TEXT = /\/uploads\/(audio|video|image)\/([^/"\\\s]+)/g;

export type UploadRef = { kind: PackMediaKind; fileName: string; url: string };

export function defaultUploadsRoot(): string {
  return join(process.cwd(), 'public', 'uploads');
}

export function toUploadUrl(kind: PackMediaKind, fileName: string): string {
  return `/uploads/${kind}/${fileName}`;
}

export function collectUploadUrlsFromUnknown(value: unknown, out = new Set<string>()): Set<string> {
  if (value == null) return out;
  if (typeof value === 'string') {
    addUploadUrlsFromString(value, out);
    return out;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return out;
  if (Array.isArray(value)) {
    for (const item of value) collectUploadUrlsFromUnknown(item, out);
    return out;
  }
  if (typeof value === 'object') {
    for (const item of Object.values(value as Record<string, unknown>)) {
      collectUploadUrlsFromUnknown(item, out);
    }
  }
  return out;
}

export function addUploadUrlsFromString(value: string, out: Set<string>): void {
  const direct = matchUploadUrl(value);
  if (direct) {
    out.add(toUploadUrl(direct.kind, direct.fileName));
    return;
  }
  UPLOAD_IN_TEXT.lastIndex = 0;
  for (const m of value.matchAll(UPLOAD_IN_TEXT)) {
    const parsed = matchUploadUrl(`/uploads/${m[1]}/${m[2]}`);
    if (parsed) out.add(toUploadUrl(parsed.kind, parsed.fileName));
  }
}

export function parseUploadRef(url: string): UploadRef | null {
  const parsed = matchUploadUrl(url);
  if (!parsed) return null;
  if (parsed.fileName === '.gitkeep') return null;
  return { kind: parsed.kind, fileName: parsed.fileName, url: toUploadUrl(parsed.kind, parsed.fileName) };
}

/** Absolute path inside uploads/{kind}/, or null if the URL is unsafe. */
export function safeUploadAbsPath(uploadsRoot: string, url: string): string | null {
  const ref = parseUploadRef(url);
  if (!ref) return null;
  const kindRoot = resolve(uploadsRoot, ref.kind);
  const absPath = resolve(kindRoot, ref.fileName);
  const prefix = kindRoot.endsWith(sep) ? kindRoot : kindRoot + sep;
  if (absPath !== kindRoot && !absPath.startsWith(prefix)) return null;
  if (absPath === kindRoot) return null;
  return absPath;
}

export async function unlinkUploadFile(uploadsRoot: string, url: string): Promise<boolean> {
  const absPath = safeUploadAbsPath(uploadsRoot, url);
  if (!absPath) return false;
  try {
    await unlink(absPath);
    return true;
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return false;
    throw e;
  }
}
