import { DomainError } from '../common/domain-error';
import {
  PACK_FORMAT,
  PACK_VERSION,
  type PackFile,
  type PackMediaKind,
  type QuizBuilderPayload,
  type QuizPackManifest,
} from './pack-types';

const PACK_MEDIA_REL = /^media\/[A-Za-z0-9][A-Za-z0-9._-]{0,200}$/;
const UPLOAD_URL = /^\/uploads\/(audio|video|image)\/([^/\\]+)$/;

const MIME_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
  'image/avif': '.avif',
  'audio/mpeg': '.mp3',
  'audio/mp3': '.mp3',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
  'audio/ogg': '.ogg',
  'audio/webm': '.weba',
  'audio/mp4': '.m4a',
  'audio/aac': '.aac',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
  'video/x-matroska': '.mkv',
  'video/ogg': '.ogv',
};

export type MediaVisit = {
  kind: PackMediaKind;
  suggestedBase: string;
  get: () => string;
  set: (next: string) => void;
};

export type ClassifiedMedia =
  | { type: 'empty' }
  | { type: 'skip' }
  | { type: 'external'; url: string }
  | { type: 'packRel'; rel: string }
  | { type: 'upload'; kind: PackMediaKind; fileName: string }
  | { type: 'dataUrl'; mime: string; ext: string; buffer: Buffer };

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function visitMediaFields(quiz: QuizBuilderPayload): MediaVisit[] {
  const out: MediaVisit[] = [];
  out.push({
    kind: 'image',
    suggestedBase: 'cover',
    get: () => String(quiz.background ?? ''),
    set: (next) => {
      quiz.background = next;
    },
  });
  out.push({
    kind: 'audio',
    suggestedBase: 'final-music',
    get: () => String(quiz.finalMusic ?? ''),
    set: (next) => {
      quiz.finalMusic = next;
    },
  });

  (quiz.rounds || []).forEach((round, ri) => {
    const r = pad2(ri + 1);
    out.push({
      kind: 'image',
      suggestedBase: `r${r}-bg`,
      get: () => String(round.background ?? ''),
      set: (next) => {
        round.background = next;
      },
    });
    out.push({
      kind: 'audio',
      suggestedBase: `r${r}-music`,
      get: () => String(round.music ?? ''),
      set: (next) => {
        round.music = next;
      },
    });
    out.push({
      kind: 'audio',
      suggestedBase: `r${r}-lb-music`,
      get: () => String(round.leaderboardMusic ?? ''),
      set: (next) => {
        round.leaderboardMusic = next;
      },
    });

    (round.questions || []).forEach((q, qi) => {
      const qq = `r${r}-q${pad2(qi + 1)}`;
      if (!q.media) q.media = { image: null, video: '', audio: '' };
      out.push({
        kind: 'image',
        suggestedBase: `${qq}-image`,
        get: () => String(q.media.image ?? ''),
        set: (next) => {
          q.media.image = next;
        },
      });
      out.push({
        kind: 'audio',
        suggestedBase: `${qq}-audio`,
        get: () => String(q.media.audio ?? ''),
        set: (next) => {
          q.media.audio = next;
        },
      });
      out.push({
        kind: 'video',
        suggestedBase: `${qq}-video`,
        get: () => String(q.media.video ?? ''),
        set: (next) => {
          q.media.video = next;
        },
      });
      if (!q.explanation) q.explanation = { text: '', image: null, video: '' };
      out.push({
        kind: 'image',
        suggestedBase: `${qq}-expl`,
        get: () => String(q.explanation?.image ?? ''),
        set: (next) => {
          q.explanation = q.explanation || { text: '', image: null, video: '' };
          q.explanation.image = next;
        },
      });
      out.push({
        kind: 'video',
        suggestedBase: `${qq}-expl-video`,
        get: () => String(q.explanation?.video ?? ''),
        set: (next) => {
          q.explanation = q.explanation || { text: '', image: null, video: '' };
          q.explanation.video = next;
        },
      });
      out.push({
        kind: 'audio',
        suggestedBase: `${qq}-music`,
        get: () => String(q.music ?? ''),
        set: (next) => {
          q.music = next;
        },
      });
      (q.options || []).forEach((opt, oi) => {
        out.push({
          kind: 'image',
          suggestedBase: `${qq}-opt-${pad2(oi + 1)}`,
          get: () => String(opt.imageUrl ?? ''),
          set: (next) => {
            opt.imageUrl = next;
          },
        });
      });
      (q.matchLeft || []).forEach((row, oi) => {
        out.push({
          kind: 'image',
          suggestedBase: `${qq}-match-l-${pad2(oi + 1)}`,
          get: () => String(row.imageUrl ?? ''),
          set: (next) => {
            row.imageUrl = next;
          },
        });
      });
      (q.matchRight || []).forEach((row, oi) => {
        out.push({
          kind: 'image',
          suggestedBase: `${qq}-match-r-${pad2(oi + 1)}`,
          get: () => String(row.imageUrl ?? ''),
          set: (next) => {
            row.imageUrl = next;
          },
        });
      });
    });
  });

  return out;
}

export function extFromMime(mime: string, fallback: string): string {
  const key = mime.trim().toLowerCase();
  return MIME_EXT[key] || fallback;
}

export function parseDataUrl(value: string): { mime: string; ext: string; buffer: Buffer } | null {
  if (!value.toLowerCase().startsWith('data:')) return null;
  const comma = value.indexOf(',');
  if (comma < 0) return null;
  const header = value.slice(5, comma);
  const payload = value.slice(comma + 1);
  const parts = header.split(';').map((p) => p.trim()).filter(Boolean);
  const mime = (parts[0] || 'application/octet-stream').toLowerCase();
  const isB64 = parts.some((p) => p.toLowerCase() === 'base64');
  let buffer: Buffer;
  try {
    buffer = isB64 ? Buffer.from(payload, 'base64') : Buffer.from(decodeURIComponent(payload), 'utf8');
  } catch {
    return null;
  }
  if (!buffer.length) return null;
  const fallback = mime.startsWith('video/') ? '.mp4' : mime.startsWith('audio/') ? '.mp3' : '.bin';
  return { mime, ext: extFromMime(mime, fallback), buffer };
}

export function classifyMediaValue(raw: string | null | undefined): ClassifiedMedia {
  const value = (raw ?? '').trim();
  if (!value) return { type: 'empty' };
  if (value.startsWith('gradient:')) return { type: 'skip' };
  if (/^data:/i.test(value)) {
    const parsed = parseDataUrl(value);
    if (!parsed) return { type: 'skip' };
    return { type: 'dataUrl', ...parsed };
  }
  if (/^https?:\/\//i.test(value)) return { type: 'external', url: value };
  if (value.startsWith('media/')) {
    if (!isSafePackMediaRel(value)) {
      throw DomainError.validation(`unsafe media path: ${value}`);
    }
    return { type: 'packRel', rel: value };
  }
  const upload = matchUploadUrl(value);
  if (upload) return upload;
  return { type: 'skip' };
}

export function matchUploadUrl(
  value: string,
): { type: 'upload'; kind: PackMediaKind; fileName: string } | null {
  const m = UPLOAD_URL.exec(value.trim());
  if (!m) return null;
  const kind = m[1] as PackMediaKind;
  const fileName = m[2];
  if (!fileName || fileName === '.' || fileName === '..' || fileName.includes('..')) return null;
  return { type: 'upload', kind, fileName };
}

export function isSafePackMediaRel(rel: string): boolean {
  return PACK_MEDIA_REL.test(rel);
}

/** Normalized zip entry path (forward slashes) or throw. */
export function assertSafeZipPath(name: string): string {
  const raw = String(name || '').replace(/\\/g, '/');
  if (!raw || raw.length > 1024) {
    throw DomainError.validation('invalid zip entry path');
  }
  if (raw.startsWith('/') || /^[a-zA-Z]:/.test(raw)) {
    throw DomainError.validation('invalid zip entry path');
  }
  const parts = raw.split('/');
  for (const part of parts) {
    if (part === '' || part === '.' || part === '..') {
      throw DomainError.validation('invalid zip entry path');
    }
    if (part.length > 255) {
      throw DomainError.validation('invalid zip entry path');
    }
  }
  return parts.join('/');
}

export function findQuizJsonEntry(entryNames: string[]): { jsonName: string; dirPrefix: string } {
  const jsons: string[] = [];
  for (const name of entryNames) {
    const n = assertSafeZipPath(name);
    if (n === 'quiz.json' || /^[^/]+\/quiz\.json$/.test(n)) jsons.push(n);
  }
  if (jsons.length === 0) {
    throw DomainError.validation('quiz.json not found in pack');
  }
  if (jsons.length > 1) {
    throw DomainError.validation('pack contains more than one quiz.json');
  }
  const jsonName = jsons[0];
  const slash = jsonName.lastIndexOf('/');
  const dirPrefix = slash >= 0 ? jsonName.slice(0, slash + 1) : '';
  return { jsonName, dirPrefix };
}

export function uniqueMediaName(used: Set<string>, base: string, ext: string): string {
  const safeExt = /^\.[A-Za-z0-9]{1,10}$/.test(ext) ? ext : '.bin';
  let stem = sanitizeFileStem(base);
  if (!stem) stem = 'file';
  let n = 1;
  let name = `${stem}${safeExt}`;
  while (used.has(name)) {
    n += 1;
    name = `${stem}-${n}${safeExt}`;
  }
  used.add(name);
  return name;
}

export function sanitizeFileStem(raw: string): string {
  const s = String(raw || '')
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  return s || 'file';
}

export function sanitizeZipRoot(title: string): string {
  const s = String(title || '')
    .replace(/[/\\:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  return s || 'quiz';
}

export function parsePackManifest(raw: unknown): QuizPackManifest {
  if (!raw || typeof raw !== 'object') {
    throw DomainError.validation('invalid quiz.json');
  }
  const obj = raw as Record<string, unknown>;
  if (obj.format !== PACK_FORMAT) {
    throw DomainError.validation('unsupported pack format');
  }
  if (obj.version !== PACK_VERSION) {
    throw DomainError.validation('unsupported pack version');
  }
  const quiz = obj.quiz;
  if (!quiz || typeof quiz !== 'object') {
    throw DomainError.validation('quiz.json missing quiz');
  }
  const q = quiz as QuizBuilderPayload;
  if (typeof q.title !== 'string' || !q.title.trim()) {
    throw DomainError.validation('quiz title required');
  }
  if (!Array.isArray(q.rounds)) {
    throw DomainError.validation('quiz rounds required');
  }
  return {
    format: PACK_FORMAT,
    version: PACK_VERSION,
    exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : new Date().toISOString(),
    missingMedia: Array.isArray(obj.missingMedia)
      ? obj.missingMedia.filter((x): x is string => typeof x === 'string')
      : undefined,
    quiz: q,
  };
}

export function stripExportIds(quiz: QuizBuilderPayload): void {
  delete quiz.quizId;
  for (const round of quiz.rounds || []) {
    for (const q of round.questions || []) {
      delete q.id;
    }
  }
}

export function rewriteLocalMediaToPackPaths(
  quiz: QuizBuilderPayload,
  resolveUpload: (kind: PackMediaKind, fileName: string) => { absPath: string; ext: string } | 'missing',
): { files: PackFile[]; missingMedia: string[] } {
  const used = new Set<string>();
  const packedByKey = new Map<string, string>();
  const files: PackFile[] = [];
  const missingMedia: string[] = [];

  for (const visit of visitMediaFields(quiz)) {
    const original = visit.get();
    const classified = classifyMediaValue(original);
    if (classified.type === 'empty' || classified.type === 'skip' || classified.type === 'external') {
      continue;
    }
    if (classified.type === 'packRel') {
      continue;
    }
    const cached = packedByKey.get(original);
    if (cached) {
      visit.set(cached);
      continue;
    }
    if (classified.type === 'dataUrl') {
      const name = uniqueMediaName(used, visit.suggestedBase, classified.ext);
      const rel = `media/${name}`;
      packedByKey.set(original, rel);
      visit.set(rel);
      files.push({ zipRel: rel, source: { type: 'buffer', data: classified.buffer } });
      continue;
    }
    const resolved = resolveUpload(classified.kind, classified.fileName);
    if (resolved === 'missing') {
      missingMedia.push(original);
      visit.set('');
      continue;
    }
    const name = uniqueMediaName(used, visit.suggestedBase, resolved.ext);
    const rel = `media/${name}`;
    packedByKey.set(original, rel);
    visit.set(rel);
    files.push({ zipRel: rel, source: { type: 'path', absPath: resolved.absPath } });
  }

  return { files, missingMedia };
}

export function rewritePackPathsToUploads(
  quiz: QuizBuilderPayload,
  urlByRel: Map<string, string>,
): void {
  for (const visit of visitMediaFields(quiz)) {
    const classified = classifyMediaValue(visit.get());
    if (classified.type !== 'packRel') continue;
    const next = urlByRel.get(classified.rel);
    if (!next) {
      visit.set('');
      continue;
    }
    visit.set(next);
  }
}

export function collectReferencedPackRels(quiz: QuizBuilderPayload): Set<string> {
  const rels = new Set<string>();
  for (const visit of visitMediaFields(quiz)) {
    const classified = classifyMediaValue(visit.get());
    if (classified.type === 'packRel') rels.add(classified.rel);
  }
  return rels;
}
