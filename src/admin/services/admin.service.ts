import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { DomainError } from '../../common/domain-error';
import { parseStageFontFamily, parseStageLayout } from '../../quiz/stage-layout';
import type { StageLayout } from '../../quiz/stage-layout';
import { parseStageTypeStyles } from '../../quiz/stage-type-styles';
import { hideRectsFromMeta } from '../../quiz/image-hide-rect';
import { QuestionType, TextGradingMode } from '../../common/enums';
import { GameSession } from '../../entities/game-session.entity';
import { Question } from '../../entities/question.entity';
import { QuestionAnswer } from '../../entities/question-answer.entity';
import { QuestionOption } from '../../entities/question-option.entity';
import { Quiz } from '../../entities/quiz.entity';
import { QuizRevision } from '../../entities/quiz-revision.entity';
import { Round } from '../../entities/round.entity';
import { User } from '../../entities/user.entity';
import { QuizService } from '../../quiz/quiz.service';
import { UploadCleanupService } from '../../quiz-pack/upload-cleanup.service';
import { collectUploadUrlsFromUnknown } from '../../quiz-pack/upload-refs';
import {
  bettingOptionsPayload,
  bettingOptionsToMeta,
  parseBettingOptions,
} from '../../domain/policies/betting-options';
import { quizIntroPresentation } from '../../quiz/quiz-intro';

const BUILDER_QUESTION_TYPES = ['single', 'multiple', 'text', 'matching', 'hidden'] as const;
type BuilderQuestionType = (typeof BUILDER_QUESTION_TYPES)[number];
type DefaultPointsByType = Record<BuilderQuestionType, number>;

function parseDefaultPointsByType(raw: unknown, fallback = 1): DefaultPointsByType {
  const baseFallback =
    typeof fallback === 'number' && Number.isFinite(fallback) && fallback >= 0
      ? Math.floor(fallback)
      : 1;
  const out: DefaultPointsByType = {
    single: baseFallback,
    multiple: baseFallback,
    text: baseFallback,
    matching: baseFallback,
    hidden: baseFallback,
  };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const rec = raw as Record<string, unknown>;
  for (const type of BUILDER_QUESTION_TYPES) {
    if (rec[type] == null) continue;
    const n = typeof rec[type] === 'number' ? rec[type] : parseInt(String(rec[type]), 10);
    if (Number.isFinite(n) && n >= 0) out[type] = Math.floor(n as number);
  }
  return out;
}

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(Quiz)
    private readonly quizzes: Repository<Quiz>,
    @InjectRepository(QuizRevision)
    private readonly revisions: Repository<QuizRevision>,
    @InjectRepository(Round)
    private readonly rounds: Repository<Round>,
    @InjectRepository(Question)
    private readonly questions: Repository<Question>,
    @InjectRepository(QuestionOption)
    private readonly options: Repository<QuestionOption>,
    @InjectRepository(QuestionAnswer)
    private readonly answers: Repository<QuestionAnswer>,
    @InjectRepository(GameSession)
    private readonly gameSessions: Repository<GameSession>,
    private readonly quizSvc: QuizService,
    private readonly uploads: UploadCleanupService,
  ) {}

  async createUser(input: { email?: string; displayName?: string | null }): Promise<User> {
    const email =
      input.email?.trim() ||
      `demo+${randomUUID().slice(0, 8)}@example.local`;
    const u = this.users.create({
      email,
      displayName: input.displayName ?? null,
      // MVP: no auth system yet; keep a placeholder hash.
      passwordHash: `dev:${randomUUID()}`,
    });
    return this.users.save(u);
  }

  async createQuiz(input: {
    ownerUserId: string;
    title: string;
    slug?: string | null;
    description?: string | null;
    coverImage?: string | null;
    finalMusic?: string | null;
    fontFamily?: string | null;
    stageTypeStyles?: unknown;
  }): Promise<Quiz> {
    const owner = await this.users.findOne({ where: { id: input.ownerUserId } });
    if (!owner) throw DomainError.notFound('owner user');
    const meta: Record<string, unknown> = {};
    if (input.coverImage != null && String(input.coverImage).trim()) meta.background = input.coverImage.trim();
    if (input.finalMusic != null && String(input.finalMusic).trim()) meta.finalMusic = String(input.finalMusic).trim();
    const ff = parseStageFontFamily(input.fontFamily);
    if (ff) meta.fontFamily = ff;
    const typeStyles = parseStageTypeStyles(input.stageTypeStyles);
    if (typeStyles && Object.keys(typeStyles).length) meta.stageTypeStyles = typeStyles;
    const metaOrNull = Object.keys(meta).length ? meta : null;
    return this.quizSvc.createQuiz(input.ownerUserId, input.title, input.slug, input.description, metaOrNull);
  }

  async updateQuiz(
    quizId: string,
    input: {
      title?: string;
      description?: string | null;
      coverImage?: string | null;
      finalMusic?: string | null;
      fontFamily?: string | null;
      stageTypeStyles?: unknown;
    },
  ): Promise<Quiz> {
    const q = await this.quizzes.findOne({ where: { id: quizId } });
    if (!q) throw DomainError.notFound('quiz');

    const metaPatch: Record<string, unknown> = {};
    if (Object.prototype.hasOwnProperty.call(input, 'coverImage')) {
      if (input.coverImage == null || !String(input.coverImage).trim()) {
        metaPatch.background = null;
      } else {
        metaPatch.background = String(input.coverImage).trim();
      }
    }
    if (Object.prototype.hasOwnProperty.call(input, 'finalMusic')) {
      if (input.finalMusic == null || !String(input.finalMusic).trim()) {
        metaPatch.finalMusic = null;
      } else {
        metaPatch.finalMusic = String(input.finalMusic).trim();
      }
    }
    if (Object.prototype.hasOwnProperty.call(input, 'fontFamily')) {
      metaPatch.fontFamily = parseStageFontFamily(input.fontFamily) ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(input, 'stageTypeStyles')) {
      const parsed = parseStageTypeStyles(input.stageTypeStyles);
      metaPatch.stageTypeStyles = parsed && Object.keys(parsed).length ? parsed : null;
    }
    const hasMeta = Object.keys(metaPatch).length > 0;
    const hasDesc = Object.prototype.hasOwnProperty.call(input, 'description');
    const patch: { title?: string; description?: string | null; meta?: Record<string, unknown> } = {};
    if (input.title != null) patch.title = input.title;
    if (hasDesc) patch.description = input.description ?? null;
    if (hasMeta) patch.meta = metaPatch;
    const prevUploads = collectUploadUrlsFromUnknown(q.meta);
    const saved = await this.quizSvc.updateQuiz(quizId, patch);
    if (hasMeta) {
      const nextUploads = collectUploadUrlsFromUnknown(saved.meta);
      const dropped = [...prevUploads].filter((url) => !nextUploads.has(url));
      await this.uploads.unlinkIfOrphaned(dropped);
    }
    return saved;
  }

  async listQuizzes(ownerUserId?: string | null): Promise<
    {
      id: string;
      title: string;
      description: string | null;
      background: string | null;
      roundsCount: number;
      publishedRevisionId: string | null;
    }[]
  > {
    const where = ownerUserId ? { ownerUserId } : {};
    const list = await this.quizzes.find({
      where,
      order: { updatedAt: 'DESC' },
    });
    const out: {
      id: string;
      title: string;
      description: string | null;
      background: string | null;
      roundsCount: number;
      publishedRevisionId: string | null;
    }[] = [];
    for (const q of list) {
      const latest = await this.revisions.findOne({
        where: { quizId: q.id },
        order: { revisionNo: 'DESC' },
        relations: { rounds: true },
      });
      const roundsCount = latest?.rounds?.length ?? 0;
      const bg = q.meta?.background;
      const published = await this.quizSvc.getPublishedRevision(q.id);
      out.push({
        id: q.id,
        title: q.title,
        description: q.description?.trim() ? q.description.trim() : null,
        background: typeof bg === 'string' ? bg : null,
        roundsCount,
        publishedRevisionId: published?.id ?? null,
      });
    }
    return out;
  }

  async deleteQuiz(quizId: string): Promise<void> {
    const q = await this.quizzes.findOne({ where: { id: quizId } });
    if (!q) throw DomainError.notFound('quiz');
    const uploadUrls = await this.uploads.collectQuizUploadUrls(quizId);
    // Delete in a safe order to satisfy RESTRICT FKs.
    // We prefer explicit deletes over relying on DB cascades (migrations may differ across envs).
    await this.quizzes.manager.transaction(async (em) => {
      // 1) Sessions and all session-scoped tables
      await em.query(
        `DELETE FROM session_answers WHERE session_id IN (SELECT id FROM game_sessions WHERE quiz_id = ?)`,
        [quizId],
      );
      await em.query(
        `DELETE FROM session_round_stakes WHERE session_id IN (SELECT id FROM game_sessions WHERE quiz_id = ?)`,
        [quizId],
      );
      await em.query(
        `DELETE FROM session_question_stakes WHERE session_id IN (SELECT id FROM game_sessions WHERE quiz_id = ?)`,
        [quizId],
      );
      await em.query(
        `DELETE FROM session_dispute_votes WHERE dispute_id IN (
           SELECT id FROM session_disputes WHERE session_id IN (SELECT id FROM game_sessions WHERE quiz_id = ?)
         )`,
        [quizId],
      );
      await em.query(
        `DELETE FROM session_disputes WHERE session_id IN (SELECT id FROM game_sessions WHERE quiz_id = ?)`,
        [quizId],
      );
      await em.query(
        `DELETE FROM session_players WHERE session_id IN (SELECT id FROM game_sessions WHERE quiz_id = ?)`,
        [quizId],
      );
      await em.query(
        `DELETE FROM quiz_runs WHERE session_id IN (SELECT id FROM game_sessions WHERE quiz_id = ?)`,
        [quizId],
      );
      // Safety net: some environments may have quiz_runs that outlive sessions (e.g. partial data / older schema).
      await em.query(`DELETE FROM quiz_runs WHERE quiz_id = ?`, [quizId]);
      await em.query(
        `DELETE FROM quiz_runs
         WHERE quiz_revision_id IN (SELECT id FROM quiz_revisions WHERE quiz_id = ?)`,
        [quizId],
      );
      await em.query(`DELETE FROM game_sessions WHERE quiz_id = ?`, [quizId]);

      // 2) Quiz content (revisions -> rounds -> questions -> options/answers)
      await em.query(
        `DELETE FROM question_answers
         WHERE question_id IN (
           SELECT qu.id
           FROM questions qu
           JOIN rounds ro ON ro.id = qu.round_id
           JOIN quiz_revisions qr ON qr.id = ro.quiz_revision_id
           WHERE qr.quiz_id = ?
         )`,
        [quizId],
      );
      await em.query(
        `DELETE FROM question_options
         WHERE question_id IN (
           SELECT qu.id
           FROM questions qu
           JOIN rounds ro ON ro.id = qu.round_id
           JOIN quiz_revisions qr ON qr.id = ro.quiz_revision_id
           WHERE qr.quiz_id = ?
         )`,
        [quizId],
      );
      await em.query(
        `DELETE FROM questions
         WHERE round_id IN (
           SELECT ro.id
           FROM rounds ro
           JOIN quiz_revisions qr ON qr.id = ro.quiz_revision_id
           WHERE qr.quiz_id = ?
         )`,
        [quizId],
      );
      await em.query(
        `DELETE FROM rounds
         WHERE quiz_revision_id IN (SELECT id FROM quiz_revisions WHERE quiz_id = ?)`,
        [quizId],
      );
      await em.query(`DELETE FROM quiz_revisions WHERE quiz_id = ?`, [quizId]);

      // 3) Root quiz
      await em.query(`DELETE FROM quizzes WHERE id = ?`, [quizId]);
    });
    await this.uploads.unlinkIfOrphaned(uploadUrls);
  }

  async getQuizBuilderPayload(quizId: string): Promise<{
    quizId: string;
    title: string;
    description: string;
    introSec: number;
    background: string | null;
    finalMusic: string | null;
    fontFamily: string | null;
    stageTypeStyles: ReturnType<typeof parseStageTypeStyles>;
    rounds: {
      title: string;
      description: string;
      background: string | null;
      music: string;
      leaderboardMusic: string;
        questions: {
        text: string;
        type: 'single' | 'multiple' | 'text' | 'matching';
        timer: number;
        points: number;
        readSec?: number;
        media: { image: string | null; video: string; audio: string };
        explanation: { text: string; image: string | null };
        music: string;
        musicCarry: number;
        options: { id: string; label: string; imageUrl: string | null }[];
        correct: string[];
        matchLeft?: { id: string; label: string; imageUrl: string | null }[];
        matchRight?: { id: string; label: string; imageUrl: string | null }[];
        matchCorrect?: number[];
        /** `all_or_nothing` | `per_match` — только для matching */
        matchScoringMode?: string;
        imageHideRect?: { x: number; y: number; w: number; h: number };
        imageHideRects?: { x: number; y: number; w: number; h: number }[];
      }[];
    }[];
  }> {
    const quiz = await this.quizzes.findOne({ where: { id: quizId } });
    if (!quiz) throw DomainError.notFound('quiz');

    const rev = await this.revisions.findOne({
      where: { quizId },
      order: { revisionNo: 'DESC' },
      relations: {
        rounds: {
          questions: {
            options: true,
            answers: true,
          },
        },
      },
    });
    if (!rev) throw DomainError.notFound('quiz_revision');

    const sortPos = <T extends { position: number }>(a: T, b: T) => a.position - b.position;

    const mapQuestionType = (t: QuestionType): 'single' | 'multiple' | 'text' | 'matching' => {
      if (t === QuestionType.MultipleChoice) return 'multiple';
      if (t === QuestionType.TextInput) return 'text';
      if (t === QuestionType.Matching) return 'matching';
      return 'single';
    };

    const metaBg = quiz.meta?.background;
    const metaFinalMusic = (quiz.meta as { finalMusic?: unknown } | null | undefined)?.finalMusic;
    const metaFontFamily = (quiz.meta as { fontFamily?: unknown } | null | undefined)?.fontFamily;
    const metaTypeStyles = (quiz.meta as { stageTypeStyles?: unknown } | null | undefined)?.stageTypeStyles;
    const metaStageLayout = parseStageLayout((quiz.meta as { stageLayout?: unknown } | null | undefined)?.stageLayout);
    const rounds = [...(rev.rounds ?? [])].sort(sortPos).map((round) => {
      const rmeta = round.meta ?? {};
      const introSecRaw = (rmeta as { introSec?: unknown }).introSec;
      const introSecNum = typeof introSecRaw === 'number' ? introSecRaw : parseInt(String(introSecRaw ?? ''), 10);
      const introSec = Number.isFinite(introSecNum) && introSecNum > 0 ? Math.floor(introSecNum) : 6;

      const summarySecRaw = (rmeta as { summarySec?: unknown }).summarySec;
      const summarySecNum = typeof summarySecRaw === 'number' ? summarySecRaw : parseInt(String(summarySecRaw ?? ''), 10);
      const summarySec = Number.isFinite(summarySecNum) && summarySecNum > 0 ? Math.floor(summarySecNum) : 2;

      const lbSecRaw = (rmeta as { leaderboardSec?: unknown }).leaderboardSec;
      const lbSecNum = typeof lbSecRaw === 'number' ? lbSecRaw : parseInt(String(lbSecRaw ?? ''), 10);
      const leaderboardSec = Number.isFinite(lbSecNum) && lbSecNum > 0 ? Math.floor(lbSecNum) : 6;
      const defaultTimerRaw = (rmeta as { defaultTimerSec?: unknown }).defaultTimerSec;
      const defaultTimerNum =
        typeof defaultTimerRaw === 'number' ? defaultTimerRaw : parseInt(String(defaultTimerRaw ?? ''), 10);
      const defaultTimer = Number.isFinite(defaultTimerNum) && defaultTimerNum > 0 ? Math.floor(defaultTimerNum) : 15;
      const defaultReadRaw = (rmeta as { defaultReadSec?: unknown }).defaultReadSec;
      const defaultReadNum =
        typeof defaultReadRaw === 'number' ? defaultReadRaw : parseInt(String(defaultReadRaw ?? ''), 10);
      const defaultReadSec = Number.isFinite(defaultReadNum) && defaultReadNum > 0 ? Math.floor(defaultReadNum) : 3;
      const defaultPointsRaw = (rmeta as { defaultPoints?: unknown }).defaultPoints;
      const defaultPointsNum =
        typeof defaultPointsRaw === 'number' ? defaultPointsRaw : parseInt(String(defaultPointsRaw ?? ''), 10);
      const defaultPoints =
        Number.isFinite(defaultPointsNum) && defaultPointsNum >= 0 ? Math.floor(defaultPointsNum) : 1;
      const defaultPointsByType = parseDefaultPointsByType(
        (rmeta as { defaultPointsByType?: unknown }).defaultPointsByType,
        defaultPoints,
      );
      const rMusicRaw = (rmeta as { musicUrl?: unknown }).musicUrl;
      const rMusic = typeof rMusicRaw === 'string' ? rMusicRaw.trim() : '';
      const rLbMusicRaw = (rmeta as { leaderboardMusicUrl?: unknown }).leaderboardMusicUrl;
      const rLbMusic = typeof rLbMusicRaw === 'string' ? rLbMusicRaw.trim() : '';
      const roundStageLayout = parseStageLayout((rmeta as { stageLayout?: unknown }).stageLayout);
      return {
        id: round.id,
        title: round.title,
        description: typeof rmeta.description === 'string' ? rmeta.description : '',
        background: typeof rmeta.background === 'string' ? rmeta.background : null,
        answerRevealMode: (round.answerRevealMode as any) || 'per_question',
        bettingEnabled: !!round.bettingEnabled,
        bettingMaxFraction: round.bettingMaxFraction ?? null,
        ...bettingOptionsPayload(parseBettingOptions(rmeta, round.bettingMaxFraction ?? null)),
        introSec,
        summarySec,
        leaderboardSec,
        defaultTimerSec: defaultTimer,
        defaultReadSec,
        defaultPoints,
        defaultPointsByType,
        music: rMusic,
        leaderboardMusic: rLbMusic,
        ...(roundStageLayout ? { stageLayout: roundStageLayout } : {}),
        questions: [...(round.questions ?? [])].sort(sortPos).map((question) => {
          const qmeta = question.meta ?? {};
          const readSecRaw = qmeta.readSec;
          const readSec =
            typeof readSecRaw === 'number' && readSecRaw > 0
              ? Math.floor(readSecRaw)
              : typeof readSecRaw === 'string' && Number(readSecRaw) > 0
                ? Math.floor(Number(readSecRaw))
                : undefined;
          const correct: string[] = [];
          if (question.type === QuestionType.TextInput) {
            for (const a of question.answers ?? []) {
              if (a.correctText) correct.push(a.correctText);
            }
          } else if (question.type !== QuestionType.Matching) {
            for (const a of question.answers ?? []) {
              if (a.optionId) correct.push(a.optionId);
            }
          }
          const mm = (qmeta as { match?: Record<string, unknown> }).match;
          const inheritTimer = (qmeta as { inheritTimer?: unknown }).inheritTimer === true;
          const inheritReadSec = (qmeta as { inheritReadSec?: unknown }).inheritReadSec === true;
          const inheritPoints = (qmeta as { inheritPoints?: unknown }).inheritPoints === true;
          const stageLayout = parseStageLayout((qmeta as { stageLayout?: unknown }).stageLayout);
          const imageHideRects = hideRectsFromMeta(qmeta as { imageHideRects?: unknown; imageHideRect?: unknown });
          const baseOut = {
            id: question.id,
            text: question.prompt,
            type: mapQuestionType(question.type),
            timer: question.timeLimitSec,
            points: question.basePoints,
            readSec,
            inheritTimer,
            inheritReadSec: inheritReadSec || (readSec === undefined && (qmeta as { inheritReadSec?: unknown }).inheritReadSec !== false),
            inheritPoints,
            media: {
              image: question.imageUrl,
              video: question.videoUrl ?? '',
              audio: question.audioUrl ?? '',
            },
            explanation: {
              text: question.explanationText ?? '',
              image: question.explanationImageUrl ?? null,
              video: question.explanationVideoUrl ?? '',
            },
            music: typeof (qmeta as { musicUrl?: unknown }).musicUrl === 'string' ? String((qmeta as any).musicUrl).trim() : '',
            musicCarry: (() => {
              const raw = (qmeta as { musicCarry?: unknown }).musicCarry;
              const n = typeof raw === 'number' ? raw : parseInt(String(raw ?? ''), 10);
              return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
            })(),
            options: [...(question.options ?? [])].sort(sortPos).map((o) => ({
              id: o.id,
              label: o.label ?? '',
              imageUrl: o.imageUrl,
            })),
            correct,
            ...(stageLayout ? { stageLayout } : {}),
            ...(imageHideRects ? { imageHideRects, imageHideRect: imageHideRects[0] } : {}),
            ...(qmeta.bettingEnabled === true
              ? {
                  bettingEnabled: true,
                  bettingMaxFraction:
                    typeof (qmeta as { bettingMaxFraction?: unknown }).bettingMaxFraction === 'string'
                      ? String((qmeta as { bettingMaxFraction?: unknown }).bettingMaxFraction).trim() || null
                      : null,
                  ...bettingOptionsPayload(parseBettingOptions(qmeta)),
                }
              : {}),
          };
          if (question.type === QuestionType.Matching && mm && typeof mm === 'object') {
            const L = Array.isArray(mm.left) ? mm.left : [];
            const R = Array.isArray(mm.right) ? mm.right : [];
            const cRaw = mm.correct;
            const matchCorrect: number[] = [];
            if (Array.isArray(cRaw)) {
              for (const x of cRaw) {
                const n = typeof x === 'number' ? x : parseInt(String(x), 10);
                if (Number.isFinite(n) && Number.isInteger(n)) matchCorrect.push(n);
              }
            }
            const scoringRaw = (mm as { scoringMode?: unknown }).scoringMode;
            const matchScoringMode =
              scoringRaw === 'per_match' ? 'per_match' : 'all_or_nothing';
            return {
              ...baseOut,
              type: 'matching' as const,
              options: [],
              correct: [],
              matchScoringMode,
              matchLeft: L.map((row: any) => ({
                id: String(row?.id || ''),
                label: row?.label != null ? String(row.label) : '',
                imageUrl: row?.imageUrl != null ? String(row.imageUrl) : null,
              })).filter((x: { id: string }) => x.id),
              matchRight: R.map((row: any) => ({
                id: String(row?.id || ''),
                label: row?.label != null ? String(row.label) : '',
                imageUrl: row?.imageUrl != null ? String(row.imageUrl) : null,
              })).filter((x: { id: string }) => x.id),
              matchCorrect,
            };
          }
          return baseOut;
        }),
      };
    });

    return {
      quizId: quiz.id,
      title: quiz.title,
      description: quiz.description?.trim() ? quiz.description.trim() : '',
      introSec: quizIntroPresentation(quiz).introSec,
      background: typeof metaBg === 'string' ? metaBg : null,
      finalMusic: typeof metaFinalMusic === 'string' && metaFinalMusic.trim() ? metaFinalMusic.trim() : null,
      fontFamily: parseStageFontFamily(metaFontFamily) ?? null,
      stageTypeStyles: parseStageTypeStyles(metaTypeStyles),
      ...(metaStageLayout ? { stageLayout: metaStageLayout } : {}),
      rounds,
    };
  }

  async createDraftRevision(quizId: string): Promise<QuizRevision> {
    const q = await this.quizzes.findOne({ where: { id: quizId } });
    if (!q) throw DomainError.notFound('quiz');
    return this.quizSvc.createDraftRevision(quizId);
  }

  async publishRevision(quizRevisionId: string): Promise<void> {
    await this.quizSvc.publishRevision(quizRevisionId);
    const rev = await this.revisions.findOne({ where: { id: quizRevisionId } });
    if (!rev) return;
    const dropped = await this.uploads.dropUnusedRevisions(rev.quizId, quizRevisionId);
    await this.uploads.unlinkIfOrphaned(dropped);
  }

  async createRound(input: {
    quizRevisionId: string;
    position: number;
    title: string;
    meta?: Record<string, unknown>;
    answerRevealMode?: 'per_question' | 'end_of_round';
    showLeaderboardAfter?: boolean;
    bettingEnabled?: boolean;
    bettingMaxFraction?: string | null;
  }): Promise<Round> {
    const rev = await this.revisions.findOne({ where: { id: input.quizRevisionId } });
    if (!rev) throw DomainError.notFound('quiz_revision');
    return this.quizSvc.saveRound({
      quizRevisionId: input.quizRevisionId,
      position: input.position,
      title: input.title,
      answerRevealMode: (input.answerRevealMode as any) ?? undefined,
      showLeaderboardAfter: input.showLeaderboardAfter ?? false,
      bettingEnabled: input.bettingEnabled ?? false,
      bettingMaxFraction: input.bettingMaxFraction ?? null,
      meta: input.meta && Object.keys(input.meta).length > 0 ? input.meta : {},
    });
  }

  async createQuestion(input: {
    roundId: string;
    position: number;
    type: QuestionType;
    prompt: string;
    timeLimitSec: number;
    basePoints: number;
    imageUrl?: string | null;
    audioUrl?: string | null;
    videoUrl?: string | null;
    explanationText?: string | null;
    explanationImageUrl?: string | null;
    explanationVideoUrl?: string | null;
    meta?: Record<string, unknown>;
    textGradingMode?: string | null;
  }): Promise<Question> {
    const r = await this.rounds.findOne({ where: { id: input.roundId } });
    if (!r) throw DomainError.notFound('round');
    const isText = input.type === QuestionType.TextInput;
    return this.quizSvc.saveQuestion({
      roundId: input.roundId,
      position: input.position,
      type: input.type,
      prompt: input.prompt,
      imageUrl: input.imageUrl?.trim() ? input.imageUrl.trim() : null,
      audioUrl: input.audioUrl?.trim() ? input.audioUrl.trim() : null,
      videoUrl: input.videoUrl?.trim() ? input.videoUrl.trim() : null,
      explanationText: input.explanationText?.trim() ? input.explanationText.trim() : null,
      explanationImageUrl: input.explanationImageUrl?.trim() ? input.explanationImageUrl.trim() : null,
      explanationVideoUrl: input.explanationVideoUrl?.trim() ? input.explanationVideoUrl.trim() : null,
      timeLimitSec: input.timeLimitSec,
      basePoints: input.basePoints,
      textGradingMode: isText ? TextGradingMode.Normalized : null,
      meta: input.meta && Object.keys(input.meta).length > 0 ? input.meta : {},
    });
  }

  async createOption(input: {
    questionId: string;
    position: number;
    label?: string | null;
    imageUrl?: string | null;
  }): Promise<QuestionOption> {
    const q = await this.questions.findOne({ where: { id: input.questionId } });
    if (!q) throw DomainError.notFound('question');
    const label = input.label?.trim() ? input.label.trim() : null;
    const imageUrl = input.imageUrl?.trim() ? input.imageUrl.trim() : null;
    if (!label && !imageUrl) {
      throw DomainError.validation('у варианта должен быть текст (label) или imageUrl');
    }
    return this.quizSvc.saveOption({
      questionId: input.questionId,
      position: input.position,
      label,
      imageUrl,
    });
  }

  async setCorrectOption(input: { questionId: string; optionId: string }): Promise<QuestionAnswer> {
    const q = await this.questions.findOne({ where: { id: input.questionId } });
    if (!q) throw DomainError.notFound('question');
    const opt = await this.options.findOne({ where: { id: input.optionId, questionId: input.questionId } });
    if (!opt) throw DomainError.notFound('question_option');

    // MVP: for choice questions store correct option via QuestionAnswer row.
    return this.quizSvc.saveAnswerRow({
      questionId: input.questionId,
      optionId: input.optionId,
      correctText: null,
      isCaseSensitive: false,
    });
  }

  async setCorrectText(input: {
    questionId: string;
    correctText: string;
    isCaseSensitive?: boolean;
  }): Promise<QuestionAnswer> {
    const q = await this.questions.findOne({ where: { id: input.questionId } });
    if (!q) throw DomainError.notFound('question');
    return this.quizSvc.saveAnswerRow({
      questionId: input.questionId,
      optionId: null,
      correctText: input.correctText,
      isCaseSensitive: input.isCaseSensitive ?? false,
    });
  }

  async assertQuizOwned(quizId: string, userId: string): Promise<Quiz> {
    const q = await this.quizzes.findOne({ where: { id: quizId } });
    if (!q) throw DomainError.notFound('quiz');
    if (q.ownerUserId !== userId) throw DomainError.forbidden('quiz not owned by current user');
    return q;
  }

  async assertRevisionOwned(revisionId: string, userId: string): Promise<void> {
    const rev = await this.revisions.findOne({ where: { id: revisionId }, relations: { quiz: true } });
    if (!rev) throw DomainError.notFound('quiz_revision');
    if (rev.quiz.ownerUserId !== userId) throw DomainError.forbidden('revision not owned by current user');
  }

  async assertRoundOwned(roundId: string, userId: string): Promise<void> {
    const r = await this.rounds.findOne({
      where: { id: roundId },
      relations: { quizRevision: { quiz: true } },
    });
    if (!r) throw DomainError.notFound('round');
    if (r.quizRevision.quiz.ownerUserId !== userId) {
      throw DomainError.forbidden('round not owned by current user');
    }
  }

  async assertQuestionOwned(questionId: string, userId: string): Promise<void> {
    const q = await this.questions.findOne({
      where: { id: questionId },
      relations: { round: { quizRevision: { quiz: true } } },
    });
    if (!q) throw DomainError.notFound('question');
    if (q.round.quizRevision.quiz.ownerUserId !== userId) {
      throw DomainError.forbidden('question not owned by current user');
    }
  }

  async patchQuestionStageLayout(
    questionId: string,
    userId: string,
    raw: Record<string, unknown> | null,
  ): Promise<StageLayout | null> {
    await this.assertQuestionOwned(questionId, userId);
    const q = await this.questions.findOne({ where: { id: questionId } });
    if (!q) throw DomainError.notFound('question');
    const meta: Record<string, unknown> = { ...(q.meta || {}) };
    if (raw === null) {
      delete meta.stageLayout;
      q.meta = meta;
      await this.questions.save(q);
      return null;
    }
    const parsed = parseStageLayout(raw);
    if (!parsed) throw DomainError.validation('invalid stageLayout');
    meta.stageLayout = parsed;
    q.meta = meta;
    await this.questions.save(q);
    return parsed;
  }

  async patchQuizStageLayout(
    quizId: string,
    userId: string,
    raw: Record<string, unknown> | null,
  ): Promise<StageLayout | null> {
    await this.assertQuizOwned(quizId, userId);
    const q = await this.quizzes.findOne({ where: { id: quizId } });
    if (!q) throw DomainError.notFound('quiz');
    const meta: Record<string, unknown> = { ...(q.meta || {}) };
    if (raw === null) {
      delete meta.stageLayout;
      q.meta = meta;
      await this.quizzes.save(q);
      return null;
    }
    const parsed = parseStageLayout(raw);
    if (!parsed) throw DomainError.validation('invalid stageLayout');
    meta.stageLayout = parsed;
    q.meta = meta;
    await this.quizzes.save(q);
    return parsed;
  }

  async patchRoundStageLayout(
    roundId: string,
    userId: string,
    raw: Record<string, unknown> | null,
  ): Promise<StageLayout | null> {
    await this.assertRoundOwned(roundId, userId);
    const r = await this.rounds.findOne({ where: { id: roundId } });
    if (!r) throw DomainError.notFound('round');
    const meta: Record<string, unknown> = { ...(r.meta || {}) };
    if (raw === null) {
      delete meta.stageLayout;
      r.meta = meta;
      await this.rounds.save(r);
      return null;
    }
    const parsed = parseStageLayout(raw);
    if (!parsed) throw DomainError.validation('invalid stageLayout');
    meta.stageLayout = parsed;
    r.meta = meta;
    await this.rounds.save(r);
    return parsed;
  }

  async listQuizzesForBrowse(): Promise<
    {
      id: string;
      title: string;
      description: string | null;
      background: string | null;
      roundsCount: number;
      ownerUserId: string;
      ownerLabel: string;
      publishedRevisionId: string | null;
    }[]
  > {
    const list = await this.quizzes.find({
      relations: { owner: true },
      order: { updatedAt: 'DESC' },
    });
    const out: {
      id: string;
      title: string;
      description: string | null;
      background: string | null;
      roundsCount: number;
      ownerUserId: string;
      ownerLabel: string;
      publishedRevisionId: string | null;
    }[] = [];
    for (const q of list) {
      const latest = await this.revisions.findOne({
        where: { quizId: q.id },
        order: { revisionNo: 'DESC' },
        relations: { rounds: true },
      });
      const roundsCount = latest?.rounds?.length ?? 0;
      const bg = q.meta?.background;
      const owner = q.owner;
      const published = await this.quizSvc.getPublishedRevision(q.id);
      out.push({
        id: q.id,
        title: q.title,
        description: q.description?.trim() ? q.description.trim() : null,
        background: typeof bg === 'string' ? bg : null,
        roundsCount,
        ownerUserId: q.ownerUserId,
        ownerLabel: (owner?.displayName || owner?.email || '—').trim(),
        publishedRevisionId: published?.id ?? null,
      });
    }
    return out;
  }

  async cloneQuiz(sourceQuizId: string, newOwnerUserId: string): Promise<{ quizId: string }> {
    const source = await this.quizzes.findOne({ where: { id: sourceQuizId } });
    if (!source) throw DomainError.notFound('quiz');
    const payload = await this.getQuizBuilderPayload(sourceQuizId);
    let title = `Копия: ${payload.title}`.trim();
    if (title.length > 255) title = `${title.slice(0, 252)}…`;
    return this.createQuizFromBuilderPayload(newOwnerUserId, { ...payload, title });
  }

  async createQuizFromBuilderPayload(
    ownerUserId: string,
    payload: {
      title: string;
      description?: string;
      background?: string | null;
      finalMusic?: string | null;
      fontFamily?: string | null;
      stageTypeStyles?: unknown;
      stageLayout?: unknown;
      rounds: Parameters<AdminService['applyBuilderRoundsToRevision']>[1];
    },
  ): Promise<{ quizId: string }> {
    let title = (payload.title || '').trim() || 'Импортированный квиз';
    if (title.length > 255) title = `${title.slice(0, 252)}…`;
    const newQuiz = await this.createQuiz({
      ownerUserId,
      title,
      description: payload.description?.trim() ? payload.description.trim() : null,
      coverImage: payload.background?.trim() ? payload.background.trim() : null,
      finalMusic: payload.finalMusic?.trim() ? payload.finalMusic.trim() : null,
      fontFamily: payload.fontFamily?.trim() ? payload.fontFamily.trim() : null,
      stageTypeStyles: payload.stageTypeStyles,
    });
    const quizSl = parseStageLayout(payload.stageLayout);
    if (quizSl) {
      await this.patchQuizStageLayout(newQuiz.id, ownerUserId, quizSl as unknown as Record<string, unknown>);
    }
    const rev = await this.createDraftRevision(newQuiz.id);
    await this.applyBuilderRoundsToRevision(rev.id, payload.rounds || []);
    await this.publishRevision(rev.id);
    return { quizId: newQuiz.id };
  }

  private mapPayloadQuestionType(t: 'single' | 'multiple' | 'text' | 'matching'): QuestionType {
    if (t === 'multiple') return QuestionType.MultipleChoice;
    if (t === 'text') return QuestionType.TextInput;
    if (t === 'matching') return QuestionType.Matching;
    return QuestionType.SingleChoice;
  }

  private optionPayloadFilled(o: { label: string; imageUrl: string | null }): boolean {
    return !!(o.label?.trim() || (o.imageUrl && String(o.imageUrl).trim()));
  }

  private questionMetaFromPayload(q: {
    readSec?: number;
    inheritTimer?: boolean;
    inheritReadSec?: boolean;
    inheritPoints?: boolean;
    music?: string;
    musicCarry?: number;
    stageLayout?: unknown;
    imageHideRect?: unknown;
    imageHideRects?: unknown;
  }): Record<string, unknown> {
    const meta: Record<string, unknown> = {};
    if (q.music?.trim()) meta.musicUrl = q.music.trim();
    const carry = Number(q.musicCarry);
    if (Number.isFinite(carry) && carry > 0) meta.musicCarry = Math.floor(carry);
    if (q.inheritTimer === true) meta.inheritTimer = true;
    if (q.inheritReadSec === true) meta.inheritReadSec = true;
    if (q.inheritPoints === true) meta.inheritPoints = true;
    if (typeof q.readSec === 'number' && q.readSec > 0) meta.readSec = Math.floor(q.readSec);
    const sl = parseStageLayout(q.stageLayout);
    if (sl) meta.stageLayout = sl;
    const hide = hideRectsFromMeta(q);
    if (hide) {
      meta.imageHideRects = hide;
      meta.imageHideRect = hide[0];
    }
    return meta;
  }

  async applyBuilderRoundsToRevision(
    revisionId: string,
    rounds: Array<{
      title: string;
      description: string;
      background: string | null;
      answerRevealMode?: string;
      introSec?: number;
      summarySec?: number;
      leaderboardSec?: number;
      defaultTimerSec?: number;
      defaultReadSec?: number;
      defaultPoints?: number;
      defaultPointsByType?: unknown;
      music?: string;
      leaderboardMusic?: string;
      stageLayout?: unknown;
      bettingEnabled?: boolean;
      bettingMode?: string;
      bettingMinStake?: number | null;
      bettingMaxStake?: number | null;
      bettingPresets?: number[];
      bettingSec?: number | null;
      bettingMaxFraction?: string | null;
      questions: Array<{
        text: string;
        type: 'single' | 'multiple' | 'text' | 'matching';
        timer: number;
        points?: number;
        readSec?: number;
        inheritTimer?: boolean;
        inheritReadSec?: boolean;
        inheritPoints?: boolean;
        media: { image: string | null; video: string; audio: string };
        explanation?: { text: string; image: string | null; video?: string };
        music?: string;
        musicCarry?: number;
        stageLayout?: unknown;
        options: { id: string; label: string; imageUrl: string | null }[];
        correct: string[];
        matchLeft?: { id: string; label: string; imageUrl: string | null }[];
        matchRight?: { id: string; label: string; imageUrl: string | null }[];
        matchCorrect?: number[];
        matchScoringMode?: string;
        imageHideRect?: unknown;
        imageHideRects?: unknown;
        bettingEnabled?: boolean;
        bettingMode?: string;
        bettingMinStake?: number | null;
        bettingMaxStake?: number | null;
        bettingPresets?: number[];
        bettingSec?: number | null;
        bettingMaxFraction?: string | null;
      }>;
    }>,
  ): Promise<void> {
    for (let ri = 0; ri < rounds.length; ri++) {
      const r = rounds[ri];
      const meta: Record<string, unknown> = {};
      if (r.description?.trim()) meta.description = r.description.trim();
      if (r.background) meta.background = r.background;
      if (typeof r.introSec === 'number' && r.introSec > 0) meta.introSec = Math.floor(r.introSec);
      if (typeof r.summarySec === 'number' && r.summarySec > 0) meta.summarySec = Math.floor(r.summarySec);
      if (typeof r.leaderboardSec === 'number' && r.leaderboardSec > 0) {
        meta.leaderboardSec = Math.floor(r.leaderboardSec);
      }
      if (typeof r.defaultTimerSec === 'number' && r.defaultTimerSec > 0) {
        meta.defaultTimerSec = Math.floor(r.defaultTimerSec);
      }
      if (typeof r.defaultReadSec === 'number' && r.defaultReadSec > 0) {
        meta.defaultReadSec = Math.floor(r.defaultReadSec);
      }
      if (typeof r.defaultPoints === 'number' && r.defaultPoints >= 0) {
        meta.defaultPoints = Math.floor(r.defaultPoints);
      }
      const pointsByType = parseDefaultPointsByType(
        (r as { defaultPointsByType?: unknown }).defaultPointsByType,
        typeof r.defaultPoints === 'number' && r.defaultPoints >= 0 ? Math.floor(r.defaultPoints) : 1,
      );
      meta.defaultPointsByType = pointsByType;
      if (r.music?.trim()) meta.musicUrl = r.music.trim();
      if (r.leaderboardMusic?.trim()) meta.leaderboardMusicUrl = r.leaderboardMusic.trim();
      const roundSl = parseStageLayout((r as { stageLayout?: unknown }).stageLayout);
      if (roundSl) meta.stageLayout = roundSl;
      const roundBetting = r.bettingEnabled === true;
      if (roundBetting) {
        Object.assign(meta, bettingOptionsToMeta(parseBettingOptions(r, r.bettingMaxFraction ?? null)));
      }
      const reveal = r.answerRevealMode === 'end_of_round' ? 'end_of_round' : 'per_question';
      const round = await this.createRound({
        quizRevisionId: revisionId,
        position: ri + 1,
        title: r.title?.trim() || `Раунд ${ri + 1}`,
        answerRevealMode: reveal,
        bettingEnabled: roundBetting,
        bettingMaxFraction: roundBetting ? (r.bettingMaxFraction ?? null) : null,
        meta: Object.keys(meta).length ? meta : undefined,
      });

      for (let qi = 0; qi < r.questions.length; qi++) {
        const q = r.questions[qi];
        const qtype = this.mapPayloadQuestionType(q.type);
        const basePts = Math.max(1, Number.isFinite(Number(q.points)) ? Math.floor(Number(q.points)) : 10);
        const qmeta = this.questionMetaFromPayload(q);
        if (!roundBetting && q.bettingEnabled === true) {
          qmeta.bettingEnabled = true;
          const frac = q.bettingMaxFraction?.trim() ? q.bettingMaxFraction.trim() : null;
          if (frac) qmeta.bettingMaxFraction = frac;
          Object.assign(qmeta, bettingOptionsToMeta(parseBettingOptions(q, frac)));
        }

        if (q.type === 'matching') {
          const left = (q.matchLeft || []).map((row) => ({
            id: String(row.id || '').trim(),
            label: row.label?.trim() ? row.label.trim() : null,
            imageUrl: row.imageUrl?.trim() ? row.imageUrl.trim() : null,
          }));
          const right = (q.matchRight || []).map((row) => ({
            id: String(row.id || '').trim(),
            label: row.label?.trim() ? row.label.trim() : null,
            imageUrl: row.imageUrl?.trim() ? row.imageUrl.trim() : null,
          }));
          const correct = (q.matchCorrect || []).map((n) => Math.floor(Number(n)));
          const scoringMode =
            (q.matchScoringMode || '').trim() === 'per_match' ? 'per_match' : 'all_or_nothing';
          await this.createQuestion({
            roundId: round.id,
            position: qi + 1,
            type: QuestionType.Matching,
            prompt: q.text.trim(),
            timeLimitSec: Math.max(1, q.timer || 15),
            basePoints: basePts,
            imageUrl: q.media?.image || null,
            audioUrl: q.media?.audio?.trim() || null,
            videoUrl: q.media?.video?.trim() || null,
            explanationText: q.explanation?.text ?? null,
            explanationImageUrl: q.explanation?.image ?? null,
            explanationVideoUrl: q.explanation?.video ?? null,
            meta: {
              ...qmeta,
              match: {
                left,
                right,
                correct,
                scoringMode,
              },
            },
          });
          continue;
        }

        const question = await this.createQuestion({
          roundId: round.id,
          position: qi + 1,
          type: qtype,
          prompt: q.text.trim(),
          timeLimitSec: Math.max(1, q.timer || 15),
          basePoints: basePts,
          imageUrl: q.media?.image || null,
          audioUrl: q.media?.audio?.trim() || null,
          videoUrl: q.media?.video?.trim() || null,
          explanationText: q.explanation?.text ?? null,
          explanationImageUrl: q.explanation?.image ?? null,
          explanationVideoUrl: q.explanation?.video ?? null,
          meta: Object.keys(qmeta).length ? qmeta : undefined,
        });

        if (q.type === 'text') {
          for (const line of q.correct || []) {
            const t0 = String(line).trim();
            if (!t0) continue;
            await this.setCorrectText({
              questionId: question.id,
              correctText: t0,
              isCaseSensitive: false,
            });
          }
        } else {
          let pos = 0;
          const idMap = new Map<string, string>();
          for (const opt of q.options || []) {
            if (!this.optionPayloadFilled(opt)) continue;
            pos++;
            const created = await this.createOption({
              questionId: question.id,
              position: pos,
              label: opt.label?.trim() || null,
              imageUrl: opt.imageUrl?.trim() || null,
            });
            idMap.set(opt.id, created.id);
          }
          for (const oldId of q.correct || []) {
            const newId = idMap.get(oldId);
            if (newId) {
              await this.setCorrectOption({ questionId: question.id, optionId: newId });
            }
          }
        }
      }
    }
  }
}

