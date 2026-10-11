import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  collectUploadUrlsFromUnknown,
  defaultUploadsRoot,
  unlinkUploadFile,
} from './upload-refs';

@Injectable()
export class UploadCleanupService {
  private readonly logger = new Logger(UploadCleanupService.name);

  constructor(private readonly dataSource: DataSource) {}

  uploadsRoot(): string {
    return defaultUploadsRoot();
  }

  async collectAllUploadUrls(): Promise<Set<string>> {
    const out = new Set<string>();
    await this.absorbQuery(out, `SELECT meta FROM quizzes`);
    await this.absorbQuery(out, `SELECT meta FROM rounds`);
    await this.absorbQuery(
      out,
      `SELECT image_url, audio_url, video_url, explanation_image_url, explanation_video_url, meta FROM questions`,
    );
    await this.absorbQuery(out, `SELECT image_url FROM question_options`);
    return out;
  }

  async collectQuizUploadUrls(quizId: string): Promise<Set<string>> {
    const out = new Set<string>();
    await this.absorbQuery(out, `SELECT meta FROM quizzes WHERE id = ?`, [quizId]);
    await this.absorbQuery(
      out,
      `SELECT ro.meta AS meta
       FROM rounds ro
       JOIN quiz_revisions qr ON qr.id = ro.quiz_revision_id
       WHERE qr.quiz_id = ?`,
      [quizId],
    );
    await this.absorbQuery(
      out,
      `SELECT qu.image_url, qu.audio_url, qu.video_url, qu.explanation_image_url, qu.explanation_video_url, qu.meta
       FROM questions qu
       JOIN rounds ro ON ro.id = qu.round_id
       JOIN quiz_revisions qr ON qr.id = ro.quiz_revision_id
       WHERE qr.quiz_id = ?`,
      [quizId],
    );
    await this.absorbQuery(
      out,
      `SELECT qo.image_url
       FROM question_options qo
       JOIN questions qu ON qu.id = qo.question_id
       JOIN rounds ro ON ro.id = qu.round_id
       JOIN quiz_revisions qr ON qr.id = ro.quiz_revision_id
       WHERE qr.quiz_id = ?`,
      [quizId],
    );
    return out;
  }

  async collectRevisionUploadUrls(revisionId: string): Promise<Set<string>> {
    const out = new Set<string>();
    await this.absorbQuery(out, `SELECT meta FROM rounds WHERE quiz_revision_id = ?`, [revisionId]);
    await this.absorbQuery(
      out,
      `SELECT qu.image_url, qu.audio_url, qu.video_url, qu.explanation_image_url, qu.explanation_video_url, qu.meta
       FROM questions qu
       JOIN rounds ro ON ro.id = qu.round_id
       WHERE ro.quiz_revision_id = ?`,
      [revisionId],
    );
    await this.absorbQuery(
      out,
      `SELECT qo.image_url
       FROM question_options qo
       JOIN questions qu ON qu.id = qo.question_id
       JOIN rounds ro ON ro.id = qu.round_id
       WHERE ro.quiz_revision_id = ?`,
      [revisionId],
    );
    return out;
  }

  /**
   * Drops old revisions of a quiz that no session/run/answer still points at.
   * Returns upload URLs that lived only in those dropped revisions.
   */
  async dropUnusedRevisions(quizId: string, keepRevisionId: string): Promise<Set<string>> {
    const rows = (await this.dataSource.query(
      `SELECT id FROM quiz_revisions WHERE quiz_id = ? AND id != ?`,
      [quizId, keepRevisionId],
    )) as { id: string }[];
    const dropped = new Set<string>();
    for (const row of rows) {
      const id = String(row.id || '');
      if (!id) continue;
      if (await this.revisionIsReferenced(id)) continue;
      const urls = await this.collectRevisionUploadUrls(id);
      await this.deleteRevisionContent(id);
      for (const url of urls) dropped.add(url);
    }
    return dropped;
  }

  async unlinkIfOrphaned(candidates: Iterable<string>): Promise<void> {
    const unique = new Set<string>();
    for (const url of candidates) {
      if (url) unique.add(url);
    }
    if (unique.size === 0) return;
    const live = await this.collectAllUploadUrls();
    const root = this.uploadsRoot();
    for (const url of unique) {
      if (live.has(url)) continue;
      try {
        await unlinkUploadFile(root, url);
      } catch (e) {
        this.logger.warn(
          { url, err: e instanceof Error ? e.message : String(e) },
          'upload unlink failed',
        );
      }
    }
  }

  private async revisionIsReferenced(revisionId: string): Promise<boolean> {
    const rows = (await this.dataSource.query(
      `SELECT
         (SELECT COUNT(*) FROM game_sessions WHERE quiz_revision_id = ?) +
         (SELECT COUNT(*) FROM quiz_runs WHERE quiz_revision_id = ?) +
         (SELECT COUNT(*) FROM session_answers WHERE quiz_revision_id = ?)
         AS n`,
      [revisionId, revisionId, revisionId],
    )) as { n: number | string }[];
    const n = Number(rows[0]?.n ?? 0);
    return Number.isFinite(n) && n > 0;
  }

  private async deleteRevisionContent(revisionId: string): Promise<void> {
    await this.dataSource.transaction(async (em) => {
      await em.query(
        `DELETE FROM question_answers
         WHERE question_id IN (
           SELECT qu.id FROM questions qu
           JOIN rounds ro ON ro.id = qu.round_id
           WHERE ro.quiz_revision_id = ?
         )`,
        [revisionId],
      );
      await em.query(
        `DELETE FROM question_options
         WHERE question_id IN (
           SELECT qu.id FROM questions qu
           JOIN rounds ro ON ro.id = qu.round_id
           WHERE ro.quiz_revision_id = ?
         )`,
        [revisionId],
      );
      await em.query(
        `DELETE FROM questions
         WHERE round_id IN (SELECT id FROM rounds WHERE quiz_revision_id = ?)`,
        [revisionId],
      );
      await em.query(`DELETE FROM rounds WHERE quiz_revision_id = ?`, [revisionId]);
      await em.query(`DELETE FROM quiz_revisions WHERE id = ?`, [revisionId]);
    });
  }

  private async absorbQuery(out: Set<string>, sql: string, params: unknown[] = []): Promise<void> {
    const rows = (await this.dataSource.query(sql, params)) as Record<string, unknown>[];
    collectUploadUrlsFromUnknown(rows, out);
  }
}
