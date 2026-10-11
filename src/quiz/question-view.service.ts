import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DomainError } from '../common/domain-error';
import { QuestionType } from '../common/enums';
import { Question } from '../entities/question.entity';
import { QuestionAnswer } from '../entities/question-answer.entity';
import { QuestionOption } from '../entities/question-option.entity';
import type { StageFonts, StageLayout } from './stage-layout';
import { parseStageLayout, stageFontsFromLayout } from './stage-layout';
import { hideRectsFromMeta } from './image-hide-rect';
import type { ImageHideRect } from './image-hide-rect';
import { resolveRoundBackground } from './round-background';
import {
  bettingMaxFractionForScope,
  resolveBettingScope,
} from '../domain/policies/betting-scope';
import type { BettingMode } from '../domain/policies/betting-options';
import { bettingPhaseSec } from '../domain/policies/betting-options';
import { quizIntroPresentation } from './quiz-intro';

export type QuestionView = {
  id: string;
  type: QuestionType;
  prompt: string;
  imageUrl: string | null;
  videoUrl: string | null;
  audioUrl: string | null;
  timeLimitSec: number;
  basePoints: number;
  roundTitle: string;
  roundDescription: string;
  quizTitle: string;
  quizDescription: string;
  quizIntroSec: number;
  /** Фон раунда или, если не задан, заставка квиза (URL или data URL). */
  roundBackgroundUrl: string | null;
  /** Музыка раунда из `round.meta.musicUrl` (только для ведущего). */
  roundMusicUrl: string | null;
  /** Музыка итогов раунда из `round.meta.leaderboardMusicUrl` (только для ведущего). */
  roundLeaderboardMusicUrl: string | null;
  roundId: string;
  /** `round` — ставка в intro раунда; `question` — перед этим вопросом. */
  bettingScope: 'round' | 'question' | null;
  /** @deprecated use bettingScope */
  bettingEnabled: boolean;
  /** `free` — игрок вводит сумму сам; `presets` — выбирает из заложенных вариантов. */
  bettingMode: BettingMode;
  /** Минимальная ставка в очках при свободном вводе; 0 — без явного минимума. */
  bettingMinStake: number;
  /** Максимальная ставка в очках; null — только в пределах счёта. */
  bettingMaxStake: number | null;
  /** Заложенные варианты ставки в очках (для mode='presets'). */
  bettingPresets: number[];
  /** @deprecated доля счёта из старых квизов (0–1). null = до 100% счёта. */
  bettingMaxFraction: string | null;
  roundIntroSec: number;
  roundSummarySec: number;
  readTimeSec: number;
  /** Текущий счёт игрока (только для role=player). */
  playerScore?: number;
  /** Ставка игрока (round или question scope); null = ещё не поставил. */
  playerStake?: number | null;
  /** @deprecated use playerStake */
  roundStake?: number | null;
  /** Музыка вопроса из `question.meta.musicUrl` (только для ведущего). */
  questionMusicUrl?: string | null;
  /** Продление музыки вопроса на X следующих вопросов (`question.meta.musicCarry`). */
  questionMusicCarry?: number;
  options: { id: string; position: number; label: string | null; imageUrl: string | null }[];
  /** Установи соответствие — из question.meta.match */
  match?: {
    left: { id: string; label: string | null; imageUrl: string | null }[];
    right: { id: string; label: string | null; imageUrl: string | null }[];
    /** Режим очков (из meta.match.scoringMode), не секрет — нужен клиенту. */
    scoringMode?: 'all_or_nothing' | 'per_match';
    /** 1-based номера правой колонки; только при includeCorrect */
    correct?: number[];
  };
  /** Present only when caller is allowed to see it. */
  correctOptionIds?: string[];
  /** Present only when caller is allowed to see it (text questions). */
  correctTexts?: string[];
  /** Present only when includeCorrect. Always both keys; null if empty. */
  explanationText?: string | null;
  explanationImageUrl?: string | null;
  explanationVideoUrl?: string | null;
  /** Present only for players when they already answered. */
  playerAnswer?: {
    selectedOptionIds: string[];
    textAnswer: string | null;
    isCorrect?: boolean | null;
    matchOrder?: number[] | null;
  };
  /** Шрифты блоков сцены — и хосту, и игроку. */
  stageFonts?: StageFonts;
  /** Host-only. Omitted unless includeStageLayout. */
  stageLayout?: StageLayout;
  /** Host-only quiz intro layout. */
  quizStageLayout?: StageLayout;
  /** Host-only round intro layout. */
  roundStageLayout?: StageLayout;
  /** Host-only overlay on the question image. */
  imageHideRect?: ImageHideRect;
  imageHideRects?: ImageHideRect[];
};

@Injectable()
export class QuestionViewService {
  constructor(
    @InjectRepository(Question)
    private readonly questions: Repository<Question>,
    @InjectRepository(QuestionOption)
    private readonly options: Repository<QuestionOption>,
    @InjectRepository(QuestionAnswer)
    private readonly answers: Repository<QuestionAnswer>,
  ) {}

  async getQuestionView(
    revisionId: string,
    questionId: string,
    opts: { includeCorrect: boolean; includeStageLayout?: boolean },
  ): Promise<QuestionView> {
    const q = await this.questions.findOne({
      where: { id: questionId },
      relations: { round: { quizRevision: { quiz: true } } },
    });
    if (!q || q.round.quizRevisionId !== revisionId) {
      throw DomainError.notFound('question');
    }

    const [options, ansRows] = await Promise.all([
      this.options.find({ where: { questionId }, order: { position: 'ASC' } }),
      opts.includeCorrect ? this.answers.find({ where: { questionId } }) : Promise.resolve([]),
    ]);

    const rmeta = q.round?.meta ?? {};
    const qmeta = q.meta ?? {};
    const desc = typeof rmeta.description === 'string' ? rmeta.description : '';
    const introSecRaw = (rmeta as { introSec?: unknown }).introSec;
    const introSecNum = typeof introSecRaw === 'number' ? introSecRaw : parseInt(String(introSecRaw ?? ''), 10);
    const roundIntroSec = Number.isFinite(introSecNum) && introSecNum > 0 ? introSecNum : 6;
    const summarySecRaw = (rmeta as { summarySec?: unknown }).summarySec;
    const summarySecNum = typeof summarySecRaw === 'number' ? summarySecRaw : parseInt(String(summarySecRaw ?? ''), 10);
    const roundSummarySec = Number.isFinite(summarySecNum) && summarySecNum > 0 ? summarySecNum : 2;
    const defaultReadRaw = (rmeta as { defaultReadSec?: unknown }).defaultReadSec;
    const defaultReadNum =
      typeof defaultReadRaw === 'number' ? defaultReadRaw : parseInt(String(defaultReadRaw ?? ''), 10);
    const roundDefaultReadSec =
      Number.isFinite(defaultReadNum) && defaultReadNum > 0 ? defaultReadNum : 3;
    const readSecRaw = (qmeta as { readSec?: unknown }).readSec;
    const readSecNum = typeof readSecRaw === 'number' ? readSecRaw : parseInt(String(readSecRaw ?? ''), 10);
    const inheritReadSec = (qmeta as { inheritReadSec?: unknown }).inheritReadSec === true;
    const readTimeSec =
      !inheritReadSec && Number.isFinite(readSecNum) && readSecNum > 0 ? readSecNum : roundDefaultReadSec;

    const roundBgRaw = (rmeta as { background?: unknown }).background;
    const quizBgRaw = q.round?.quizRevision?.quiz?.meta?.background;
    const roundBackgroundUrl = resolveRoundBackground(roundBgRaw, quizBgRaw);

    const roundMusicRaw = (rmeta as { musicUrl?: unknown }).musicUrl;
    const roundMusicUrl =
      opts.includeCorrect && typeof roundMusicRaw === 'string' && roundMusicRaw.trim() ? roundMusicRaw.trim() : null;
    const roundLbMusicRaw = (rmeta as { leaderboardMusicUrl?: unknown }).leaderboardMusicUrl;
    const roundLeaderboardMusicUrl =
      opts.includeCorrect && typeof roundLbMusicRaw === 'string' && roundLbMusicRaw.trim() ? roundLbMusicRaw.trim() : null;

    const qMusicRaw = (qmeta as { musicUrl?: unknown }).musicUrl;
    const questionMusicUrl =
      opts.includeCorrect && typeof qMusicRaw === 'string' && qMusicRaw.trim() ? qMusicRaw.trim() : null;
    const carryRaw = (qmeta as { musicCarry?: unknown }).musicCarry;
    const carryNum = typeof carryRaw === 'number' ? carryRaw : parseInt(String(carryRaw ?? ''), 10);
    const questionMusicCarry =
      opts.includeCorrect && Number.isFinite(carryNum) && carryNum > 0 ? Math.floor(carryNum) : 0;

    const bettingScopeResolved = resolveBettingScope(q.round, qmeta, q.id);
    const bettingScope =
      bettingScopeResolved.kind === 'none'
        ? null
        : (bettingScopeResolved.kind as 'round' | 'question');
    const bettingMaxFraction = bettingMaxFractionForScope(bettingScopeResolved);
    const bettingOptions =
      bettingScopeResolved.kind === 'none' ? null : bettingScopeResolved.options;
    // Фаза со ставкой не короче времени, отведённого на ставку.
    const roundIntroSecEffective = bettingPhaseSec(
      roundIntroSec,
      bettingScopeResolved.kind === 'round' ? bettingOptions : null,
    );
    const readTimeSecEffective = bettingPhaseSec(
      readTimeSec,
      bettingScopeResolved.kind === 'question' ? bettingOptions : null,
    );

    const quizIntro = quizIntroPresentation(q.round?.quizRevision?.quiz);
    const view: QuestionView = {
      id: q.id,
      type: q.type,
      prompt: q.prompt,
      imageUrl: q.imageUrl ?? null,
      videoUrl: q.videoUrl ?? null,
      audioUrl: q.audioUrl ?? null,
      timeLimitSec: q.timeLimitSec,
      basePoints: q.basePoints,
      roundTitle: q.round?.title ?? 'Раунд',
      roundDescription: desc,
      quizTitle: quizIntro.title,
      quizDescription: quizIntro.description,
      quizIntroSec: quizIntro.introSec,
      roundId: q.round.id,
      bettingScope,
      bettingEnabled: bettingScope != null,
      bettingMode: bettingOptions?.mode ?? 'free',
      bettingMinStake: bettingOptions?.minStake ?? 0,
      bettingMaxStake: bettingOptions?.maxStake ?? null,
      bettingPresets: bettingOptions?.presets ?? [],
      bettingMaxFraction,
      roundBackgroundUrl,
      roundMusicUrl,
      roundLeaderboardMusicUrl,
      roundIntroSec: roundIntroSecEffective,
      roundSummarySec,
      readTimeSec: readTimeSecEffective,
      questionMusicUrl,
      questionMusicCarry,
      options: options.map((o) => ({
        id: o.id,
        position: o.position,
        label: o.label,
        imageUrl: o.imageUrl ?? null,
      })),
    };

    if (opts.includeCorrect) {
      view.correctOptionIds = ansRows.map((a) => a.optionId).filter((x): x is string => !!x);
      view.correctTexts = ansRows.map((a) => a.correctText).filter((x): x is string => !!x);
      const expText = (q.explanationText || '').trim();
      const expImg = (q.explanationImageUrl || '').trim();
      const expVid = (q.explanationVideoUrl || '').trim();
      view.explanationText = expText ? expText : null;
      view.explanationImageUrl = expImg ? expImg : null;
      view.explanationVideoUrl = expVid ? expVid : null;
    }

    const sl = parseStageLayout((qmeta as { stageLayout?: unknown }).stageLayout);
    const fonts = stageFontsFromLayout(sl);
    if (fonts) view.stageFonts = fonts;
    if (opts.includeStageLayout) {
      if (sl) view.stageLayout = sl;
      const quizMeta = q.round?.quizRevision?.quiz?.meta as { stageLayout?: unknown } | null | undefined;
      const quizSl = parseStageLayout(quizMeta?.stageLayout);
      if (quizSl) view.quizStageLayout = quizSl;
      const roundSl = parseStageLayout((rmeta as { stageLayout?: unknown }).stageLayout);
      if (roundSl) view.roundStageLayout = roundSl;
      const hide = hideRectsFromMeta(qmeta as { imageHideRects?: unknown; imageHideRect?: unknown });
      if (hide) {
        view.imageHideRects = hide;
        view.imageHideRect = hide[0];
      }
    }

    if (q.type === QuestionType.Matching) {
      const mm = (q.meta as { match?: Record<string, unknown> } | null | undefined)?.match;
      if (mm && typeof mm === 'object') {
        const parseSide = (key: 'left' | 'right'): { id: string; label: string | null; imageUrl: string | null }[] => {
          const arr = mm[key];
          if (!Array.isArray(arr)) return [];
          const out: { id: string; label: string | null; imageUrl: string | null }[] = [];
          for (const row of arr) {
            if (!row || typeof row !== 'object') continue;
            const o = row as { id?: unknown; label?: unknown; imageUrl?: unknown };
            const id = typeof o.id === 'string' && o.id.trim() ? o.id.trim() : '';
            if (!id) continue;
            const label = typeof o.label === 'string' ? o.label : o.label != null ? String(o.label) : null;
            const imageUrl =
              typeof o.imageUrl === 'string' && o.imageUrl.trim() ? o.imageUrl.trim() : null;
            out.push({ id, label, imageUrl });
          }
          return out;
        };
        const left = parseSide('left');
        const right = parseSide('right');
        const correctRaw = mm.correct;
        const correct: number[] = [];
        if (opts.includeCorrect && Array.isArray(correctRaw)) {
          for (const x of correctRaw) {
            const n = typeof x === 'number' ? x : parseInt(String(x), 10);
            if (Number.isFinite(n) && Number.isInteger(n)) correct.push(n);
          }
        }
        const scoringMode =
          (mm as { scoringMode?: unknown }).scoringMode === 'per_match' ? 'per_match' : 'all_or_nothing';
        view.match = {
          left,
          right,
          scoringMode,
          // При includeCorrect всегда отдаём массив (даже пустой), чтобы клиент мог отличить «ключ не загрузился» от «0 элементов».
          ...(opts.includeCorrect ? { correct } : {}),
        };
      }
    }

    return view;
  }
}

