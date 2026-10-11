import { Injectable, StreamableFile } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { copyFile, mkdir, mkdtemp, rm, stat } from 'fs/promises';
import { tmpdir } from 'os';
import { extname, join, resolve, sep } from 'path';
import { Readable } from 'stream';
import { ZipFile } from 'yazl';
import { DomainError } from '../common/domain-error';
import { AdminService } from '../admin/services/admin.service';
import {
  classifyMediaValue,
  collectReferencedPackRels,
  findQuizJsonEntry,
  parsePackManifest,
  rewriteLocalMediaToPackPaths,
  rewritePackPathsToUploads,
  sanitizeZipRoot,
  stripExportIds,
  visitMediaFields,
  assertSafeZipPath,
} from './pack-media';
import { PACK_FORMAT, PACK_VERSION, type PackMediaKind, type QuizBuilderPayload } from './pack-types';
import { extractZipEntriesToDir, listZipEntryNames, readZipEntryBuffer, ZIP_LIMITS } from './pack-zip';

const IMAGE_MAX = 25 * 1024 * 1024;
const AUDIO_MAX = 25 * 1024 * 1024;
const VIDEO_MAX = 120 * 1024 * 1024;

@Injectable()
export class QuizPackService {
  constructor(private readonly admin: AdminService) {}

  uploadsRoot(): string {
    return join(process.cwd(), 'public', 'uploads');
  }

  async exportQuizPack(quizId: string): Promise<StreamableFile> {
    const payload = (await this.admin.getQuizBuilderPayload(quizId)) as QuizBuilderPayload;
    const quiz = structuredClone(payload);
    stripExportIds(quiz);
    const uploadsRoot = this.uploadsRoot();
    const { files, missingMedia } = rewriteLocalMediaToPackPaths(quiz, (kind, fileName) => {
      const root = resolve(uploadsRoot, kind);
      const absPath = resolve(root, fileName);
      if (absPath !== root && !absPath.startsWith(root + sep)) return 'missing';
      if (!existsSync(absPath)) return 'missing';
      const ext = extname(fileName) || defaultExt(kind);
      return { absPath, ext };
    });

    const manifest = {
      format: PACK_FORMAT,
      version: PACK_VERSION,
      exportedAt: new Date().toISOString(),
      ...(missingMedia.length ? { missingMedia } : {}),
      quiz,
    };
    const root = sanitizeZipRoot(quiz.title);
    const filename = asciiDownloadName(root);
    const zipfile = new ZipFile();
    zipfile.addBuffer(Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'), `${root}/quiz.json`);
    for (const file of files) {
      const name = `${root}/${file.zipRel}`;
      if (file.source.type === 'buffer') {
        zipfile.addBuffer(file.source.data, name);
      } else {
        zipfile.addFile(file.source.absPath, name);
      }
    }
    zipfile.end();
    return new StreamableFile(zipfile.outputStream as Readable, {
      type: 'application/zip',
      disposition: `attachment; filename="${filename}"`,
    });
  }

  async importQuizPack(ownerUserId: string, zipPath: string): Promise<{ quizId: string }> {
    const destDir = await mkdtemp(join(tmpdir(), 'quiz-pack-'));
    try {
      const names = await listZipEntryNames(zipPath);
      for (const n of names) assertSafeZipPath(n);
      const { jsonName, dirPrefix } = findQuizJsonEntry(names);
      const jsonBuf = await readZipEntryBuffer(zipPath, jsonName, ZIP_LIMITS.MAX_QUIZ_JSON_BYTES);
      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonBuf.toString('utf8'));
      } catch {
        throw DomainError.validation('quiz.json is not valid JSON');
      }
      const manifest = parsePackManifest(parsed);
      const quiz = manifest.quiz;
      const rels = collectReferencedPackRels(quiz);
      const wanted = new Set<string>([jsonName]);
      for (const rel of rels) {
        wanted.add(assertSafeZipPath(`${dirPrefix}${rel}`));
      }
      await extractZipEntriesToDir(zipPath, destDir, wanted);

      const urlByRel = new Map<string, string>();
      const uploadsRoot = this.uploadsRoot();
      for (const visit of visitMediaFields(quiz)) {
        const classified = classifyMediaValue(visit.get());
        if (classified.type !== 'packRel') continue;
        if (urlByRel.has(classified.rel)) continue;
        const zipEntry = assertSafeZipPath(`${dirPrefix}${classified.rel}`);
        const src = join(destDir, ...zipEntry.split('/'));
        let st;
        try {
          st = await stat(src);
        } catch {
          continue;
        }
        const max = maxBytesForKind(visit.kind);
        if (st.size > max) {
          throw DomainError.validation(`media file too large: ${classified.rel}`);
        }
        const ext = extname(classified.rel) || defaultExt(visit.kind);
        const destName = `${randomUUID()}${ext}`;
        const destAbs = join(uploadsRoot, visit.kind, destName);
        await mkdir(join(uploadsRoot, visit.kind), { recursive: true });
        await copyFile(src, destAbs);
        urlByRel.set(classified.rel, `/uploads/${visit.kind}/${destName}`);
      }
      rewritePackPathsToUploads(quiz, urlByRel);
      return this.admin.createQuizFromBuilderPayload(ownerUserId, quiz);
    } finally {
      await rm(destDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

function defaultExt(kind: PackMediaKind): string {
  if (kind === 'audio') return '.mp3';
  if (kind === 'video') return '.mp4';
  return '.png';
}

function maxBytesForKind(kind: PackMediaKind): number {
  if (kind === 'audio') return AUDIO_MAX;
  if (kind === 'video') return VIDEO_MAX;
  return IMAGE_MAX;
}

function asciiDownloadName(root: string): string {
  const ascii = root.replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return `${ascii || 'quiz'}.quizpack.zip`;
}
