import { apiFetch, withAuth } from '../api';
import { getAccessToken } from '../auth';
import { stripOptionLetterPrefix } from '../format';
import {
  ensureMatchingShape,
  ensureIndexes,
  effectiveQuestionPoints,
  effectiveQuestionTimer,
  mapBuilderTypeToApi,
  normalizeDefaultPointsByType,
  optionIsFilled,
  stepDone,
  usesTextAnswers,
} from './defaults';
import type { BuilderUi, QuizDraft } from './types';
import { bettingMetaFields } from './betting-settings';
import { questionCreateBody } from './question-create-body';
import { parseStageLayout, remapStageLayoutOptionIds } from '../host/stage-layout';
import { hideRectsFromQuestion } from '../host/image-hide-rect';

export type SaveQuizResult = { quizId: string };

export async function saveQuizToServer(
  quizDraft: QuizDraft,
  ui: BuilderUi,
  serverQuizId: string | null,
  opts: {
    onNeedLogin: () => void;
  },
): Promise<SaveQuizResult> {
  const draft = structuredClone(quizDraft);
  const nextUi = ensureIndexes(draft, { ...ui });
  void nextUi;
  if (!stepDone(draft, 4)) {
    throw new Error('Заполните все шаги и проверьте вопросы с ответами.');
  }
  if (!getAccessToken()) {
    opts.onNeedLogin();
    throw new Error('unauthorized');
  }

  const h = () => withAuth({ 'Content-Type': 'application/json' });
  let quizId = serverQuizId;

  if (!quizId) {
    const cr = await apiFetch<{ quizId: string }>('/api/quizzes', {
      method: 'POST',
      headers: h(),
      body: JSON.stringify({
        title: draft.title.trim(),
        description: (draft.description || '').trim() || null,
        coverImage: draft.background || undefined,
        finalMusic: (draft.finalMusic || '').trim() || null,
        fontFamily: (draft.fontFamily || '').trim() || null,
        stageTypeStyles: draft.stageTypeStyles ?? null,
      }),
    });
    quizId = cr.quizId;
  } else {
    await apiFetch(`/api/quizzes/${quizId}`, {
      method: 'PATCH',
      headers: h(),
      body: JSON.stringify({
        title: draft.title.trim(),
        description: (draft.description || '').trim() || null,
        coverImage: draft.background,
        finalMusic: (draft.finalMusic || '').trim() || null,
        fontFamily: (draft.fontFamily || '').trim() || null,
        stageTypeStyles: draft.stageTypeStyles ?? null,
      }),
    });
  }

  const quizLayout = parseStageLayout(draft.stageLayout);
  await apiFetch(`/api/quizzes/${quizId}/stage-layout`, {
    method: 'PATCH',
    headers: h(),
    body: JSON.stringify({ stageLayout: quizLayout }),
  });

  const rev = await apiFetch<{ quizRevisionId: string }>('/api/quizzes/revisions/draft', {
    method: 'POST',
    headers: h(),
    body: JSON.stringify({ quizId }),
  });
  const revisionId = rev.quizRevisionId;

  for (let ri = 0; ri < draft.rounds.length; ri++) {
    const r = draft.rounds[ri];
    const meta: Record<string, unknown> = {};
    const d = (r.description || '').trim();
    if (d) meta.description = d;
    const isec = Number(r.introSec || 0);
    if (Number.isFinite(isec) && isec > 0) meta.introSec = Math.floor(isec);
    const ssec = Number(r.summarySec || 0);
    if (Number.isFinite(ssec) && ssec > 0) meta.summarySec = Math.floor(ssec);
    const lsec = Number(r.leaderboardSec || 0);
    if (Number.isFinite(lsec) && lsec > 0) meta.leaderboardSec = Math.floor(lsec);
    const dt = Number(r.defaultTimer || 0);
    if (Number.isFinite(dt) && dt > 0) meta.defaultTimerSec = Math.floor(dt);
    const dr = Number(r.defaultReadSec || 0);
    if (Number.isFinite(dr) && dr > 0) meta.defaultReadSec = Math.floor(dr);
    const dp = Number(r.defaultPoints ?? 0);
    if (Number.isFinite(dp) && dp >= 0) meta.defaultPoints = Math.floor(dp);
    const pointsByType = normalizeDefaultPointsByType(r.defaultPointsByType, r.defaultPoints ?? 1);
    meta.defaultPointsByType = pointsByType;
    if (r.background) meta.background = r.background;
    const rm = (r.music || '').trim();
    if (rm) meta.musicUrl = rm;
    const rlm = (r.leaderboardMusic || '').trim();
    if (rlm) meta.leaderboardMusicUrl = rlm;
    const roundLayout = parseStageLayout(r.stageLayout);
    if (roundLayout) meta.stageLayout = roundLayout;

    const bettingEnabled = r.bettingEnabled === true;
    if (bettingEnabled) Object.assign(meta, bettingMetaFields(r));

    const rr = await apiFetch<{ roundId: string }>('/api/quizzes/rounds', {
      method: 'POST',
      headers: h(),
      body: JSON.stringify({
        quizRevisionId: revisionId,
        position: ri + 1,
        title: (r.title || '').trim() || `Раунд ${ri + 1}`,
        answerRevealMode: r.answerRevealMode || 'per_question',
        bettingEnabled,
        // Старая доля счёта заменена лимитами в очках — чистим её при пересохранении.
        bettingMaxFraction: null,
        meta: Object.keys(meta).length ? meta : undefined,
      }),
    });
    const roundId = rr.roundId;

    for (let qi = 0; qi < r.questions.length; qi++) {
      const q = r.questions[qi];
      const qtype = mapBuilderTypeToApi(q);
      const qmeta: Record<string, unknown> = {};
      const inheritTimer = q.useRoundTimer !== false;
      const inheritReadSec = q.useRoundReadSec !== false;
      const inheritPoints = q.useRoundPoints !== false;
      if (inheritTimer) qmeta.inheritTimer = true;
      if (inheritReadSec) qmeta.inheritReadSec = true;
      if (inheritPoints) qmeta.inheritPoints = true;
      if (!inheritReadSec) {
        const rsec = Number(q.readSec || 0);
        if (Number.isFinite(rsec) && rsec > 0) qmeta.readSec = Math.floor(rsec);
      }
      const qm = (q.music || '').trim();
      if (qm) qmeta.musicUrl = qm;
      const carry = Number(q.musicCarry || 0);
      if (Number.isFinite(carry) && carry > 0) qmeta.musicCarry = Math.floor(carry);
      const hideRects = hideRectsFromQuestion(q);
      if (hideRects) {
        qmeta.imageHideRects = hideRects;
        qmeta.imageHideRect = hideRects[0];
      }
      if (q.bettingEnabled === true && !bettingEnabled) {
        qmeta.bettingEnabled = true;
        Object.assign(qmeta, bettingMetaFields(q));
      }
      if (q.type === 'matching') {
        ensureMatchingShape(q);
        qmeta.match = {
          left: (q.matchLeft || []).map((row) => ({
            id: String(row.id || ''),
            label: (row.label || '').trim() || null,
            imageUrl: (row.imageUrl || '').trim() || null,
          })),
          right: (q.matchRight || []).map((row) => ({
            id: String(row.id || ''),
            label: (row.label || '').trim() || null,
            imageUrl: (row.imageUrl || '').trim() || null,
          })),
          correct: (q.matchCorrect || []).slice(),
          scoringMode: q.matchScoringMode === 'per_match' ? 'per_match' : 'all_or_nothing',
        };
      }

      const optionIdMap: Record<string, string> = {};

      const qr = await apiFetch<{ questionId: string }>('/api/quizzes/questions', {
        method: 'POST',
        headers: h(),
        body: JSON.stringify({
          roundId,
          position: qi + 1,
          type: qtype,
          prompt: (q.text || '').trim(),
          timeLimitSec: effectiveQuestionTimer(r, q),
          basePoints: effectiveQuestionPoints(r, q),
          imageUrl: q.media?.image || null,
          audioUrl: q.media?.audio?.trim() || null,
          videoUrl: q.media?.video?.trim() || null,
          ...questionCreateBody(q),
          meta: Object.keys(qmeta).length ? qmeta : undefined,
        }),
      });
      const questionId = qr.questionId;

      if (usesTextAnswers(q)) {
        for (const line of q.correct || []) {
          const t = String(line).trim();
          if (!t) continue;
          await apiFetch('/api/quizzes/correct-text', {
            method: 'POST',
            headers: h(),
            body: JSON.stringify({
              questionId,
              correctText: t,
              isCaseSensitive: false,
            }),
          });
        }
      } else if (q.type !== 'matching') {
        let pos = 0;
        for (const opt of q.options || []) {
          if (!optionIsFilled(opt)) continue;
          pos++;
          const or = await apiFetch<{ optionId: string }>('/api/quizzes/options', {
            method: 'POST',
            headers: h(),
            body: JSON.stringify({
              questionId,
              position: pos,
              label: stripOptionLetterPrefix(opt.label || '') || null,
              imageUrl: (opt.imageUrl || '').trim() || null,
            }),
          });
          const optionId = or.optionId;
          if (opt.id) optionIdMap[opt.id] = optionId;
          if ((q.correct || []).includes(opt.id)) {
            await apiFetch('/api/quizzes/correct-option', {
              method: 'POST',
              headers: h(),
              body: JSON.stringify({ questionId, optionId }),
            });
          }
        }
      }

      const layout = remapStageLayoutOptionIds(parseStageLayout(q.stageLayout), optionIdMap);
      if (layout) {
        await apiFetch(`/api/quizzes/questions/${questionId}/stage-layout`, {
          method: 'PATCH',
          headers: h(),
          body: JSON.stringify({ stageLayout: layout }),
        });
      }
    }
  }

  await apiFetch('/api/quizzes/revisions/publish', {
    method: 'POST',
    headers: h(),
    body: JSON.stringify({ quizRevisionId: revisionId }),
  });

  return { quizId: quizId! };
}
