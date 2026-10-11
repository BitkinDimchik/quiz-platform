import { stripOptionLetterPrefix } from '../format';
import { bettingFromServer } from './betting-settings';
import { defaultRound, emptyUi, normalizeDefaultPointsByType } from './defaults';
import type { BuilderQuestion, QuizDraft } from './types';
import { parseStageLayout } from '../host/stage-layout';
import { parseStageTypeStyles } from '../host/stage-type-styles';
import { hideRectsFromQuestion } from '../host/image-hide-rect';

/** Map GET /api/quizzes/:id payload into builder draft shape. */
export function applyServerPayload(data: Record<string, unknown>): QuizDraft {
  const roundsRaw = (data.rounds as unknown[]) || [];
  const quizSl = parseStageLayout(data.stageLayout);
  const quizDraft: QuizDraft = {
    title: String(data.title || ''),
    description: typeof data.description === 'string' ? data.description : '',
    background: (data.background as string | null) || null,
    finalMusic: (data.finalMusic as string | null) || null,
    fontFamily:
      typeof data.fontFamily === 'string' && data.fontFamily.trim() ? data.fontFamily.trim() : null,
    stageTypeStyles: parseStageTypeStyles(data.stageTypeStyles),
    ...(quizSl ? { stageLayout: quizSl } : {}),
    rounds: roundsRaw.map((raw) => {
      const r = raw as Record<string, unknown>;
      const roundSl = parseStageLayout(r.stageLayout);
      return {
        id: typeof r.id === 'string' && r.id.trim() ? r.id.trim() : undefined,
        title: String(r.title || 'Раунд'),
        description: String(r.description || ''),
        background: (r.background as string | null) || null,
        introSec:
          Number.isFinite(Number(r.introSec)) && Number(r.introSec) > 0
            ? Math.floor(Number(r.introSec))
            : 6,
        summarySec:
          Number.isFinite(Number(r.summarySec)) && Number(r.summarySec) > 0
            ? Math.floor(Number(r.summarySec))
            : 2,
        leaderboardSec:
          Number.isFinite(Number(r.leaderboardSec)) && Number(r.leaderboardSec) > 0
            ? Math.floor(Number(r.leaderboardSec))
            : 6,
        defaultTimer:
          Number.isFinite(Number(r.defaultTimerSec ?? r.defaultTimer)) &&
          Number(r.defaultTimerSec ?? r.defaultTimer) > 0
            ? Math.floor(Number(r.defaultTimerSec ?? r.defaultTimer))
            : 15,
        defaultReadSec:
          Number.isFinite(Number(r.defaultReadSec)) && Number(r.defaultReadSec) > 0
            ? Math.floor(Number(r.defaultReadSec))
            : 3,
        defaultPoints:
          Number.isFinite(Number(r.defaultPoints)) && Number(r.defaultPoints) >= 0
            ? Math.floor(Number(r.defaultPoints))
            : 1,
        defaultPointsByType: normalizeDefaultPointsByType(
          r.defaultPointsByType,
          Number.isFinite(Number(r.defaultPoints)) && Number(r.defaultPoints) >= 0
            ? Math.floor(Number(r.defaultPoints))
            : 1,
        ),
        answerRevealMode: r.answerRevealMode === 'end_of_round' ? 'end_of_round' : 'per_question',
        bettingEnabled: r.bettingEnabled === true,
        ...bettingFromServer(r),
        music: String(r.music || ''),
        leaderboardMusic: String(r.leaderboardMusic || ''),
        ...(roundSl ? { stageLayout: roundSl } : {}),
        questions: ((r.questions as unknown[]) || []).map((qRaw) => {
          const q = qRaw as Record<string, unknown>;
          const typeRaw = q.type;
          const hideRects = hideRectsFromQuestion(q);
          let type: BuilderQuestion['type'] =
            typeRaw === 'multiple' || typeRaw === 'text' || typeRaw === 'single' || typeRaw === 'matching'
              ? typeRaw
              : 'single';
          const out: BuilderQuestion = {
            id: typeof q.id === 'string' && q.id.trim() ? q.id.trim() : undefined,
            text: String(q.text || ''),
            type,
            options:
              type === 'text' || type === 'matching'
                ? []
                : ((q.options as unknown[]) || []).map((oRaw) => {
                    const o = oRaw as Record<string, unknown>;
                    return {
                      id: String(o.id),
                      label: stripOptionLetterPrefix(String(o.label || '')),
                      imageUrl: (o.imageUrl as string | null) ?? null,
                    };
                  }),
            correct: Array.isArray(q.correct) ? [...(q.correct as string[])] : [],
            timer: Number(q.timer) || 15,
            readSec: (() => {
              const v = Number(q.readSec);
              if (Number.isFinite(v) && v > 0) return Math.floor(v);
              return 3;
            })(),
            useRoundTimer: q.inheritTimer === true,
            useRoundReadSec: q.inheritReadSec === true,
            useRoundPoints: q.inheritPoints === true,
            points: (() => {
              const rawPts = q.points != null ? q.points : q.basePoints;
              const n = Number(rawPts);
              return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 1;
            })(),
            media: q.media
              ? {
                  image: ((q.media as { image?: string | null }).image ?? null) as string | null,
                  video: String((q.media as { video?: string }).video || ''),
                  audio: String((q.media as { audio?: string }).audio || ''),
                }
              : { image: null, video: '', audio: '' },
            explanation: (() => {
              const nested = q.explanation as
                | { text?: unknown; image?: unknown; video?: unknown }
                | undefined;
              const textFromNested = nested && typeof nested.text === 'string' ? nested.text : '';
              const imgFromNested =
                nested && typeof nested.image === 'string' && nested.image.trim()
                  ? nested.image.trim()
                  : null;
              const videoFromNested =
                nested && typeof nested.video === 'string' ? String(nested.video) : '';
              const textFromFlat = typeof q.explanationText === 'string' ? q.explanationText : '';
              const imgFromFlat =
                typeof q.explanationImageUrl === 'string' && q.explanationImageUrl.trim()
                  ? q.explanationImageUrl.trim()
                  : null;
              const videoFromFlat =
                typeof q.explanationVideoUrl === 'string' ? String(q.explanationVideoUrl) : '';
              const text = textFromNested || textFromFlat;
              const image = imgFromNested || imgFromFlat;
              const video = videoFromNested || videoFromFlat;
              return { text, image, video };
            })(),
            music: String(q.music || ''),
            musicCarry: (() => {
              const v = Number(q.musicCarry || 0);
              return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
            })(),
            bettingEnabled: q.bettingEnabled === true,
            ...bettingFromServer(q),
          };
          if (type === 'matching') {
            out.matchLeft = Array.isArray(q.matchLeft)
              ? [...(q.matchLeft as NonNullable<BuilderQuestion['matchLeft']>)]
              : undefined;
            out.matchRight = Array.isArray(q.matchRight)
              ? [...(q.matchRight as NonNullable<BuilderQuestion['matchRight']>)]
              : undefined;
            out.matchCorrect = Array.isArray(q.matchCorrect)
              ? [...(q.matchCorrect as number[])]
              : undefined;
            out.matchScoringMode = q.matchScoringMode === 'per_match' ? 'per_match' : 'all_or_nothing';
          }
          const sl = parseStageLayout(q.stageLayout);
          if (sl) out.stageLayout = sl;
          if (hideRects) {
            out.imageHideRects = hideRects;
            out.imageHideRect = hideRects[0];
            out.type = 'hidden';
            out.hiddenAnswer = type === 'text' ? 'text' : 'single';
          }
          return out;
        }),
      };
    }),
  };
  if (!quizDraft.rounds.length) quizDraft.rounds.push(defaultRound());
  return quizDraft;
}

export { emptyUi };
