import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiFetch, withAuth } from '../api';
import { getAccessToken, whenSessionReady } from '../auth';
import { toast } from '../toast';
import {
  defaultMatchingQuestion,
  defaultQuestion,
  defaultRound,
  emptyQuizDraft,
  emptyUi,
  ensureChoiceOptions,
  ensureIndexes,
  ensureMatchingShape,
  stepDone,
  uuid,
} from './defaults';
import { applyRoundConfig, parseRoundConfigTxt, parseTxtImport, roundTxtFilename, serializeRoundToTxt } from './import-txt';
import { saveQuizToServer } from './save-quiz';
import { applyServerPayload } from './server-payload';
import {
  applyStageLayoutToDraft,
  draftLayoutPatchTargets,
} from './apply-stage-layout';
import { patchQuestionLayout, patchQuizLayout, patchRoundLayout, type LayoutApplyScope } from '../host/useStageLayoutEditor';
import type { StageLayout } from '../host/stage-layout';
import {
  clearDraftStorage,
  loadDraftFromStorage,
  resetEmptyDraft,
  saveDraftToStorage,
} from './storage';
import type {
  BuilderQuestion,
  BuilderRound,
  BuilderUi,
  MusicUploadTarget,
  PreviewHostPayload,
  QuizDraft,
} from './types';
import { uploadAudioFileToServer, uploadVideoFileToServer } from './uploads';
import { enterBuilderPreviewBody, exitBuilderPreviewBody } from './preview-body';
import { ensurePreviewQuiz, resolvePreviewStartPhase } from '../host/preview-solo';

function cloneDraft(d: QuizDraft): QuizDraft {
  return structuredClone(d);
}

export function useBuilderDraft() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const searchKey = searchParams.toString();
  const [quizDraft, setQuizDraft] = useState<QuizDraft>(() => emptyQuizDraft());
  const [ui, setUi] = useState<BuilderUi>(() => emptyUi());
  const [serverQuizId, setServerQuizId] = useState<string | null>(null);
  const [booted, setBooted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewPayload, setPreviewPayload] = useState<PreviewHostPayload | null>(null);
  const persistReady = useRef(false);
  const loadedQuizIdRef = useRef<string | null>(null);
  const draftRef = useRef(quizDraft);
  const uiRef = useRef(ui);
  draftRef.current = quizDraft;
  uiRef.current = ui;

  const loginNext = useCallback(() => {
    const next = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    navigate(next);
  }, [navigate]);

  const persist = useCallback((draft: QuizDraft, nextUi: BuilderUi) => {
    try {
      saveDraftToStorage(draft, nextUi);
    } catch {
      toast('Черновик слишком большой для автосохранения в браузере (уменьшите картинки)');
    }
  }, []);

  const updateDraft = useCallback(
    (updater: (d: QuizDraft) => void, uiPatch?: Partial<BuilderUi>) => {
      setQuizDraft((prev) => {
        const next = cloneDraft(prev);
        updater(next);
        const mergedUi = { ...uiRef.current, ...(uiPatch || {}) };
        const fixedUi = ensureIndexes(next, mergedUi);
        setUi(fixedUi);
        if (persistReady.current) persist(next, fixedUi);
        return next;
      });
    },
    [persist],
  );

  const setStep = useCallback(
    (step: number) => {
      const s = Math.min(4, Math.max(1, step)) as 1 | 2 | 3 | 4;
      setUi((prev) => {
        const next = { ...prev, step: s };
        if (persistReady.current) persist(draftRef.current, next);
        return next;
      });
    },
    [persist],
  );

  const applyPreviewStageLayout = useCallback(
    async (
      layout: StageLayout | null,
      scope: LayoutApplyScope,
      screen: import('../host/useStageLayoutEditor').LayoutScreen = 'question',
    ) => {
      const ri = uiRef.current.activeRoundIdx;
      const qi = uiRef.current.activeQuestionIdx;
      const next = cloneDraft(draftRef.current);
      applyStageLayoutToDraft(next, { roundIdx: ri, questionIdx: qi, layout, scope, screen });
      for (const t of draftLayoutPatchTargets(next, {
        roundIdx: ri,
        questionIdx: qi,
        scope,
        screen,
        quizId: serverQuizId,
      })) {
        const saved =
          t.kind === 'quiz'
            ? await patchQuizLayout(t.id, t.layout)
            : t.kind === 'round'
              ? await patchRoundLayout(t.id, t.layout)
              : await patchQuestionLayout(t.id, t.layout);
        if (t.kind === 'quiz') next.stageLayout = saved;
        else if (t.kind === 'round') {
          for (const round of next.rounds) {
            if (round.id === t.id) round.stageLayout = saved;
          }
        } else {
          for (const round of next.rounds) {
            for (const q of round.questions || []) {
              if (q.id === t.id) q.stageLayout = saved;
            }
          }
        }
      }
      const applied =
        screen === 'quiz_intro'
          ? (next.stageLayout ?? layout)
          : screen === 'round_intro'
            ? (next.rounds[ri]?.stageLayout ?? layout)
            : (next.rounds[ri]?.questions[qi]?.stageLayout ?? layout);
      updateDraft((d) => {
        d.stageLayout = next.stageLayout;
        for (let i = 0; i < d.rounds.length; i++) {
          const srcRound = next.rounds[i];
          if (!srcRound) continue;
          d.rounds[i].stageLayout = srcRound.stageLayout;
          for (let j = 0; j < d.rounds[i].questions.length; j++) {
            d.rounds[i].questions[j].stageLayout = srcRound.questions[j]?.stageLayout;
          }
        }
      });
      return applied;
    },
    [serverQuizId, updateDraft],
  );

  useEffect(() => {
    let cancelled = false;
    const currentSearch = new URLSearchParams(searchKey);
    const qp = currentSearch.get('quizId');
    if (qp && loadedQuizIdRef.current === qp) {
      persistReady.current = true;
      setBooted(true);
      return;
    }
    persistReady.current = false;
    (async () => {
      const newRaw = currentSearch.get('new');
      const forceNew =
        currentSearch.has('new') && !['0', 'false'].includes((newRaw || '').toLowerCase());

      if (qp) {
        const authed = await whenSessionReady();
        if (cancelled) return;
        if (!authed) {
          toast('Войдите, чтобы редактировать квиз');
          loginNext();
          return;
        }
        try {
          const data = await apiFetch<Record<string, unknown>>(`/api/quizzes/${qp}`, {
            headers: withAuth({}),
          });
          if (cancelled) return;
          const draft = applyServerPayload(data);
          const nextUi = emptyUi();
          ensureIndexes(draft, nextUi);
          setQuizDraft(draft);
          setUi(nextUi);
          setServerQuizId(String(data.quizId || qp));
          loadedQuizIdRef.current = String(data.quizId || qp);
          persist(draft, nextUi);
        } catch (e) {
          toast((e as Error).message || 'Не удалось загрузить квиз');
          const loaded = loadDraftFromStorage();
          if (loaded) {
            const fixed = ensureIndexes(loaded.quizDraft, loaded.ui);
            setQuizDraft(loaded.quizDraft);
            setUi(fixed);
          }
        }
      } else if (forceNew) {
        const empty = resetEmptyDraft();
        const fixedUi = ensureIndexes(empty.quizDraft, empty.ui);
        loadedQuizIdRef.current = null;
        setServerQuizId(null);
        setQuizDraft(empty.quizDraft);
        setUi(fixedUi);
        const next = new URLSearchParams(currentSearch);
        next.delete('new');
        setSearchParams(next, { replace: true });
      } else {
        loadedQuizIdRef.current = null;
        setServerQuizId(null);
        const loaded = loadDraftFromStorage();
        if (loaded) {
          const fixed = ensureIndexes(loaded.quizDraft, loaded.ui);
          setQuizDraft(loaded.quizDraft);
          setUi(fixed);
        } else {
          const draft = emptyQuizDraft();
          const nextUi = emptyUi();
          ensureIndexes(draft, nextUi);
          setQuizDraft(draft);
          setUi(nextUi);
        }
      }
      if (!cancelled) {
        persistReady.current = true;
        setBooted(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loginNext, persist, searchKey, setSearchParams]);

  const activeRound: BuilderRound | null =
    quizDraft.rounds[ui.activeRoundIdx] ?? null;
  const activeQuestion: BuilderQuestion | null =
    activeRound?.questions?.[ui.activeQuestionIdx] ?? null;

  const exportJson = useCallback(() => {
    const blob = new Blob([JSON.stringify(draftRef.current, null, 2)], {
      type: 'application/json',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(draftRef.current.title || 'quiz').replace(/\s+/g, '-').toLowerCase()}-draft.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, []);

  const openPreview = useCallback(() => {
    const draft = draftRef.current;
    const curUi = uiRef.current;
    ensureIndexes(draft, curUi);
    const startPhase = resolvePreviewStartPhase(curUi.step);
    const prepared = ensurePreviewQuiz(draft, curUi.activeRoundIdx, curUi.activeQuestionIdx);
    const payload: PreviewHostPayload = {
      type: 'quiz_preview_host',
      quiz: prepared.quiz,
      activeRoundIdx: prepared.roundIdx,
      activeQuestionIdx: prepared.questionIdx,
      startPhase,
    };
    setPreviewPayload(payload);
    setPreviewOpen(true);
    enterBuilderPreviewBody();
  }, []);

  const canOpenPreview = useCallback(() => {
    const step = ui.step;
    return step === 1 || step === 3 || step === 4;
  }, [ui.step]);

  const closePreview = useCallback(() => {
    setPreviewOpen(false);
    setPreviewPayload(null);
    exitBuilderPreviewBody();
  }, []);

  const saveToServer = useCallback(async () => {
    setSaving(true);
    try {
      const { quizId } = await saveQuizToServer(draftRef.current, uiRef.current, serverQuizId, {
        onNeedLogin: () => {
          toast('Нужен вход — откроется страница входа.');
          loginNext();
        },
      });
      setServerQuizId(quizId);
      loadedQuizIdRef.current = quizId;
      localStorage.setItem('LAST_QUIZ_ID', quizId);
      persist(draftRef.current, uiRef.current);
      toast('Квиз сохранён');
      const next = new URLSearchParams(searchParams);
      if (next.get('quizId') !== quizId) {
        next.set('quizId', quizId);
        next.delete('new');
        setSearchParams(next, { replace: true });
      }
    } catch (e) {
      const msg = (e as Error).message || 'Ошибка сохранения';
      if (msg !== 'unauthorized') toast(msg);
    } finally {
      setSaving(false);
    }
  }, [loginNext, persist, searchParams, serverQuizId, setSearchParams]);

  const importRoundTxt = useCallback(
    async (file: File) => {
      try {
        const raw = await file.text();
        const parsed = parseTxtImport(raw);
        if (!parsed.length) {
          const cfg = parseRoundConfigTxt(raw);
          if (cfg) {
            updateDraft((d) => {
              const idx = Math.min(Math.max(0, uiRef.current.activeRoundIdx), Math.max(0, d.rounds.length - 1));
              const dst = d.rounds[idx] || defaultRound();
              if (!d.rounds[idx]) d.rounds[idx] = dst;
              applyRoundConfig(dst, cfg);
            });
            toast(`Настройки раунда ${uiRef.current.activeRoundIdx + 1} импортированы`);
            return;
          }
          toast('Не удалось распознать вопросы или настройки из TXT');
          return;
        }
        updateDraft(
          (d) => {
            if (parsed.length === 1) {
              const idx = Math.min(Math.max(0, uiRef.current.activeRoundIdx), Math.max(0, d.rounds.length - 1));
              const src = parsed[0];
              const dst = d.rounds[idx] || defaultRound();
              if (!d.rounds[idx]) d.rounds[idx] = dst;
              if (src.round.title) dst.title = src.round.title;
              if (src.round.description) dst.description = src.round.description;
              applyRoundConfig(dst, src.config);
              if (src.round.questions.length) dst.questions = src.round.questions;
            } else {
              d.rounds = parsed.map((p) => p.round);
            }
          },
          {
            activeRoundIdx: parsed.length === 1 ? uiRef.current.activeRoundIdx : 0,
            activeQuestionIdx: 0,
          },
        );
        const cfgNote =
          parsed.length === 1 && Object.keys(parsed[0].config).length > 0 ? ' (+ настройки)' : '';
        toast(
          parsed.length === 1
            ? `Импортировано в раунд ${uiRef.current.activeRoundIdx + 1}: ${parsed[0].round.questions.length} вопрос(ов)${cfgNote}`
            : `Импортировано: ${parsed.length} раунд(ов)`,
        );
      } catch (err) {
        toast((err as Error).message || 'Ошибка импорта TXT');
      }
    },
    [updateDraft],
  );

  const exportRoundTxt = useCallback((roundIdx?: number) => {
    const idx = roundIdx ?? uiRef.current.activeRoundIdx;
    const round = draftRef.current.rounds[idx];
    if (!round) {
      toast('Нет раунда для сохранения');
      return;
    }
    const blob = new Blob([serializeRoundToTxt(round, idx + 1)], {
      type: 'text/plain;charset=utf-8',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = roundTxtFilename(round, idx);
    a.click();
    URL.revokeObjectURL(a.href);
    toast(`Раунд ${idx + 1} сохранён в TXT`);
  }, []);

  const importTxtAppendQuestions = useCallback(
    async (file: File) => {
      try {
        const raw = await file.text();
        const parsed = parseTxtImport(raw);
        const incoming = parsed.flatMap((p) => p.round.questions || []);
        if (!incoming.length) {
          toast('Не удалось распознать вопросы в TXT');
          return;
        }
        const roundIdx = uiRef.current.activeRoundIdx;
        const prevLen = draftRef.current.rounds[roundIdx]?.questions?.length ?? 0;
        updateDraft(
          (d) => {
            const idx = Math.min(Math.max(0, roundIdx), Math.max(0, d.rounds.length - 1));
            const dst = d.rounds[idx] || defaultRound();
            if (!d.rounds[idx]) d.rounds[idx] = dst;
            if (!dst.questions) dst.questions = [];
            dst.questions.push(...incoming);
          },
          { activeQuestionIdx: prevLen },
        );
        toast(`Добавлено вопросов: ${incoming.length}`);
      } catch (err) {
        toast((err as Error).message || 'Ошибка импорта TXT');
      }
    },
    [updateDraft],
  );

  const uploadAudio = useCallback(
    async (file: File, target: MusicUploadTarget) => {
      try {
        const url = await uploadAudioFileToServer(file, () => {
          toast('Нужен вход — откроется страница входа.');
          loginNext();
        });
        updateDraft((d) => {
          if (target === 'quizFinalMusic') d.finalMusic = url;
          else if (target === 'roundMusic') d.rounds[uiRef.current.activeRoundIdx].music = url;
          else if (target === 'roundLeaderboardMusic') {
            d.rounds[uiRef.current.activeRoundIdx].leaderboardMusic = url;
          } else if (target === 'qMusic') {
            const q =
              d.rounds[uiRef.current.activeRoundIdx].questions[uiRef.current.activeQuestionIdx];
            q.music = url;
          } else if (target === 'mediaAudio') {
            const q =
              d.rounds[uiRef.current.activeRoundIdx].questions[uiRef.current.activeQuestionIdx];
            q.media = q.media || { image: null, video: '', audio: '' };
            q.media.audio = url;
          }
        });
        toast('Трек загружен');
        return url;
      } catch (err) {
        const msg = (err as Error).message;
        if (msg !== 'unauthorized') toast(msg || 'Ошибка загрузки трека');
        throw err;
      }
    },
    [loginNext, updateDraft],
  );

  const uploadVideo = useCallback(
    async (file: File, target: 'media' | 'explanation' = 'media') => {
      try {
        const url = await uploadVideoFileToServer(file, () => {
          toast('Нужен вход — откроется страница входа.');
          loginNext();
        });
        updateDraft((d) => {
          const q =
            d.rounds[uiRef.current.activeRoundIdx].questions[uiRef.current.activeQuestionIdx];
          if (target === 'explanation') {
            q.explanation = q.explanation || { text: '', image: null, video: '' };
            q.explanation.video = url;
          } else {
            q.media = q.media || { image: null, video: '', audio: '' };
            q.media.video = url;
          }
        });
        toast('Видео загружено');
        return url;
      } catch (err) {
        const msg = (err as Error).message;
        if (msg !== 'unauthorized') toast(msg || 'Ошибка загрузки видео');
        throw err;
      }
    },
    [loginNext, updateDraft],
  );

  const addRound = useCallback(() => {
    updateDraft(
      (d) => {
        d.rounds.push(defaultRound());
      },
      { activeRoundIdx: quizDraft.rounds.length, activeQuestionIdx: 0 },
    );
  }, [quizDraft.rounds.length, updateDraft]);

  const addQuestion = useCallback(() => {
    updateDraft((d) => {
      const r = d.rounds[uiRef.current.activeRoundIdx];
      r.questions.push(defaultQuestion());
    }, { activeQuestionIdx: (activeRound?.questions.length ?? 0) });
  }, [activeRound?.questions.length, updateDraft]);

  const changeQuestionType = useCallback(
    (type: BuilderQuestion['type']) => {
      updateDraft((d) => {
        const q = d.rounds[uiRef.current.activeRoundIdx].questions[uiRef.current.activeQuestionIdx];
        const prev = q.type;
        q.type = type;
        q.correct = [];
        if (type === 'hidden') {
          q.hiddenAnswer = q.hiddenAnswer === 'text' ? 'text' : 'single';
          if (!q.imageHideRects?.length && !q.imageHideRect) {
            q.imageHideRects = [{ x: 35, y: 35, w: 30, h: 30 }];
          }
        } else {
          delete q.hiddenAnswer;
          delete q.imageHideRect;
          delete q.imageHideRects;
        }
        if (type === 'matching' && prev !== 'matching') {
          const dm = defaultMatchingQuestion();
          q.matchLeft = dm.matchLeft;
          q.matchRight = dm.matchRight;
          q.matchCorrect = dm.matchCorrect;
          q.matchScoringMode = dm.matchScoringMode;
          q.options = [];
        }
        if (type === 'single' || type === 'multiple' || (type === 'hidden' && q.hiddenAnswer !== 'text')) {
          ensureChoiceOptions(q);
        }
        if (type === 'matching') ensureMatchingShape(q);
      });
    },
    [updateDraft],
  );

  return {
    booted,
    quizDraft,
    ui,
    serverQuizId,
    saving,
    previewOpen,
    previewPayload,
    activeRound,
    activeQuestion,
    stepDone: (s: number) => stepDone(quizDraft, s),
    setStep,
    updateDraft,
    setUi: (patch: Partial<BuilderUi>) => {
      setUi((prev) => {
        const next = ensureIndexes(draftRef.current, { ...prev, ...patch });
        if (persistReady.current) persist(draftRef.current, next);
        return next;
      });
    },
    exportJson,
    saveToServer,
    openPreview,
    canOpenPreview,
    closePreview,
    applyPreviewStageLayout,
    importRoundTxt,
    exportRoundTxt,
    importTxtAppendQuestions,
    uploadAudio,
    uploadVideo,
    addRound,
    addQuestion,
    changeQuestionType,
    uuid,
    defaultQuestion,
    defaultMatchingQuestion,
    ensureMatchingShape,
    clearDraftStorage,
    getAccessToken,
    loginNext,
  };
}
