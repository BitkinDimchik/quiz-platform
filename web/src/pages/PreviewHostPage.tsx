import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { formatMs, remainingMs } from '../lib/format';
import {
  SmoothTimerRing,
  ensureTimerRingLength,
  paintTimerLabel,
  resetTimerRingLength,
  timerRingDashoffset,
} from '../lib/timer-ring';
import { HostBgm } from '../lib/stage/bgm';
import { applyViewportRoundBg, clearViewportRoundBg } from '../lib/stage/round-bg';
import { applyQuizStageTypography } from '../lib/host/quiz-stage-font';
import { StageLayoutInspector } from '../components/StageLayoutInspector';
import type { PreviewHostPayload, PreviewStartPhase } from '../lib/builder/types';
import {
  createInitialSoloState,
  soloBuildQuestionView,
  soloDrivesStageTimer,
  soloHoldQuestionTimer,
  soloHoldRevealTimer,
  soloStartQuestionAnswerTimer,
  soloStartRevealTimer,
  type SoloState,
} from '../lib/host/solo';
import { paintHostStageLayout, useStageLayoutEditor, type LayoutApplyScope, type LayoutScreen } from '../lib/host/useStageLayoutEditor';
import type { StageLayout } from '../lib/host/stage-layout';
import { scheduleFitStageAnswers } from '../lib/host/fit-stage-answers';
import { paintIntroStage } from '../lib/host/paint-intro-stage';
import { isStageIntroPhase } from '../lib/stage-intro-phase';
import {
  previewAdvance,
  previewCanSkip,
  previewRestart,
  previewSoloFromPayload,
} from '../lib/host/preview-solo';
import type { QuestionView } from '../lib/host/types';
import {
  clearStageMediaPreserveSoundBtn,
  renderStageQuestion,
  setStageMeta,
  unlockCurrentStageVideoSound,
  type StageDom,
  type StageMediaController,
} from '../lib/host/stage-render';
import '../styles/host.css';
import '../styles/preview-host.css';

export function PreviewHostPage({
  payload,
  onClose,
  onLayoutCommit,
}: {
  payload?: PreviewHostPayload | null;
  onClose?: () => void;
  onLayoutCommit?: (
    layout: StageLayout | null,
    scope: LayoutApplyScope,
    screen: LayoutScreen,
  ) => Promise<StageLayout | null>;
} = {}) {
  const soloRef = useRef<SoloState>(createInitialSoloState());
  const lastQuestionRef = useRef<QuestionView | null>(null);
  const audioGateRef = useRef(0);
  const videoUnlockedRef = useRef(false);
  const videoQidRef = useRef('');
  const bgmRef = useRef(new HostBgm());
  const timerRingRef = useRef(new SmoothTimerRing());
  const timerCircleLenRef = useRef<number | null>(null);
  const phaseTotalMsRef = useRef<number | null>(null);
  const lastAdvanceKeyRef = useRef('');
  const lastTimerKeyRef = useRef('');
  const startPhaseRef = useRef<PreviewStartPhase>('quiz_intro');

  const stageQuestionRef = useRef<HTMLDivElement>(null);
  const stageMetaRef = useRef<HTMLDivElement>(null);
  const stageAnswersRef = useRef<HTMLDivElement>(null);
  const stageMediaRef = useRef<HTMLDivElement>(null);
  const stageExplanationRef = useRef<HTMLDivElement>(null);
  const stageExplanationImageRef = useRef<HTMLDivElement>(null);
  const stageExplanationVideoRef = useRef<HTMLDivElement>(null);
  const btnHostVideoSoundRef = useRef<HTMLButtonElement>(null);
  const timerCircleProgressRef = useRef<SVGCircleElement>(null);
  const timerCircleTextRef = useRef<HTMLDivElement>(null);

  const [phase, setPhase] = useState('');
  const [tick, setTick] = useState(0);
  const [canSkip, setCanSkip] = useState(false);

  const getStageDom = useCallback((): StageDom => ({
    stageQuestion: stageQuestionRef.current,
    stageMeta: stageMetaRef.current,
    stageAnswers: stageAnswersRef.current,
    stageMedia: stageMediaRef.current,
    stageExplanation: stageExplanationRef.current,
    stageExplanationImage: stageExplanationImageRef.current,
    stageExplanationVideo: stageExplanationVideoRef.current,
    btnHostVideoSound: btnHostVideoSoundRef.current,
  }), []);

  const bumpUi = useCallback((solo: SoloState) => {
    setPhase(solo.phase);
    setCanSkip(previewCanSkip(solo));
    setTick((n) => n + 1);
  }, []);

  const getMediaCtrl = useCallback((): StageMediaController => ({
    getAudioGateToken: () => audioGateRef.current,
    bumpAudioGateToken: () => ++audioGateRef.current,
    isVideoSoundUnlocked: () => videoUnlockedRef.current,
    setVideoSoundUnlocked: (v) => {
      videoUnlockedRef.current = v;
    },
    getVideoSoundQuestionId: () => videoQidRef.current,
    setVideoSoundQuestionId: (id) => {
      videoQidRef.current = id;
    },
    getLastQuestion: () => lastQuestionRef.current,
    setLastQuestion: (q) => {
      lastQuestionRef.current = q;
    },
    bgm: bgmRef.current,
    getSessionPhase: () => soloRef.current?.phase,
    notifyListenMediaPlay: () => {
      const solo = soloRef.current;
      if (!solo.on) return;
      if (solo.phase === 'question') soloHoldQuestionTimer(solo);
      else if (solo.phase === 'answer_reveal' || solo.phase === 'round_summary') {
        soloHoldRevealTimer(solo);
      }
    },
    notifyListenMediaEnded: () => {
      const solo = soloRef.current;
      if (!solo.on) return;
      if (solo.phase === 'question') soloStartQuestionAnswerTimer(solo);
      else if (solo.phase === 'answer_reveal' || solo.phase === 'round_summary') {
        soloStartRevealTimer(solo);
      }
      bumpUi(solo);
    },
  }), [bumpUi]);

  useEffect(() => {
    const applyPayload = (data: PreviewHostPayload | null | undefined): boolean => {
      if (!data || data.type !== 'quiz_preview_host') return false;
      applyQuizStageTypography({
        fontFamily: data.quiz?.fontFamily,
        stageTypeStyles: data.quiz?.stageTypeStyles,
      });
      startPhaseRef.current = data.startPhase || 'quiz_intro';
      const solo = previewSoloFromPayload(data);
      lastAdvanceKeyRef.current = '';
      lastTimerKeyRef.current = '';
      if (!solo) {
        soloRef.current = createInitialSoloState();
        setPhase('');
        setCanSkip(false);
        setTick((n) => n + 1);
        return true;
      }
      soloRef.current = solo;
      bumpUi(solo);
      return true;
    };

    if (payload) {
      applyPayload(payload);
      return;
    }

    const onMessage = (e: MessageEvent) => {
      applyPayload(e?.data as PreviewHostPayload | null);
    };
    window.addEventListener('message', onMessage);

    let tries = 0;
    let timer = 0;
    const pull = () => {
      let picked = false;
      try {
        const parent = window.parent as (Window & { __lastPreviewPayload?: PreviewHostPayload }) | null;
        if (parent && parent !== window) picked = applyPayload(parent.__lastPreviewPayload);
      } catch {
        /* cross-origin — только postMessage */
      }
      if (!picked && tries < 40) {
        tries += 1;
        timer = window.setTimeout(pull, 50);
      }
    };
    pull();

    return () => {
      window.removeEventListener('message', onMessage);
      if (timer) window.clearTimeout(timer);
    };
  }, [bumpUi, payload]);

  useEffect(
    () => () => {
      bgmRef.current.dispose();
      clearViewportRoundBg();
    },
    [],
  );

  const persistLayout = useCallback(
    (layout: StageLayout | null, scope: LayoutApplyScope, screen: LayoutScreen) => {
      if (!onLayoutCommit) return Promise.reject(new Error('Сначала сохраните квиз в конструкторе'));
      return onLayoutCommit(layout, scope, screen);
    },
    [onLayoutCommit],
  );

  const layoutEditor = useStageLayoutEditor({
    soloRef,
    getQuestion: () => (soloRef.current.on ? soloBuildQuestionView(soloRef.current) : null),
    rerender: () => {
      if (soloRef.current.on) bumpUi(soloRef.current);
    },
    setSoloPausedLabel: () => {},
    bgmPause: () => bgmRef.current.pause(),
    bgmResume: () => bgmRef.current.resume(),
    persistLayout: onLayoutCommit ? persistLayout : undefined,
  });

  const paint = useCallback(() => {
    const solo = soloRef.current;
    const qv = solo.on ? soloBuildQuestionView(solo) : null;
    const timerCircleEl = document.querySelector('.timer-circle') as HTMLElement | null;
    const stageCard = document.getElementById('stageCard');
    if (stageCard) {
      stageCard.classList.toggle('host-stage--round-intro', isStageIntroPhase(solo.phase));
    }
    if (solo.on && isStageIntroPhase(solo.phase) && qv) {
      clearStageMediaPreserveSoundBtn(getStageDom());
      paintIntroStage(getStageDom(), {
        phase: solo.phase,
        q: qv,
        quizId: solo.quizId,
        editing: layoutEditor.editingRef.current,
        paintWorking: () => layoutEditor.paintWorking(),
      });
      phaseTotalMsRef.current =
        (solo.phase === 'quiz_intro' ? qv.quizIntroSec || 6 : qv.roundIntroSec || 6) * 1000;
      if (timerCircleEl) timerCircleEl.style.display = 'none';
    } else {
      const showCorrect = solo.phase === 'answer_reveal';
      if (solo.on && solo.phase === 'answer_reveal') {
        setStageMeta(stageMetaRef.current, 'Правильный ответ');
      }
      renderStageQuestion(getStageDom(), getMediaCtrl(), qv, !!showCorrect, solo.on ? solo.phase : undefined, 'solo');
      if (layoutEditor.editingRef.current) layoutEditor.paintWorking();
      else paintHostStageLayout(qv?.stageLayout, qv?.id);
      scheduleFitStageAnswers(document.querySelector('#stageCard .stage-center'));
      if (timerCircleEl) timerCircleEl.style.display = solo.on ? '' : 'none';
      if (solo.on && soloDrivesStageTimer(solo.phase) && qv) {
        if (solo.phase === 'question_read') phaseTotalMsRef.current = (qv.readTimeSec || 3) * 1000;
        else if (solo.phase === 'question') phaseTotalMsRef.current = (qv.timeLimitSec || 15) * 1000;
        else phaseTotalMsRef.current = (qv.roundSummarySec || 2) * 1000;
      }
    }
    const bg = (qv?.roundBackgroundUrl || '').trim();
    if (bg) applyViewportRoundBg(bg);
    else clearViewportRoundBg();
    resetTimerRingLength(timerCircleLenRef);
  }, [getMediaCtrl, getStageDom, layoutEditor.editingRef, layoutEditor.paintWorking]);

  useLayoutEffect(() => {
    paint();
  }, [paint, phase, tick]);

  useEffect(() => {
    const onFit = () =>
      scheduleFitStageAnswers(document.querySelector('#stageCard .stage-center') as HTMLElement | null);
    window.addEventListener('resize', onFit);
    const node = document.querySelector('#stageCard .stage-center');
    const ro = node ? new ResizeObserver(onFit) : null;
    if (node instanceof HTMLElement) ro?.observe(node);
    return () => {
      window.removeEventListener('resize', onFit);
      ro?.disconnect();
    };
  }, []);

  const syncTimerRing = useCallback(() => {
    const solo = soloRef.current;
    const progress = timerCircleProgressRef.current;
    const len = ensureTimerRingLength(progress, timerCircleLenRef);
    const ms = solo ? remainingMs(solo.phaseDeadlineAt) : null;
    const total = phaseTotalMsRef.current;
    if (solo?.phaseDeadlineAt && soloDrivesStageTimer(solo.phase)) {
      const key = `${solo.phase}|${solo.phaseDeadlineAt}`;
      if (lastTimerKeyRef.current !== key) {
        lastTimerKeyRef.current = key;
        if (ms != null && ms > 0) phaseTotalMsRef.current = ms;
      }
    }
    timerRingRef.current.cancel();
    if (progress) {
      progress.style.transition = 'none';
      if (ms == null || !total || !len) {
        progress.style.strokeDashoffset = String(len || 0);
      } else {
        progress.style.strokeDashoffset = String(timerRingDashoffset(len, ms, total));
      }
    }
    paintTimerLabel(timerCircleTextRef.current, ms == null ? '—' : formatMs(ms));
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      const solo = soloRef.current;
      if (!solo.on) {
        paintTimerLabel(timerCircleTextRef.current, '—');
        return;
      }
      const ms = remainingMs(solo.phaseDeadlineAt);
      syncTimerRing();
      if (!solo.paused && ms != null && ms <= 0 && solo.phaseDeadlineAt) {
        const advKey = `${solo.phase}|${solo.phaseDeadlineAt}`;
        if (advKey !== lastAdvanceKeyRef.current) {
          lastAdvanceKeyRef.current = advKey;
          if (previewAdvance(solo)) bumpUi(solo);
        }
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [bumpUi, syncTimerRing]);

  const onSkip = () => {
    const solo = soloRef.current;
    if (!solo.on || layoutEditor.editingRef.current || !previewCanSkip(solo)) return;
    lastAdvanceKeyRef.current = '';
    previewAdvance(solo);
    bumpUi(solo);
  };

  const onRestart = () => {
    const solo = soloRef.current;
    if (!solo.on || layoutEditor.editingRef.current) return;
    lastAdvanceKeyRef.current = '';
    lastTimerKeyRef.current = '';
    previewRestart(solo, startPhaseRef.current);
    bumpUi(solo);
  };

  const onReturn = () => {
    if (layoutEditor.editing && !layoutEditor.cancel()) return;
    if (onClose) {
      onClose();
      return;
    }
    try {
      window.parent?.postMessage({ type: 'quiz_preview_close' }, '*');
    } catch {
      /* нет родителя — игнорируем */
    }
  };

  return (
    <>
      <div id="viewportRoundBg" className="viewport-round-bg" aria-hidden="true" />
      <div className="container">
        <div className="host-shell">
          <div className="host-main">
            <div className="card host-stage" id="stageCard">
              <div className="stage-center">
                <div
                  className="host-stage__q host-stage__q--big stage-q"
                  id="stageQuestion"
                  ref={stageQuestionRef}
                >
                  Ожидание…
                </div>
                <div className="stage-media stage-media--host" id="stageMedia" ref={stageMediaRef}>
                  <button
                    className="btn host-video-sound-btn"
                    id="btnHostVideoSound"
                    type="button"
                    style={{ display: 'none' }}
                    ref={btnHostVideoSoundRef}
                    onClick={() => unlockCurrentStageVideoSound(getStageDom(), getMediaCtrl())}
                  >
                    Включить звук
                  </button>
                </div>
                <div className="timer-circle" data-stage-key="timer" aria-hidden="true">
                  <svg className="timer-circle__svg" viewBox="0 0 100 100">
                    <circle className="timer-circle__halo timer-circle__halo--black" cx="50" cy="50" r="42" />
                    <circle className="timer-circle__halo timer-circle__halo--white" cx="50" cy="50" r="42" />
                    <circle className="timer-circle__track" cx="50" cy="50" r="42" />
                    <circle
                      className="timer-circle__progress"
                      id="timerCircleProgress"
                      cx="50"
                      cy="50"
                      r="42"
                      ref={timerCircleProgressRef}
                    />
                  </svg>
                  <div className="timer-circle__text" id="timerCircleText" ref={timerCircleTextRef}>
                    —
                  </div>
                </div>
                <div className="stage-q host-stage__explanation-label" id="stageExplanationLabel" />
                <div
                  className="host-stage__explanation host-stage__explanation-text stage-q"
                  id="stageExplanation"
                  ref={stageExplanationRef}
                />
                <div
                  className="host-stage__explanation host-stage__explanation--image stage-answer answer--visual"
                  id="stageExplanationImage"
                  ref={stageExplanationImageRef}
                />
                <div
                  className="host-stage__explanation host-stage__explanation--video"
                  id="stageExplanationVideo"
                  ref={stageExplanationVideoRef}
                />
                <div className="muted host-stage__meta stage-meta" id="stageMeta" ref={stageMetaRef} />
                <div className="grid-answers host-stage__answers" id="stageAnswers" ref={stageAnswersRef} />
                {layoutEditor.editing ? (
                  <StageLayoutInspector
                    selectedKey={layoutEditor.selectedKey}
                    box={layoutEditor.selectedBox}
                    layout={layoutEditor.working}
                    applyScope={layoutEditor.applyScope}
                    onApplyScope={layoutEditor.setApplyScope}
                    onChange={layoutEditor.patchSelected}
                    onApplySizeToImages={layoutEditor.applySelectedSizeToImages}
                  />
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="preview-host-controls">
        <button className="btn" type="button" onClick={onReturn}>
          ← Вернуться в редактор
        </button>
        {phase ? (
          <>
            <button
              className="btn"
              type="button"
              disabled={!canSkip || layoutEditor.editing}
              onClick={onSkip}
            >
              Дальше
            </button>
            <button
              className="btn primary"
              type="button"
              disabled={layoutEditor.editing}
              onClick={onRestart}
            >
              Повторить
            </button>
            {layoutEditor.canEdit && !layoutEditor.editing ? (
              <button className="btn" type="button" onClick={() => layoutEditor.enter()}>
                Редактировать сцену
              </button>
            ) : null}
            {layoutEditor.editing ? (
              <>
                <button
                  className="btn primary"
                  type="button"
                  disabled={!layoutEditor.dirty}
                  onClick={() => void layoutEditor.save()}
                >
                  Сохранить{layoutEditor.applyScope === 'all' ? ' на все экраны' : ''}
                </button>
                <button className="btn" type="button" onClick={() => layoutEditor.cancel()}>
                  Отмена
                </button>
                <button className="btn" type="button" onClick={() => void layoutEditor.reset()}>
                  {layoutEditor.applyScope === 'all' ? 'Сбросить все экраны' : 'Сбросить'}
                </button>
              </>
            ) : null}
          </>
        ) : null}
      </div>
    </>
  );
}
