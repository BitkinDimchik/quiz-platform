import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { Socket } from 'socket.io-client';
import { Topbar } from '../components/Topbar';
import { PlayerAvatarFace } from '../components/PlayerAvatarFace';
import { apiFetch, withAuth } from '../lib/api';
import { getAccessToken } from '../lib/auth';
import { formatMs, remainingMs } from '../lib/format';
import {
  SmoothTimerRing,
  ensureTimerRingLength,
  paintTimerLabel,
  resetTimerRingLength,
  timerRingDashoffset,
} from '../lib/timer-ring';
import { copyTextToClipboard } from '../lib/copy-text';
import { writeTextToServerClipboard } from '../lib/builder/os-clipboard';
import { toast } from '../lib/toast';
import { HostBgm } from '../lib/stage/bgm';
import { applyViewportRoundBg, clearViewportRoundBg } from '../lib/stage/round-bg';
import { applyQuizStageTypography, clearQuizStageFont } from '../lib/host/quiz-stage-font';
import { clearQuizStageTypeStyles } from '../lib/host/stage-type-styles';
import { isStageIntroPhase } from '../lib/stage-intro-phase';
import {
  applyLobbyLinks,
  createHostSocket,
  emitAck,
  loadHostSummary,
  loadPlayers,
  reopenSession,
} from '../lib/host/useHostSocket';
import {
  createInitialSoloState,
  soloAdvance,
  soloBack,
  soloBuildQuestionView,
  soloCanBack,
  soloCurrentRound,
  soloDrivesStageTimer,
  soloHoldQuestionTimer,
  soloHoldRevealTimer,
  soloIsRevealPhase,
  soloResumeAfterPause,
  soloSetDeadline,
  soloSetPhase,
  soloStartQuestionAnswerTimer,
  soloStartRevealTimer,
  type SoloState,
} from '../lib/host/solo';
import type { HostPlayer, HostSession, LeaderboardPayload, QuestionView } from '../lib/host/types';
import { StageLayoutInspector } from '../components/StageLayoutInspector';
import { paintHostStageLayout, useStageLayoutEditor } from '../lib/host/useStageLayoutEditor';
import { paintIntroStage } from '../lib/host/paint-intro-stage';
import { scheduleFitStageAnswers } from '../lib/host/fit-stage-answers';
import { hostStageIdentity, hostUiSessionChanged } from '../lib/host/stage-sync';
import { createHostLeaveController } from '../lib/host/leave-and-go';
import {
  applyStageVideoToggle,
  clearStageMediaPreserveSoundBtn,
  hostListenMediaPlaying,
  pauseHostMediaQuestionMediaOnly,
  paintStageExplanation,
  primeHostListenMedia,
  renderLeaderboardDom,
  renderStageQuestion,
  setStageMeta,
  syncVideoSoundButton,
  unlockCurrentStageVideoSound,
  type StageDom,
  type StageMediaController,
} from '../lib/host/stage-render';
import '../styles/host.css';

function soloStageUiKey(solo: SoloState): string {
  return `${solo.phase}|${solo.roundIdx}|${solo.questionIdx}`;
}

function hostMediaMode(soloOn: boolean): 'live' | 'solo' {
  return soloOn ? 'solo' : 'live';
}

function playerCountLabel(n: number): string {
  if (n === 1) return '1 игрок';
  if (n >= 2 && n <= 4) return `${n} игрока`;
  return `${n} игроков`;
}

function setHostQuizViewing(on: boolean) {
  if (on) document.body.classList.add('host-quiz-viewing');
  else document.body.classList.remove('host-quiz-viewing');
}

function resolveHostQuizId(
  params: URLSearchParams,
  session: HostSession | null,
): string {
  return (
    params.get('quizId') ||
    (session?.quizId != null ? String(session.quizId) : '') ||
    localStorage.getItem('LAST_QUIZ_ID') ||
    ''
  );
}

export function HostPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const [wsConnected, setWsConnected] = useState(false);
  const [sessionId, setSessionId] = useState('');
  const [hostSecret, setHostSecret] = useState('');
  const [roomCode, setRoomCode] = useState('—');
  const [playerUrl, setPlayerUrl] = useState('');
  const [players, setPlayers] = useState<HostPlayer[]>([]);
  const [session, setSession] = useState<HostSession | null>(null);
  const [quizTitle, setQuizTitle] = useState('Запуск квиза');
  const [quizMeta, setQuizMeta] = useState('—');
  const [quizSub, setQuizSub] = useState(
    'Лобби ведущего: игроки подключаются по QR/коду. Нажмите «Начать игру», когда все готовы.',
  );
  const [quizBgStyle, setQuizBgStyle] = useState<string>('');
  const [hideQuizPanel, setHideQuizPanel] = useState(false);
  const [lobbyVisible, setLobbyVisible] = useState(true);
  const [stageVisible, setStageVisible] = useState(false);
  const [lbVisible, setLbVisible] = useState(false);
  const [soloControlsVisible, setSoloControlsVisible] = useState(false);
  const [soloBackEnabled, setSoloBackEnabled] = useState(false);
  const [soloPausedLabel, setSoloPausedLabel] = useState('Пауза');
  const [hostPausedLabel, setHostPausedLabel] = useState('Пауза');
  const [gameMenuOpen, setGameMenuOpen] = useState(false);
  const [showStartNext, setShowStartNext] = useState(false);
  const [roundIntroClass, setRoundIntroClass] = useState(false);
  const [timerCircleDisplay, setTimerCircleDisplay] = useState('');
  const [disputeLabel, setDisputeLabel] = useState(false);
  const [timerText, setTimerText] = useState('—');
  const [roomToggleDisabled, setRoomToggleDisabled] = useState(true);
  const [roomToggleLabel, setRoomToggleLabel] = useState('Открыть комнату');
  const [roomToggleClass, setRoomToggleClass] = useState('btn');
  const [chooseQuizDisabled, setChooseQuizDisabled] = useState(true);
  const [startDisabled, setStartDisabled] = useState(true);
  const [startHint, setStartHint] = useState('Нужно хотя бы 1 игрок');

  // DOM refs for imperative stage (media parity)
  const qrRef = useRef<HTMLDivElement>(null);
  const quizBgRef = useRef<HTMLDivElement>(null);
  const playersRef = useRef<HTMLDivElement>(null);
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
  const lbTitleRef = useRef<HTMLHeadingElement>(null);
  const lbSubRef = useRef<HTMLDivElement>(null);
  const lbTop3Ref = useRef<HTMLDivElement>(null);
  const lbListRef = useRef<HTMLDivElement>(null);

  const socketRef = useRef<Socket | null>(null);
  const sessionRef = useRef<HostSession | null>(null);
  const currentRef = useRef({
    sessionId: null as string | null,
    roomCode: null as string | null,
    hostSecret: null as string | null,
    phase: null as string | null,
  });
  const soloRef = useRef<SoloState>(createInitialSoloState());
  const hostGameViewDismissedRef = useRef(false);
  const lastPlayersByIdRef = useRef<Record<string, HostPlayer>>(Object.create(null));
  const hostDisputeOpenRef = useRef(false);
  const phaseTotalMsRef = useRef<number | null>(null);
  const timerCircleLenRef = useRef<number | null>(null);
  const hostStageSeqRef = useRef(0);
  const lastAutoAdvanceKeyRef = useRef('');
  const lastHostQuestionMediaCutKeyRef = useRef('');
  const hostLastQuestionViewRenderKeyRef = useRef('');
  const lastHostStageIdentityRef = useRef('');
  const hostLastTimerKeyRef = useRef('');
  const soloLastTimerKeyRef = useRef('');
  const soloStageUiKeyRef = useRef('');
  const lastSoloAdvanceKeyRef = useRef('');
  const lastDisputeUiRef = useRef(false);
  const hostAudioGateTokenRef = useRef(0);
  const hostVideoSoundUnlockedRef = useRef(false);
  const hostVideoSoundQuestionIdRef = useRef('');
  const lastQuestionRef = useRef<QuestionView | null>(null);
  const quizUiWasHiddenRef = useRef(false);
  const finalBgByQuizIdRef = useRef<Record<string, string | null>>(Object.create(null));
  const finalMusicByQuizIdRef = useRef<Record<string, string | null>>(Object.create(null));
  const coverBgByQuizIdRef = useRef<Record<string, string | null>>(Object.create(null));
  const lastMusicQuestionIdRef = useRef('');
  const lastRoundMusicUrlRef = useRef<string | null>(null);
  const lastRoundLeaderboardMusicUrlRef = useRef<string | null>(null);
  const carryMusicUrlRef = useRef<string | null>(null);
  const carryRemainingRef = useRef(0);
  const bgmRef = useRef<HostBgm | null>(null);
  const timerRingRef = useRef(new SmoothTimerRing());
  const gameMenuRef = useRef<HTMLDivElement>(null);
  const syncStageRef = useRef<() => void>(() => {});
  const soloSyncUiRef = useRef<() => void>(() => {});
  const syncRoomToggleUiRef = useRef<() => void>(() => {});
  const renderPlayersRef = useRef<(p: HostPlayer[]) => void>(() => {});
  const refreshLobbyPlayersRef = useRef<() => void>(() => {});
  const loadSummarySeqRef = useRef(0);
  const wsSessionKeyRef = useRef('');
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const leaveCtlRef = useRef(createHostLeaveController((path) => navigateRef.current(path)));

  useLayoutEffect(() => {
    const ctl = createHostLeaveController((path) => navigateRef.current(path));
    leaveCtlRef.current = ctl;
    return () => ctl.cancel();
  }, []);


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

  const layoutEditor = useStageLayoutEditor({
    soloRef,
    getQuestion: () => soloBuildQuestionView(soloRef.current),
    rerender: () => {
      soloStageUiKeyRef.current = '';
      soloSyncUiRef.current();
    },
    setSoloPausedLabel,
    bgmPause: () => bgmRef.current?.pause(),
    bgmResume: () => bgmRef.current?.resume(),
  });

  const applyQuestionLayout = useCallback(
    (q: QuestionView | null) => {
      if (layoutEditor.editingRef.current) {
        layoutEditor.paintWorking();
        return;
      }
      paintHostStageLayout(q?.stageLayout, q?.id);
      scheduleFitStageAnswers(document.querySelector('#stageCard .stage-center'));
    },
    [layoutEditor],
  );

  useEffect(() => {
    const onFit = () =>
      scheduleFitStageAnswers(document.querySelector('#stageCard .stage-center'));
    window.addEventListener('resize', onFit);
    const node = document.querySelector('#stageCard .stage-center');
    const ro = node ? new ResizeObserver(onFit) : null;
    if (node instanceof HTMLElement) ro?.observe(node);
    return () => {
      window.removeEventListener('resize', onFit);
      ro?.disconnect();
    };
  }, []);

  const paintExplanation = useCallback((q: QuestionView | null, showCorrect: boolean) => {
    if (soloRef.current.on && soloIsRevealPhase(soloRef.current.phase) && !showCorrect) return;
    paintStageExplanation(
      stageExplanationRef.current,
      q,
      showCorrect,
      stageExplanationImageRef.current,
      stageQuestionRef.current,
      stageMediaRef.current,
      stageExplanationVideoRef.current,
    );
    if (showCorrect) {
      syncVideoSoundButton(getStageDom(), q, hostVideoSoundUnlockedRef.current);
    }
  }, [getStageDom]);

  useLayoutEffect(() => {
    const solo = soloRef.current;
    if (!solo.on || !soloIsRevealPhase(solo.phase)) return;
    const qv = soloBuildQuestionView(solo);
    if (layoutEditor.editingRef.current) {
      layoutEditor.paintWorking();
      return;
    }
    paintStageExplanation(
      stageExplanationRef.current,
      qv,
      true,
      stageExplanationImageRef.current,
      stageQuestionRef.current,
      stageMediaRef.current,
      stageExplanationVideoRef.current,
    );
    applyQuestionLayout(qv);
  });

  const getMediaCtrl = useCallback((): StageMediaController => ({
    getAudioGateToken: () => hostAudioGateTokenRef.current,
    bumpAudioGateToken: () => ++hostAudioGateTokenRef.current,
    isVideoSoundUnlocked: () => hostVideoSoundUnlockedRef.current,
    setVideoSoundUnlocked: (v) => {
      hostVideoSoundUnlockedRef.current = v;
    },
    getVideoSoundQuestionId: () => hostVideoSoundQuestionIdRef.current,
    setVideoSoundQuestionId: (id) => {
      hostVideoSoundQuestionIdRef.current = id;
    },
    getLastQuestion: () => lastQuestionRef.current,
    setLastQuestion: (q) => {
      lastQuestionRef.current = q;
    },
    bgm: bgmRef.current!,
    getSessionPhase: () =>
      soloRef.current.on ? soloRef.current.phase : sessionRef.current?.phase,
    notifyListenMediaPlay: () => {
      const ph = soloRef.current.on ? soloRef.current.phase : sessionRef.current?.phase;
      if (
        ph !== 'question' &&
        ph !== 'answer_reveal' &&
        ph !== 'round_summary' &&
        ph !== 'round_replay'
      ) {
        return;
      }
      if (soloRef.current.on) {
        if (ph === 'question') soloHoldQuestionTimer(soloRef.current);
        else soloHoldRevealTimer(soloRef.current);
        return;
      }
      const socket = socketRef.current;
      if (!socket?.connected) return;
      void emitAck(socket, 'host_hold_question_timer', {}, 8000);
    },
    notifyListenMediaEnded: () => {
      const ph = soloRef.current.on ? soloRef.current.phase : sessionRef.current?.phase;
      if (
        ph !== 'question' &&
        ph !== 'answer_reveal' &&
        ph !== 'round_summary' &&
        ph !== 'round_replay'
      ) {
        return;
      }
      if (soloRef.current.on) {
        if (ph === 'question') {
          soloStartQuestionAnswerTimer(soloRef.current);
        } else {
          soloStartRevealTimer(soloRef.current);
        }
        soloSyncUiRef.current();
        return;
      }
      const socket = socketRef.current;
      if (!socket?.connected) return;
      void emitAck(socket, 'host_start_question_timer', {}, 8000);
    },
  }), []);

  const isRoomOpen = useCallback(() => Boolean(sessionRef.current && !sessionRef.current.endedAt), []);

  const shouldHideQuizBecauseRoomClosed = useCallback(
    () => Boolean(sessionRef.current && sessionRef.current.endedAt),
    [],
  );

  const resetMusicState = useCallback(() => {
    lastMusicQuestionIdRef.current = '';
    lastRoundMusicUrlRef.current = null;
    lastRoundLeaderboardMusicUrlRef.current = null;
    carryMusicUrlRef.current = null;
    carryRemainingRef.current = 0;
    bgmRef.current?.stop();
  }, []);

  const applyQuizPreview = useCallback(
    (payload: {
      title?: string;
      background?: string | null;
      fontFamily?: string | null;
      stageTypeStyles?: import('../lib/host/stage-type-styles').StageTypeStyles | null;
      rounds?: Array<{ questions?: unknown[] }>;
    }) => {
      if (!payload) return;
      if (shouldHideQuizBecauseRoomClosed()) return;
      const rounds = payload.rounds || [];
      let questionsCount = 0;
      for (const r of rounds) questionsCount += (r.questions || []).length;
      setQuizTitle(payload.title || 'Квиз');
      setQuizMeta(`${rounds.length} раунд(ов) • ${questionsCount} вопрос(ов)`);
      setQuizSub('Проверьте лобби и ждите игроков');
      applyQuizStageTypography({
        fontFamily: payload.fontFamily,
        stageTypeStyles: payload.stageTypeStyles,
      });
      const bg = payload.background;
      if (bg && String(bg).trim()) {
        const s = String(bg).trim();
        if (s.indexOf('gradient:') === 0) setQuizBgStyle(s.slice('gradient:'.length));
        else setQuizBgStyle(`url("${s.replace(/"/g, '\\"')}")`);
      } else {
        setQuizBgStyle('');
      }
    },
    [shouldHideQuizBecauseRoomClosed],
  );

  const clearQuizPreview = useCallback(() => {
    setQuizTitle('Запуск квиза');
    setQuizMeta('—');
    setQuizSub('Введите quizId или запустите лобби из галереи');
    setQuizBgStyle('');
    clearQuizStageFont();
    clearQuizStageTypeStyles();
  }, []);

  const tryLoadQuizInfo = useCallback(
    (quizId: string) => {
      if (!quizId || !getAccessToken()) return;
      apiFetch<{
        title?: string;
        background?: string | null;
        rounds?: Array<{ questions?: unknown[] }>;
      }>(`/api/quizzes/${encodeURIComponent(quizId)}`, { headers: withAuth({}) })
        .then((data) => applyQuizPreview(data))
        .catch(() => {});
    },
    [applyQuizPreview],
  );

  const updateStartGameAvailability = useCallback(
    (list: HostPlayer[]) => {
      const hasPlayers = Array.isArray(list) && list.length > 0;
      const ph = sessionRef.current?.phase ?? currentRef.current.phase;
      const inLobby = ph === 'lobby' || ph == null;
      const enabled = Boolean(hasPlayers && inLobby && isRoomOpen());
      setStartDisabled(!enabled);
      if (!isRoomOpen()) setStartHint('Комната закрыта — нажмите «Открыть комнату»');
      else if (enabled) setStartHint('Готово к старту');
      else if (!hasPlayers) setStartHint('Нужно хотя бы 1 игрок');
      else setStartHint('Игра уже началась');
    },
    [isRoomOpen],
  );

  const syncHostQuizPanel = useCallback(() => {
    const hide = shouldHideQuizBecauseRoomClosed();
    setHideQuizPanel(hide);
    if (hide) {
      quizUiWasHiddenRef.current = true;
    } else if (quizUiWasHiddenRef.current) {
      quizUiWasHiddenRef.current = false;
      const qQuizId = params.get('quizId');
      const lastQuizId = qQuizId || localStorage.getItem('LAST_QUIZ_ID') || '';
      if (lastQuizId) tryLoadQuizInfo(lastQuizId);
      else clearQuizPreview();
    }
  }, [clearQuizPreview, params, shouldHideQuizBecauseRoomClosed, tryLoadQuizInfo]);

  const syncRoomToggleUi = useCallback(() => {
    try {
      if (!currentRef.current.sessionId || !currentRef.current.hostSecret) {
        setRoomToggleDisabled(true);
        setRoomToggleLabel('…');
        setRoomToggleClass('btn');
        setChooseQuizDisabled(true);
        return;
      }
      if (sessionRef.current == null) {
        setRoomToggleDisabled(true);
        setRoomToggleLabel('Загрузка…');
        setRoomToggleClass('btn');
        setChooseQuizDisabled(true);
        return;
      }
      setRoomToggleDisabled(false);
      if (isRoomOpen()) {
        setRoomToggleLabel('Закрыть комнату');
        setRoomToggleClass('btn bad');
      } else {
        setRoomToggleLabel('Открыть комнату');
        setRoomToggleClass('btn good');
      }
      setChooseQuizDisabled(!isRoomOpen());
      const list = Object.keys(lastPlayersByIdRef.current).map((k) => lastPlayersByIdRef.current[k]);
      updateStartGameAvailability(list);
    } finally {
      syncHostQuizPanel();
    }
  }, [isRoomOpen, syncHostQuizPanel, updateStartGameAvailability]);

  const setStageVisibleUi = useCallback((on: boolean) => {
    setStageVisible(on);
    setLbVisible(false);
    setLobbyVisible(!on);
    setHostQuizViewing(!!on);
  }, []);

  const exitSoloPreview = useCallback(() => {
    setGameMenuOpen(false);
    soloRef.current = createInitialSoloState();
    bgmRef.current?.stop();
    clearViewportRoundBg();
    phaseTotalMsRef.current = null;
    soloLastTimerKeyRef.current = '';
    soloStageUiKeyRef.current = '';
    lastSoloAdvanceKeyRef.current = '';
    paintStageExplanation(
      stageExplanationRef.current,
      null,
      false,
      stageExplanationImageRef.current,
      stageQuestionRef.current,
      stageMediaRef.current,
      stageExplanationVideoRef.current,
    );
    resetTimerRingLength(timerCircleLenRef);
    timerRingRef.current.cancel();
    setDisputeLabel(false);
    setTimerText('—');
    setRoundIntroClass(false);
    setSoloControlsVisible(false);
    setShowStartNext(false);
    setStageVisibleUi(false);
    navigate('/host', { replace: true });
  }, [navigate, setStageVisibleUi]);

  const exitLiveGameView = useCallback(() => {
    setGameMenuOpen(false);
    const ph = sessionRef.current?.phase;
    if (ph && ph !== 'lobby') {
      toast('Игра уже идёт — новые игроки подключатся только в лобби между играми');
    }
    hostGameViewDismissedRef.current = true;
    clearViewportRoundBg();
    bgmRef.current?.stop();
    phaseTotalMsRef.current = null;
    timerCircleLenRef.current = null;
    setDisputeLabel(false);
    setTimerText('—');
    setRoundIntroClass(false);
    setShowStartNext(false);
    setStageVisibleUi(false);
  }, [setStageVisibleUi]);

  const handleExitView = useCallback(() => {
    if (soloRef.current.on) exitSoloPreview();
    else exitLiveGameView();
  }, [exitLiveGameView, exitSoloPreview]);

  const setLeaderboardVisibleUi = useCallback((on: boolean, inQuiz: boolean) => {
    setLbVisible(on);
    setStageVisible(false);
    setLobbyVisible(!on);
    if (on) setHostQuizViewing(!!inQuiz);
  }, []);

  const clearLobbyLinks = useCallback(() => {
    currentRef.current.roomCode = null;
    setRoomCode('—');
    setPlayerUrl('');
    if (qrRef.current) qrRef.current.innerHTML = '';
  }, []);

  const doApplyLobbyLinks = useCallback(async (code: string) => {
    currentRef.current.roomCode = code || null;
    setRoomCode(code || '—');
    await applyLobbyLinks({
      roomCode: code,
      setRoomCodeText: (c) => setRoomCode(c || '—'),
      setPlayerUrl: (u) => setPlayerUrl(u),
      qrEl: qrRef.current,
      getCurrentRoomCode: () => currentRef.current.roomCode,
    });
  }, []);

  const renderPlayersUi = useCallback(
    (incoming: HostPlayer[]) => {
      const unique: HostPlayer[] = [];
      const seen: Record<string, boolean> = Object.create(null);
      for (const p of incoming || []) {
        if (!p?.id || seen[p.id]) continue;
        seen[p.id] = true;
        unique.push(p);
      }
      const nextById: Record<string, HostPlayer> = Object.create(null);
      unique.forEach((p) => {
        nextById[p.id] = p;
      });
      setPlayers(unique);
      lastPlayersByIdRef.current = nextById;
      updateStartGameAvailability(unique);
    },
    [updateStartGameAvailability],
  );

  const refreshLobbyPlayers = useCallback(async () => {
    const sid = currentRef.current.sessionId;
    if (!sid || soloRef.current.on) return;
    if (sessionRef.current?.endedAt) return;
    try {
      const res = await loadPlayers(sid);
      renderPlayersUi(res.players || []);
    } catch {
      /* REST fallback is best-effort */
    }
  }, [renderPlayersUi]);

  const kickPlayer = useCallback(async (pid: string) => {
    const socket = socketRef.current;
    if (!socket) return toast('WS не подключён');
    const { err, res } = await emitAck(socket, 'host_kick_player', { playerId: pid }, 8000);
    if (err) return toast('kick timeout/error');
    toast((res as { ok?: boolean })?.ok ? 'Игрок отключён' : 'Не удалось отключить');
  }, []);

  const setVipPlayer = useCallback(async (pid: string) => {
    const socket = socketRef.current;
    if (!socket) return toast('WS не подключён');
    const { err, res } = await emitAck(socket, 'host_set_vip', { playerId: pid }, 8000);
    if (err) return toast('VIP timeout/error');
    if (!(res as { ok?: boolean })?.ok) toast('Не удалось назначить VIP');
  }, []);

  const toggleHostPause = useCallback(async () => {
    const socket = socketRef.current;
    if (!socket) return toast('WS не подключён');
    const { err, res } = await emitAck(socket, 'host_toggle_pause', {}, 8000);
    if (err) return toast('pause timeout/error');
    if (!(res as { ok?: boolean })?.ok) toast('Не удалось переключить паузу');
  }, []);

  const showHostTimerCircle = useCallback(() => {
    resetTimerRingLength(timerCircleLenRef);
    timerRingRef.current.cancel();
    setTimerCircleDisplay('');
    const timerCircleEl = document.querySelector('.timer-circle') as HTMLElement | null;
    if (timerCircleEl) timerCircleEl.style.display = '';
  }, []);

  const syncHostTimerRing = useCallback(() => {
    const solo = soloRef.current;
    const sess = sessionRef.current;
    const soloPaused = solo.on && solo.paused;
    const paused = soloPaused || (!solo.on && !!sess?.isPaused);
    const ms = solo.on
      ? soloPaused && typeof solo.pausedRemainingMs === 'number'
        ? solo.pausedRemainingMs
        : remainingMs(solo.phaseDeadlineAt)
      : paused && typeof sess?.pausedRemainingMs === 'number'
        ? sess.pausedRemainingMs
        : remainingMs(sess?.phaseDeadlineAt);
    const dLabel =
      !solo.on && !paused && sess?.phase === 'answer_reveal' && hostDisputeOpenRef.current;
    if (solo.on && solo.phaseDeadlineAt && soloDrivesStageTimer(solo.phase)) {
      const soloTimerKey = `${solo.phase}|${solo.phaseDeadlineAt}`;
      if (soloLastTimerKeyRef.current !== soloTimerKey) {
        soloLastTimerKeyRef.current = soloTimerKey;
        const rem = remainingMs(solo.phaseDeadlineAt);
        if (rem != null && rem > 0) phaseTotalMsRef.current = rem;
      }
    }

    const progress = timerCircleProgressRef.current;
    const len = ensureTimerRingLength(progress, timerCircleLenRef);
    const total = phaseTotalMsRef.current;

    if (solo.on) {
      timerRingRef.current.cancel();
      if (progress) {
        progress.style.transition = 'none';
        if (dLabel || ms == null || !total || !len) {
          progress.style.strokeDashoffset = String(len || 0);
        } else {
          progress.style.strokeDashoffset = String(timerRingDashoffset(len, ms, total));
        }
      }
      return;
    }

    timerRingRef.current.sync({
      progress,
      len,
      remainingMs: ms,
      totalMs: total,
      paused: paused || !!dLabel,
      hide: !!dLabel,
      animKey: paused
        ? `pause:${ms ?? ''}|${total || 0}`
        : `run:${sess?.phaseDeadlineAt || ''}|${total || 0}`,
    });
  }, []);

  const soloSyncUi = useCallback(() => {
    const solo = soloRef.current;
    hostGameViewDismissedRef.current = false;
    setLobbyVisible(false);
    setSoloControlsVisible(true);
    setSoloBackEnabled(soloCanBack(solo));
    setHostQuizViewing(true);
    setShowStartNext(false);

    const r = soloCurrentRound(solo);
    const qv = soloBuildQuestionView(solo);
    if (!r || !qv) return;

    const uiKey = soloStageUiKey(solo);
    if (soloStageUiKeyRef.current === uiKey) {
      syncHostTimerRing();
      return;
    }
    soloStageUiKeyRef.current = uiKey;

    try {
      const bg = (qv.roundBackgroundUrl || '').trim();
      if (bg) applyViewportRoundBg(bg);
      else clearViewportRoundBg();
    } catch {
      /* ignore */
    }

    try {
      if (solo.phase === 'leaderboard') {
        bgmRef.current?.play(
          (qv.roundLeaderboardMusicUrl || '').trim() || (qv.roundMusicUrl || '').trim(),
        );
      } else if (solo.phase === 'finished') bgmRef.current?.play('');
      else {
        bgmRef.current?.play(
          (qv.questionMusicUrl || '').trim() || (qv.roundMusicUrl || '').trim(),
        );
      }
    } catch {
      /* ignore */
    }

    if (solo.phase === 'leaderboard') {
      setLeaderboardVisibleUi(true, true);
      renderLeaderboardDom(
        {
          lbTitle: lbTitleRef.current,
          lbSub: lbSubRef.current,
          lbTop3: lbTop3Ref.current,
          lbList: lbListRef.current,
        },
        { kind: 'round', rows: [] },
      );
      phaseTotalMsRef.current = null;
      setTimerCircleDisplay('none');
      const timerCircleEl = document.querySelector('.timer-circle') as HTMLElement | null;
      if (timerCircleEl) timerCircleEl.style.display = 'none';
      if (stageQuestionRef.current) stageQuestionRef.current.textContent = '';
      setStageMeta(stageMetaRef.current, null);
      if (stageAnswersRef.current) stageAnswersRef.current.innerHTML = '';
      paintExplanation(null, false);
      return;
    }
    if (solo.phase === 'finished') {
      setLeaderboardVisibleUi(true, false);
      renderLeaderboardDom(
        {
          lbTitle: lbTitleRef.current,
          lbSub: lbSubRef.current,
          lbTop3: lbTop3Ref.current,
          lbList: lbListRef.current,
        },
        { kind: 'final', rows: [] },
      );
      phaseTotalMsRef.current = null;
      setTimerCircleDisplay('none');
      const timerCircleEl = document.querySelector('.timer-circle') as HTMLElement | null;
      if (timerCircleEl) timerCircleEl.style.display = 'none';
      if (stageQuestionRef.current) stageQuestionRef.current.textContent = '';
      setStageMeta(stageMetaRef.current, null);
      if (stageAnswersRef.current) stageAnswersRef.current.innerHTML = '';
      paintExplanation(null, false);
      return;
    }

    setStageVisibleUi(true);
    setRoundIntroClass(isStageIntroPhase(solo.phase));
    const timerCircleEl = document.querySelector('.timer-circle') as HTMLElement | null;

    if (isStageIntroPhase(solo.phase)) {
      const isQuizIntro = solo.phase === 'quiz_intro';
      phaseTotalMsRef.current =
        (isQuizIntro ? qv.quizIntroSec || 6 : qv.roundIntroSec || 6) * 1000;
      clearStageMediaPreserveSoundBtn(getStageDom());
      syncVideoSoundButton(getStageDom(), null, hostVideoSoundUnlockedRef.current);
      paintIntroStage(
        {
          stageQuestion: stageQuestionRef.current,
          stageMeta: stageMetaRef.current,
          stageAnswers: stageAnswersRef.current,
        },
        {
          phase: solo.phase,
          q: qv,
          quizId: solo.quizId,
          editing: layoutEditor.editingRef.current,
          paintWorking: () => layoutEditor.paintWorking(),
        },
      );
      paintExplanation(null, false);
      setTimerCircleDisplay('none');
      if (timerCircleEl) timerCircleEl.style.display = 'none';
      return;
    }
    if (solo.phase === 'question_read') {
      phaseTotalMsRef.current = (qv.readTimeSec || 3) * 1000;
      showHostTimerCircle();
      renderStageQuestion(getStageDom(), getMediaCtrl(), qv, false, 'question_read', hostMediaMode(solo.on));
      applyQuestionLayout(qv);
      syncHostTimerRing();
      return;
    }
    if (solo.phase === 'question') {
      phaseTotalMsRef.current = (qv.timeLimitSec || 15) * 1000;
      showHostTimerCircle();
      renderStageQuestion(getStageDom(), getMediaCtrl(), qv, false, 'question', hostMediaMode(solo.on));
      applyQuestionLayout(qv);
      syncHostTimerRing();
      return;
    }
    if (solo.phase === 'answer_reveal' || solo.phase === 'round_summary') {
      const summaryMs = (qv.roundSummarySec || 2) * 1000;
      const remaining = remainingMs(solo.phaseDeadlineAt);
      phaseTotalMsRef.current = remaining != null && remaining > 0 ? remaining : summaryMs;
      showHostTimerCircle();
      setStageMeta(
        stageMetaRef.current,
        solo.phase === 'round_summary'
          ? 'Итоги раунда: правильные ответы'
          : 'Правильный ответ',
      );
      renderStageQuestion(
        getStageDom(),
        getMediaCtrl(),
        qv,
        true,
        solo.phase,
        hostMediaMode(solo.on),
      );
      applyQuestionLayout(qv);
      syncHostTimerRing();
      return;
    }
  }, [
    paintExplanation,
    getMediaCtrl,
    getStageDom,
    setLeaderboardVisibleUi,
    setStageVisibleUi,
    showHostTimerCircle,
    syncHostTimerRing,
    applyQuestionLayout,
  ]);

  const syncStage = useCallback(() => {
    if (soloRef.current.on) return;
    const sess = sessionRef.current;
    if (!sess) return;
    if (sess.endedAt) {
      hostGameViewDismissedRef.current = false;
      clearViewportRoundBg();
      resetMusicState();
      setLeaderboardVisibleUi(false, false);
      setStageVisibleUi(false);
      setShowStartNext(false);
      paintExplanation(null, false);
      return;
    }
    const seq = ++hostStageSeqRef.current;
    const ph = sess.phase;
    if (ph === 'lobby' || ph == null) {
      hostGameViewDismissedRef.current = false;
      setLeaderboardVisibleUi(false, false);
      setStageVisibleUi(false);
      setShowStartNext(false);
      clearViewportRoundBg();
      resetMusicState();
      paintExplanation(null, false);
      return;
    }
    if (hostGameViewDismissedRef.current) return;

    const isStage =
      ph === 'quiz_intro' ||
      ph === 'round_intro' ||
      ph === 'question_read' ||
      ph === 'question' ||
      ph === 'answer_reveal' ||
      ph === 'round_replay' ||
      ph === 'round_summary';

    if (ph === 'leaderboard' || ph === 'finished') {
      if (ph === 'finished') {
        try {
          const qid = sess.quizId ? String(sess.quizId) : '';
          if (!qid) {
            clearViewportRoundBg();
            bgmRef.current?.play('');
          } else if (finalBgByQuizIdRef.current[qid] !== undefined) {
            if (finalBgByQuizIdRef.current[qid]) applyViewportRoundBg(finalBgByQuizIdRef.current[qid]!);
            else clearViewportRoundBg();
            if (finalMusicByQuizIdRef.current[qid] !== undefined) {
              bgmRef.current?.play(finalMusicByQuizIdRef.current[qid] || '');
            }
          } else {
            apiFetch<{
              background?: string;
              finalMusic?: string;
              fontFamily?: string | null;
              stageTypeStyles?: import('../lib/host/stage-type-styles').StageTypeStyles | null;
            }>(
              `/api/quizzes/public/${encodeURIComponent(qid)}`,
            )
              .then((d) => {
                const bg = d?.background ? String(d.background).trim() : '';
                finalBgByQuizIdRef.current[qid] = bg || null;
                if (bg) applyViewportRoundBg(bg);
                else clearViewportRoundBg();
                applyQuizStageTypography({
                  fontFamily: d?.fontFamily,
                  stageTypeStyles: d?.stageTypeStyles,
                });
                const fm = d?.finalMusic ? String(d.finalMusic).trim() : '';
                finalMusicByQuizIdRef.current[qid] = fm || null;
                bgmRef.current?.play(fm || '');
              })
              .catch(() => {
                finalBgByQuizIdRef.current[qid] = null;
                finalMusicByQuizIdRef.current[qid] = null;
                clearViewportRoundBg();
                bgmRef.current?.play('');
              });
          }
        } catch {
          clearViewportRoundBg();
          bgmRef.current?.play('');
        }
      }
      if (ph === 'leaderboard') {
        const lbm = (lastRoundLeaderboardMusicUrlRef.current || '').trim();
        const rm = (lastRoundMusicUrlRef.current || '').trim();
        bgmRef.current?.play(lbm || rm || '');
      }
      setLeaderboardVisibleUi(true, ph === 'leaderboard');
      const socket = socketRef.current;
      if (socket) {
        const kind = ph === 'finished' ? 'final' : 'round';
        socket.timeout(8000).emit(
          'leaderboard_view',
          { kind },
          (err: Error | null, res: LeaderboardPayload) => {
            if (err) return;
            if (res?.ok !== false) {
              renderLeaderboardDom(
                {
                  lbTitle: lbTitleRef.current,
                  lbSub: lbSubRef.current,
                  lbTop3: lbTop3Ref.current,
                  lbList: lbListRef.current,
                },
                res,
              );
            }
          },
        );
      }
      setShowStartNext(ph === 'finished');
      paintExplanation(null, false);
      return;
    }

    if (isStage) {
      setStageVisibleUi(true);
      const mediaMode = hostMediaMode(soloRef.current.on);
      const applyQuestion = (q: QuestionView) => {
        setRoundIntroClass(isStageIntroPhase(ph));
        const qidStr0 = String(q.id || '');
        const hostSkipDupStageMusic =
          (ph === 'question_read' &&
            hostLastQuestionViewRenderKeyRef.current === `question_read|${qidStr0}`) ||
          (ph === 'question' && hostLastQuestionViewRenderKeyRef.current === `question|${qidStr0}`);

        if (!hostSkipDupStageMusic) {
          try {
            lastRoundMusicUrlRef.current = q.roundMusicUrl || null;
            lastRoundLeaderboardMusicUrlRef.current = q.roundLeaderboardMusicUrl || null;
            const qidNow = q.id ? String(q.id) : '';
            const qMusic = (q.questionMusicUrl || '').trim();
            const carry = Number(q.questionMusicCarry || 0);

            if (qMusic) {
              bgmRef.current?.play(qMusic);
              carryMusicUrlRef.current = null;
              carryRemainingRef.current = 0;
              if (Number.isFinite(carry) && carry > 0) {
                carryMusicUrlRef.current = qMusic;
                carryRemainingRef.current = Math.floor(carry);
              }
              lastMusicQuestionIdRef.current = qidNow;
            } else {
              let usedCarry = false;
              if (carryMusicUrlRef.current && carryRemainingRef.current > 0) {
                bgmRef.current?.play(carryMusicUrlRef.current);
                usedCarry = true;
              } else {
                bgmRef.current?.play((lastRoundMusicUrlRef.current || '').trim());
              }
              if (usedCarry && qidNow && qidNow !== lastMusicQuestionIdRef.current) {
                carryRemainingRef.current = Math.max(0, (carryRemainingRef.current || 0) - 1);
                lastMusicQuestionIdRef.current = qidNow;
                if (carryRemainingRef.current === 0) carryMusicUrlRef.current = null;
              } else if (qidNow && qidNow !== lastMusicQuestionIdRef.current) {
                lastMusicQuestionIdRef.current = qidNow;
              }
            }
          } catch {
            /* ignore */
          }
        }

        try {
          const ridBg = (q.roundBackgroundUrl || '').trim();
          if (ridBg) applyViewportRoundBg(ridBg);
          else {
            const qid = sess.quizId ? String(sess.quizId) : '';
            if (!qid) clearViewportRoundBg();
            else if (coverBgByQuizIdRef.current[qid] !== undefined) {
              if (coverBgByQuizIdRef.current[qid]) {
                applyViewportRoundBg(coverBgByQuizIdRef.current[qid]!);
              } else clearViewportRoundBg();
            } else {
              apiFetch<{
                background?: string;
                fontFamily?: string | null;
                stageTypeStyles?: import('../lib/host/stage-type-styles').StageTypeStyles | null;
              }>(
                `/api/quizzes/public/${encodeURIComponent(qid)}`,
              )
                .then((d) => {
                  const bg = d?.background ? String(d.background).trim() : '';
                  coverBgByQuizIdRef.current[qid] = bg || null;
                  applyQuizStageTypography({
                    fontFamily: d?.fontFamily,
                    stageTypeStyles: d?.stageTypeStyles,
                  });
                  try {
                    const phase = sessionRef.current?.phase;
                    if (
                      phase === 'question' ||
                      phase === 'question_read' ||
                      isStageIntroPhase(phase) ||
                      phase === 'answer_reveal' ||
                      phase === 'round_summary' ||
                      phase === 'round_replay'
                    ) {
                      if (!(q.roundBackgroundUrl || '').trim() && bg) applyViewportRoundBg(bg);
                    }
                  } catch {
                    /* ignore */
                  }
                })
                .catch(() => {
                  coverBgByQuizIdRef.current[qid] = null;
                  clearViewportRoundBg();
                });
            }
          }
        } catch {
          clearViewportRoundBg();
        }

        const timerCircleEl = document.querySelector('.timer-circle') as HTMLElement | null;
        const timerKey = `${ph}|${qidStr0}|${String(sess.phaseDeadlineAt || '')}`;
        if (hostLastTimerKeyRef.current !== timerKey) {
          hostLastTimerKeyRef.current = timerKey;
          if (ph === 'quiz_intro') phaseTotalMsRef.current = (q.quizIntroSec || 6) * 1000;
          else if (ph === 'round_intro') phaseTotalMsRef.current = (q.roundIntroSec || 0) * 1000;
          else if (ph === 'question_read') phaseTotalMsRef.current = (q.readTimeSec || 0) * 1000;
          else if (ph === 'question') phaseTotalMsRef.current = (q.timeLimitSec || 0) * 1000;
          else if (ph === 'answer_reveal' && sess.phaseDeadlineAt) {
            phaseTotalMsRef.current = Math.max(
              100,
              new Date(sess.phaseDeadlineAt).getTime() - Date.now(),
            );
          } else {
            phaseTotalMsRef.current = (q.roundSummarySec || 2) * 1000;
          }
        }

        const hrk = `${ph}|${qidStr0}`;
        if (isStageIntroPhase(ph)) {
          hostLastQuestionViewRenderKeyRef.current = '';
          if (stageMediaRef.current) clearStageMediaPreserveSoundBtn(getStageDom());
          paintIntroStage(
            {
              stageQuestion: stageQuestionRef.current,
              stageMeta: stageMetaRef.current,
              stageAnswers: stageAnswersRef.current,
            },
            {
              phase: ph,
              q,
              quizId: sess.quizId ? String(sess.quizId) : undefined,
              editing: layoutEditor.editingRef.current,
              paintWorking: () => layoutEditor.paintWorking(),
            },
          );
          paintExplanation(null, false);
          setTimerCircleDisplay('none');
          if (timerCircleEl) timerCircleEl.style.display = 'none';
          return;
        }

        setTimerCircleDisplay('');
        if (timerCircleEl) timerCircleEl.style.display = '';
        const showCorrect =
          ph === 'answer_reveal' || ph === 'round_replay' || ph === 'round_summary';
        paintExplanation(q, showCorrect);
        if (hostLastQuestionViewRenderKeyRef.current !== hrk) {
          if (ph === 'question_read') {
            renderStageQuestion(getStageDom(), getMediaCtrl(), q, false, 'question_read', mediaMode);
          } else if (ph === 'question') {
            try {
              stageQuestionRef.current?.classList.remove('stage-title');
              stageQuestionRef.current?.classList.add('stage-q');
            } catch {
              /* ignore */
            }
            renderStageQuestion(getStageDom(), getMediaCtrl(), q, false, 'question', mediaMode);
          } else if (ph === 'answer_reveal') {
            setStageMeta(stageMetaRef.current, 'Правильный ответ');
            renderStageQuestion(getStageDom(), getMediaCtrl(), q, true, undefined, mediaMode);
          } else if (ph === 'round_replay' || ph === 'round_summary') {
            setStageMeta(stageMetaRef.current, 'Итоги раунда: правильные ответы');
            renderStageQuestion(getStageDom(), getMediaCtrl(), q, true, undefined, mediaMode);
          }
          hostLastQuestionViewRenderKeyRef.current = hrk;
        }
        applyQuestionLayout(q);
      };

      const cached = lastQuestionRef.current;
      const wantId = sess.currentQuestionId ? String(sess.currentQuestionId) : '';
      if (cached && wantId && String(cached.id || '') === wantId) {
        applyQuestion(cached);
        return;
      }

      paintExplanation(null, false);
      if (stageAnswersRef.current) stageAnswersRef.current.innerHTML = '';
      clearStageMediaPreserveSoundBtn(getStageDom());
      const socket = socketRef.current;
      if (socket) {
        socket.timeout(8000).emit(
          'question_view',
          {},
          (err: Error | null, res: { question?: QuestionView }) => {
            if (seq !== hostStageSeqRef.current) return;
            if (err) return;
            if (!res?.question) return;
            applyQuestion(res.question);
          },
        );
      }
    } else {
      setLeaderboardVisibleUi(false, false);
      setShowStartNext(false);
      setStageVisibleUi(false);
      clearViewportRoundBg();
      hostLastQuestionViewRenderKeyRef.current = '';
      renderStageQuestion(getStageDom(), getMediaCtrl(), null, false, undefined, hostMediaMode(soloRef.current.on));
      paintExplanation(null, false);
      phaseTotalMsRef.current = null;
      resetMusicState();
    }
  }, [paintExplanation, getMediaCtrl, getStageDom, resetMusicState, setLeaderboardVisibleUi, setStageVisibleUi, applyQuestionLayout]);

  // keep refs fresh
  useEffect(() => {
    syncStageRef.current = syncStage;
    soloSyncUiRef.current = soloSyncUi;
    syncRoomToggleUiRef.current = syncRoomToggleUi;
    renderPlayersRef.current = renderPlayersUi;
    refreshLobbyPlayersRef.current = () => {
      void refreshLobbyPlayers();
    };
  }, [syncStage, syncRoomToggleUi, renderPlayersUi, refreshLobbyPlayers, soloSyncUi]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    setHostPausedLabel(session?.isPaused ? 'Продолжить' : 'Пауза');
  }, [session?.isPaused]);

  const disconnectSocket = useCallback(() => {
    try {
      socketRef.current?.disconnect();
    } catch {
      /* ignore */
    }
    socketRef.current = null;
    wsSessionKeyRef.current = '';
    lastHostStageIdentityRef.current = '';
    hostLastTimerKeyRef.current = '';
    setWsConnected(false);
  }, []);

  const connectWs = useCallback(() => {
    const sid = currentRef.current.sessionId;
    const hs = currentRef.current.hostSecret;
    if (!sid || !hs) return;
    const wsKey = `${sid}:${hs}`;
    if (socketRef.current?.connected && wsSessionKeyRef.current === wsKey) {
      refreshLobbyPlayersRef.current();
      return;
    }
    wsSessionKeyRef.current = wsKey;
    disconnectSocket();
    wsSessionKeyRef.current = wsKey;

    const socket = createHostSocket(sid, hs, {
      onWsStatus: setWsConnected,
      onConnect: () => refreshLobbyPlayersRef.current(),
      onSession: (s) => {
        const prev = sessionRef.current;
        sessionRef.current = s;
        currentRef.current.phase = s?.phase ?? null;
        if (s?.roomCode && s.roomCode !== prev?.roomCode) void doApplyLobbyLinks(s.roomCode);
        if (hostUiSessionChanged(prev, s)) setSession(s);
        if (!s?.endedAt && (s?.phase === 'lobby' || s?.phase == null)) {
          hostGameViewDismissedRef.current = false;
          void refreshLobbyPlayersRef.current();
        }
      },
      onPlayers: (p) => renderPlayersRef.current(p),
      onDisputeOpen: (open) => {
        hostDisputeOpenRef.current = open;
        setDisputeLabel(open);
      },
      onSessionAbandoned: () => {
        const next = Object.assign({}, sessionRef.current || {}, {
          endedAt: new Date().toISOString(),
        }) as HostSession;
        sessionRef.current = next;
        setSession(next);
        currentRef.current.phase = 'lobby';
        lastPlayersByIdRef.current = Object.create(null);
        renderPlayersRef.current([]);
        clearLobbyLinks();
        disconnectSocket();
        syncStageRef.current();
        syncRoomToggleUiRef.current();
      },
      onSyncStage: () => {
        if (soloRef.current.on) return;
        const s = sessionRef.current;
        const id = hostStageIdentity(s);
        if (id && id === lastHostStageIdentityRef.current) return;
        lastHostStageIdentityRef.current = id;
        syncStageRef.current();
      },
      onRoomUi: () => syncRoomToggleUiRef.current(),
      onSessionReady: () => refreshLobbyPlayersRef.current(),
      onStageVideoToggle: () => applyStageVideoToggle(getStageDom()),
    });
    socketRef.current = socket;
  }, [clearLobbyLinks, disconnectSocket, doApplyLobbyLinks]);

  const loadHostSummaryThenConnect = useCallback(() => {
    const sid = currentRef.current.sessionId;
    const hs = currentRef.current.hostSecret;
    if (!sid || !hs) return;
    const seq = ++loadSummarySeqRef.current;
    hostGameViewDismissedRef.current = false;
    sessionRef.current = null;
    lastHostStageIdentityRef.current = '';
    hostLastTimerKeyRef.current = '';
    setSession(null);
    syncRoomToggleUi();
    loadHostSummary(sid, hs)
      .then((data) => {
        if (seq !== loadSummarySeqRef.current) return;
        sessionRef.current = data.session;
        setSession(data.session);
        currentRef.current.phase = data.session?.phase ?? null;
        if (data.session?.roomCode) void doApplyLobbyLinks(data.session.roomCode);
        syncRoomToggleUi();
        syncStageRef.current();
        if (data.session && !data.session.endedAt) {
          void refreshLobbyPlayers();
          connectWs();
        } else {
          setWsConnected(false);
          renderPlayersUi([]);
        }
      })
      .catch((e: Error) => {
        if (seq !== loadSummarySeqRef.current) return;
        toast(e.message || 'Не удалось загрузить комнату');
        sessionRef.current = null;
        setSession(null);
        syncRoomToggleUi();
      });
  }, [connectWs, doApplyLobbyLinks, renderPlayersUi, syncRoomToggleUi, refreshLobbyPlayers]);

  const startSoloFromQuizId = useCallback(
    (quizId: string) => {
      if (!quizId) return toast('Не найден quizId');
      if (!getAccessToken()) {
        toast('Нужен вход — откроется страница входа.');
        navigate(`/login?next=${encodeURIComponent('/host' + (window.location.search || ''))}`);
        return;
      }
      const soloUrl = `/host?solo=1&quizId=${encodeURIComponent(quizId)}`;
      if (`${window.location.pathname}${window.location.search}` !== soloUrl) {
        navigate(soloUrl, { replace: true });
      }
      disconnectSocket();
      sessionRef.current = null;
      setSession(null);
      currentRef.current.sessionId = null;
      currentRef.current.hostSecret = null;
      currentRef.current.phase = null;
      const solo = soloRef.current;
      solo.on = true;
      solo.quizId = String(quizId);
      solo.roundIdx = 0;
      solo.questionIdx = 0;
      soloSetPhase(solo, 'quiz_intro');
      solo.phaseDeadlineAt = null;
      soloLastTimerKeyRef.current = '';
      soloStageUiKeyRef.current = '';
      lastSoloAdvanceKeyRef.current = '';
      paintStageExplanation(
        stageExplanationRef.current,
        null,
        false,
        stageExplanationImageRef.current,
        stageQuestionRef.current,
        stageMediaRef.current,
        stageExplanationVideoRef.current,
      );
      resetTimerRingLength(timerCircleLenRef);
      timerRingRef.current.cancel();
      apiFetch(`/api/quizzes/${encodeURIComponent(quizId)}`, { headers: withAuth({}) })
        .then((data) => {
          solo.payload = data as SoloState['payload'];
          const quizData = data as {
            fontFamily?: string | null;
            stageTypeStyles?: import('../lib/host/stage-type-styles').StageTypeStyles | null;
            introSec?: number | null;
          };
          applyQuizStageTypography({
            fontFamily: quizData.fontFamily,
            stageTypeStyles: quizData.stageTypeStyles,
          });
          const quizIntroSec =
            Number.isFinite(Number(quizData.introSec)) && Number(quizData.introSec) > 0
              ? Math.floor(Number(quizData.introSec))
              : Number(solo.payload?.introSec || 6);
          soloSetDeadline(solo, quizIntroSec * 1000);
          soloSyncUi();
          syncHostTimerRing();
        })
        .catch((e: Error) => {
          solo.on = false;
          toast(e?.message || 'Не удалось загрузить квиз');
        });
    },
    [disconnectSocket, navigate, soloSyncUi, syncHostTimerRing],
  );

  const onSoloPreview = useCallback(() => {
    const quizId = resolveHostQuizId(params, sessionRef.current);
    if (!quizId) {
      toast('Сначала выберите квиз для комнаты');
      return;
    }
    startSoloFromQuizId(quizId);
  }, [params, startSoloFromQuizId]);

  // BGM + body theme (once per mount)
  useEffect(() => {
    bgmRef.current = new HostBgm();
    try {
      stageQuestionRef.current?.classList.add('stage-q');
      stageMetaRef.current?.classList.add('stage-meta');
      lbTitleRef.current?.classList.add('stage-q', 'stage-lb-title');
      lbSubRef.current?.classList.add('stage-meta', 'stage-lb-sub');
    } catch {
      /* ignore */
    }
    return () => {
      bgmRef.current?.dispose();
      bgmRef.current = null;
      setHostQuizViewing(false);
      clearViewportRoundBg();
    };
  }, []);

  useEffect(() => {
    return () => {
      disconnectSocket();
    };
  }, [disconnectSocket]);

  // Boot: session / solo / timer for current query
  useEffect(() => {
    const qQuizId = params.get('quizId');
    const qSid = params.get('sessionId');
    const qHs = params.get('hostSecret');
    const qRc = params.get('roomCode');
    const soloFlag = params.get('solo');

    setWsConnected(false);
    clearQuizPreview();

    if (qQuizId) tryLoadQuizInfo(qQuizId);

    if (soloFlag !== '1') {
      if (qSid && qHs) {
        hostGameViewDismissedRef.current = false;
        currentRef.current.sessionId = qSid;
        currentRef.current.hostSecret = qHs;
        setSessionId(qSid);
        setHostSecret(qHs);
        if (qRc) void doApplyLobbyLinks(qRc);
        loadHostSummaryThenConnect();
      } else {
        const lastQuizId = qQuizId || localStorage.getItem('LAST_QUIZ_ID') || '';
        if (lastQuizId && !qQuizId) tryLoadQuizInfo(lastQuizId);
        const lastSid = localStorage.getItem('LAST_SESSION_ID') || '';
        const lastHs = localStorage.getItem('LAST_HOST_SECRET') || '';
        const lastRc = localStorage.getItem('LAST_ROOM_CODE') || '';
        if (lastSid && lastHs) {
          hostGameViewDismissedRef.current = false;
          currentRef.current.sessionId = lastSid;
          currentRef.current.hostSecret = lastHs;
          setSessionId(lastSid);
          setHostSecret(lastHs);
          if (lastRc) void doApplyLobbyLinks(lastRc);
          loadHostSummaryThenConnect();
        } else {
          syncRoomToggleUi();
        }
      }
    } else {
      syncRoomToggleUi();
    }

    let soloTimer: number | undefined;
    if (soloFlag === '1' && qQuizId) {
      soloTimer = window.setTimeout(() => startSoloFromQuizId(qQuizId), 50);
    } else {
      setSoloControlsVisible(false);
      if (!soloRef.current.on) {
        const sess = sessionRef.current;
        const liveStage =
          sess &&
          !sess.endedAt &&
          sess.phase &&
          sess.phase !== 'lobby';
        if (!liveStage) {
          setStageVisible(false);
          setLbVisible(false);
          setLobbyVisible(true);
          setHostQuizViewing(false);
        }
      }
    }

    const onPointerDown = () => {
      try {
        primeHostListenMedia(getStageDom());
        if (!soloRef.current.on) return;
        const sess = sessionRef.current;
        if (!sess || (sess.phase !== 'question' && sess.phase !== 'question_read')) return;
        const dom = getStageDom();
        if (!dom.stageMedia) return;
        const v = dom.stageMedia.querySelector('video');
        if (!(lastQuestionRef.current && (lastQuestionRef.current.videoUrl || '').trim())) return;
        if (v && !hostVideoSoundUnlockedRef.current) {
          hostVideoSoundUnlockedRef.current = true;
          try {
            v.muted = false;
            v.defaultMuted = false;
            v.removeAttribute('muted');
            v.volume = 1;
          } catch {
            /* ignore */
          }
        }
      } catch {
        /* ignore */
      }
    };
    document.addEventListener('pointerdown', onPointerDown, { capture: true, passive: true });

    const timerRing = timerRingRef.current;
    const timerId = window.setInterval(() => {
      const solo = soloRef.current;
      const sess = sessionRef.current;
      if (!sess && !solo.on) {
        paintTimerLabel(timerCircleTextRef.current, '—');
        syncHostTimerRing();
        return;
      }
      const soloPaused = solo.on && solo.paused;
      const paused = soloPaused || (!solo.on && !!sess?.isPaused);
      const ms = solo.on
        ? soloPaused && typeof solo.pausedRemainingMs === 'number'
          ? solo.pausedRemainingMs
          : remainingMs(solo.phaseDeadlineAt)
        : paused && typeof sess?.pausedRemainingMs === 'number'
          ? sess.pausedRemainingMs
          : remainingMs(sess?.phaseDeadlineAt);
      const dLabel =
        !solo.on && !paused && sess?.phase === 'answer_reveal' && hostDisputeOpenRef.current;
      const listenPlaying = hostListenMediaPlaying(getStageDom());
      const nextText = paused || listenPlaying
        ? 'Пауза'
        : dLabel
          ? 'Ведётся оспаривание'
          : ms == null
            ? '—'
            : formatMs(ms);
      paintTimerLabel(timerCircleTextRef.current, nextText);
      if (lastDisputeUiRef.current !== !!dLabel) {
        lastDisputeUiRef.current = !!dLabel;
        setDisputeLabel(!!dLabel);
      }

      if (solo.on) {
        if (!solo.paused && ms != null && ms <= 0 && solo.phaseDeadlineAt) {
          const advKey = `${solo.phase}|${solo.phaseDeadlineAt}`;
          if (advKey !== lastSoloAdvanceKeyRef.current) {
            lastSoloAdvanceKeyRef.current = advKey;
            soloAdvance(solo);
            soloSyncUi();
          }
        }
      }
      if (
        !solo.on &&
        !paused &&
        ms != null &&
        ms <= 0 &&
        !hostDisputeOpenRef.current &&
        sess &&
        !sess.endedAt &&
        sess.phase === 'question'
      ) {
        const mediaCutKey = `${String(sess.id || currentRef.current.sessionId || '')}|q|${String(sess.phaseDeadlineAt || '')}`;
        if (mediaCutKey && mediaCutKey !== lastHostQuestionMediaCutKeyRef.current) {
          lastHostQuestionMediaCutKeyRef.current = mediaCutKey;
          pauseHostMediaQuestionMediaOnly(getStageDom(), getMediaCtrl());
        }
      }
      if (
        !solo.on &&
        !paused &&
        ms != null &&
        ms <= 0 &&
        !hostDisputeOpenRef.current &&
        socketRef.current?.connected &&
        sess &&
        !sess.endedAt
      ) {
        const ph = sess.phase;
        const key = `${String(sess.id || currentRef.current.sessionId || '')}|${String(ph || '')}|${String(sess.phaseDeadlineAt || '')}`;
        if (key && key !== lastAutoAdvanceKeyRef.current) {
          lastAutoAdvanceKeyRef.current = key;
          const sock = socketRef.current;
          if (ph === 'answer_reveal') {
            sock?.timeout(1500).emit('host_proceed_after_reveal', {}, () => {});
          } else if (ph === 'round_summary' || ph === 'round_replay') {
            sock?.timeout(1500).emit('host_continue_round_summary', {}, () => {});
          } else if (ph === 'leaderboard') {
            sock?.timeout(1500).emit('host_continue_leaderboard', {}, () => {});
          }
        }
      }

      syncHostTimerRing();
    }, 100);

    return () => {
      loadSummarySeqRef.current += 1;
      window.clearInterval(timerId);
      timerRing.cancel();
      if (soloTimer) window.clearTimeout(soloTimer);
      document.removeEventListener('pointerdown', onPointerDown, { capture: true } as EventListenerOptions);
      clearViewportRoundBg();
      setHostQuizViewing(false);
    };
    // boot once on mount for this search key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.toString()]);

  useEffect(() => {
    if (!gameMenuOpen) return;
    const onDocPointer = (e: PointerEvent) => {
      if (gameMenuRef.current?.contains(e.target as Node)) return;
      setGameMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setGameMenuOpen(false);
    };
    document.addEventListener('pointerdown', onDocPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDocPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [gameMenuOpen]);

  useEffect(() => {
    if (!stageVisible && !lbVisible) setGameMenuOpen(false);
  }, [stageVisible, lbVisible]);

  useEffect(() => {
    if (!lobbyVisible || soloRef.current.on) return;
    const ph = sessionRef.current?.phase ?? session?.phase;
    if (ph && ph !== 'lobby') return;
    if (!currentRef.current.sessionId || session?.endedAt) return;
    const timerId = window.setInterval(() => {
      void refreshLobbyPlayers();
    }, 4000);
    return () => window.clearInterval(timerId);
  }, [lobbyVisible, session?.phase, session?.endedAt, refreshLobbyPlayers]);

  const closeRoomAndGo = useCallback((path: string) => {
    const sock = socketRef.current;
    const canClose = Boolean(
      currentRef.current.sessionId &&
        currentRef.current.hostSecret &&
        isRoomOpen() &&
        sock,
    );
    leaveCtlRef.current.leave(
      path,
      canClose && sock
        ? (done) => {
            sock.timeout(1500).emit('host_close_room', {}, () => done());
          }
        : null,
    );
  }, [isRoomOpen]);


  const onStartGame = async () => {
    if (!isRoomOpen()) return toast('Сначала откройте комнату');
    if (!socketRef.current) return toast('WS не подключён');
    setStartDisabled(true);
    const { err, res } = await emitAck(socketRef.current, 'host_start_game', {}, 8000);
    if (err) {
      toast('host_start_game timeout/error');
      setStartDisabled(false);
      return;
    }
    if ((res as { ok?: boolean })?.ok) {
      hostGameViewDismissedRef.current = false;
      toast('Игра началась');
    } else {
      toast('Ошибка старта');
      setStartDisabled(false);
    }
  };

  const onRoomToggle = async () => {
    if (!currentRef.current.sessionId || !currentRef.current.hostSecret) {
      return toast('Нет данных комнаты');
    }
    if (sessionRef.current == null) return toast('Загрузка…');
    if (isRoomOpen()) {
      if (!socketRef.current) return toast('WS не подключён');
      setRoomToggleDisabled(true);
      const { err, res } = await emitAck(socketRef.current, 'host_close_room', {}, 8000);
      if (err) {
        setRoomToggleDisabled(false);
        return toast('close timeout/error');
      }
      if (!(res as { ok?: boolean })?.ok) {
        setRoomToggleDisabled(false);
        return toast('Не удалось закрыть комнату');
      }
      const next = Object.assign({}, sessionRef.current || {}, {
        endedAt: new Date().toISOString(),
      }) as HostSession;
      sessionRef.current = next;
      setSession(next);
      disconnectSocket();
      setRoomToggleDisabled(false);
      syncStage();
      lastPlayersByIdRef.current = Object.create(null);
      renderPlayersUi([]);
      clearLobbyLinks();
      syncRoomToggleUi();
      toast('Комната закрыта');
    } else {
      setRoomToggleDisabled(true);
      try {
        const data = await reopenSession(
          currentRef.current.sessionId,
          currentRef.current.hostSecret,
        );
        sessionRef.current = data.session;
        setSession(data.session);
        syncRoomToggleUi();
        connectWs();
        const pl = await loadPlayers(currentRef.current.sessionId);
        renderPlayersUi(pl.players || []);
        toast('Комната открыта — тот же код');
      } catch (e) {
        toast((e as Error).message || 'Не удалось открыть комнату');
      } finally {
        setRoomToggleDisabled(false);
        syncRoomToggleUi();
      }
    }
  };

  const onCopyPlayerUrl = async () => {
    const input = document.getElementById('playerUrl');
    const fromInput = input instanceof HTMLInputElement ? input.value : '';
    const text = String(fromInput || playerUrl || '').trim();
    if (!text || text === '—' || text === '…') {
      toast('Ссылка ещё не готова');
      return;
    }
    const field = input instanceof HTMLInputElement ? input : null;
    let ok = await copyTextToClipboard(text, field);
    if (!ok) ok = await writeTextToServerClipboard(text);
    toast(ok ? 'Скопировано' : 'Не удалось скопировать');
  };

  const onChooseQuiz = () => {
    if (!currentRef.current.sessionId) return toast('Нет активной комнаты');
    if (!isRoomOpen()) return toast('Сначала откройте комнату');
    try {
      localStorage.setItem('LAST_SESSION_ID', currentRef.current.sessionId);
      if (currentRef.current.hostSecret) {
        localStorage.setItem('LAST_HOST_SECRET', currentRef.current.hostSecret);
      }
      if (currentRef.current.roomCode) {
        localStorage.setItem('LAST_ROOM_CODE', currentRef.current.roomCode);
      }
    } catch {
      /* ignore */
    }
    navigate(
      `/quizzes?continueSession=1&sessionId=${encodeURIComponent(currentRef.current.sessionId)}`,
    );
  };

  const returnAllToLobby = async () => {
    setGameMenuOpen(false);
    if (
      !window.confirm(
        'Завершить текущий квиз? Все игроки вернутся в комнату ожидания. Комната останется открытой.',
      )
    ) {
      return;
    }
    if (!currentRef.current.sessionId || !currentRef.current.hostSecret) {
      return toast('Нет данных комнаты');
    }
    if (!isRoomOpen()) return toast('Комната закрыта');
    if (!socketRef.current) return toast('WS не подключён');
    const { err, res } = await emitAck(socketRef.current, 'host_return_to_lobby', {}, 8000);
    if (err) return toast('return_to_lobby timeout/error');
    if (!(res as { ok?: boolean })?.ok) return toast('Не удалось завершить квиз');
    hostGameViewDismissedRef.current = false;
    toast('Квиз завершён — все в комнате ожидания');
  };

  const onStartNextQuiz = () => {
    if (!currentRef.current.sessionId) return toast('Нет активной сессии');
    try {
      localStorage.setItem('LAST_SESSION_ID', currentRef.current.sessionId);
      if (currentRef.current.hostSecret) {
        localStorage.setItem('LAST_HOST_SECRET', currentRef.current.hostSecret);
      }
      if (currentRef.current.roomCode) {
        localStorage.setItem('LAST_ROOM_CODE', currentRef.current.roomCode);
      }
    } catch {
      /* ignore */
    }
    navigate(
      `/quizzes?continueSession=1&sessionId=${encodeURIComponent(currentRef.current.sessionId)}`,
    );
  };

  return (
    <>
      <div id="viewportRoundBg" className="viewport-round-bg" aria-hidden="true" />

      {(stageVisible || lbVisible) && (
        <div className="host-game-menu" ref={gameMenuRef}>
          <button
            type="button"
            className={`host-game-menu__toggle${gameMenuOpen ? ' is-open' : ''}`}
            aria-expanded={gameMenuOpen}
            aria-haspopup="menu"
            aria-label="Меню ведущего"
            onClick={() => setGameMenuOpen((open) => !open)}
          >
            {gameMenuOpen ? '×' : '⋯'}
          </button>
          <div
            id="soloControls"
            className={`host-game-menu__panel${gameMenuOpen ? ' is-open' : ''}`}
            role="menu"
          >
            {soloControlsVisible && (
              <>
                <button
                  className="btn host-game-menu__item"
                  id="btnSoloPause"
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    const solo = soloRef.current;
                    if (!solo.on) return;
                    if (!solo.paused) {
                      solo.paused = true;
                      solo.pausedRemainingMs = remainingMs(solo.phaseDeadlineAt);
                      solo.phaseDeadlineAt = null;
                      bgmRef.current?.pause();
                      setSoloPausedLabel('Продолжить');
                    } else {
                      soloResumeAfterPause(solo);
                      bgmRef.current?.resume();
                      setSoloPausedLabel('Пауза');
                    }
                  }}
                >
                  {soloPausedLabel}
                </button>
                <button
                  className="btn host-game-menu__item"
                  id="btnSoloBack"
                  type="button"
                  role="menuitem"
                  disabled={layoutEditor.editing || !soloBackEnabled}
                  onClick={() => {
                    const solo = soloRef.current;
                    if (!solo.on || layoutEditor.editingRef.current) return;
                    if (!soloCanBack(solo)) return;
                    soloBack(solo);
                    setSoloPausedLabel('Пауза');
                    soloSyncUi();
                  }}
                >
                  Шаг назад
                </button>
                <button
                  className="btn host-game-menu__item"
                  id="btnSoloSkip"
                  type="button"
                  role="menuitem"
                  disabled={layoutEditor.editing}
                  onClick={() => {
                    const solo = soloRef.current;
                    if (!solo.on || layoutEditor.editingRef.current) return;
                    solo.paused = false;
                    solo.pausedRemainingMs = null;
                    solo.phaseDeadlineAt = new Date().toISOString();
                    soloAdvance(solo);
                    soloSyncUi();
                  }}
                >
                  Пропустить таймер
                </button>
                {layoutEditor.canEdit && !layoutEditor.editing && (
                <button
                  className="btn host-game-menu__item"
                  id="btnSoloEditLayout"
                  type="button"
                  role="menuitem"
                  onClick={() => layoutEditor.enter()}
                >
                  Редактировать сцену
                </button>
                )}
                {layoutEditor.editing && (
                  <>
                    <button
                      className="btn host-game-menu__item"
                      id="btnSoloLayoutSave"
                      type="button"
                      role="menuitem"
                      disabled={!layoutEditor.dirty}
                      onClick={() => void layoutEditor.save()}
                    >
                      Сохранить{layoutEditor.applyScope === 'all' ? ' на все экраны' : ''}
                    </button>
                    <button
                      className="btn host-game-menu__item"
                      id="btnSoloLayoutCancel"
                      type="button"
                      role="menuitem"
                      onClick={() => layoutEditor.cancel()}
                    >
                      Отмена
                    </button>
                    <button
                      className="btn host-game-menu__item"
                      id="btnSoloLayoutReset"
                      type="button"
                      role="menuitem"
                      onClick={() => void layoutEditor.reset()}
                    >
                      {layoutEditor.applyScope === 'all' ? 'Сбросить все экраны' : 'Сбросить'}
                    </button>
                  </>
                )}
              </>
            )}
            {!soloControlsVisible && (
              <>
                {session?.phase !== 'finished' && (
                  <button
                    className="btn host-game-menu__item"
                    id="btnHostPause"
                    type="button"
                    role="menuitem"
                    onClick={() => void toggleHostPause()}
                  >
                    {hostPausedLabel}
                  </button>
                )}
                <button
                  className="btn bad host-game-menu__item"
                  id="btnEndQuizForAll"
                  type="button"
                  role="menuitem"
                  onClick={() => void returnAllToLobby()}
                >
                  Завершить квиз
                </button>
              </>
            )}
            {soloControlsVisible && (
              <button
                className="btn host-game-menu__item"
                id="btnSoloExit"
                type="button"
                role="menuitem"
                onClick={handleExitView}
              >
                Выйти из просмотра
              </button>
            )}
          </div>
        </div>
      )}

      <Topbar
        onHomeClick={() => closeRoomAndGo('/')}
        onQuizzesClick={() => closeRoomAndGo('/quizzes')}
      />
      <div className="container">

        <div className="host-shell">
          <div className="host-main">
            <div className="host-timer-corner" id="timerCorner" style={{ display: 'none' }}>
              {timerText}
            </div>

            <div
              className="card host-quiz"
              id="quizCard"
              style={{ display: lobbyVisible ? undefined : 'none' }}
            >
              <div
                className="host-quiz__bg"
                id="quizBg"
                ref={quizBgRef}
                style={{
                  display: hideQuizPanel ? 'none' : undefined,
                  backgroundImage: hideQuizPanel ? undefined : quizBgStyle || undefined,
                }}
              />
              <div className="host-quiz__body">
                <div className="host-quiz__meta">
                  <div
                    className="pill"
                    id="quizMeta"
                    style={{ display: hideQuizPanel ? 'none' : undefined }}
                  >
                    {quizMeta}
                  </div>
                  <div
                    className="pill"
                    id="wsStatus"
                    style={{
                      borderColor: wsConnected
                        ? 'rgba(34,197,94,0.45)'
                        : 'rgba(230,238,252,0.12)',
                      background: wsConnected
                        ? 'rgba(34,197,94,0.10)'
                        : 'rgba(255,255,255,0.05)',
                    }}
                  >
                    WS: {wsConnected ? 'connected' : 'disconnected'}
                  </div>
                </div>
                <h2
                  className="host-quiz__title"
                  id="quizTitle"
                  style={{ display: hideQuizPanel ? 'none' : undefined }}
                >
                  {quizTitle}
                </h2>
                <div
                  className="muted host-quiz__sub"
                  id="quizSub"
                  style={{ display: hideQuizPanel ? 'none' : undefined }}
                >
                  {quizSub}
                </div>
                <div
                  className="muted host-quiz__sub"
                  id="hostRoomClosedHint"
                  style={{ display: hideQuizPanel ? undefined : 'none' }}
                >
                  Комната закрыта — сведения о квизе скрыты. Откройте комнату или выберите квиз в
                  галерее.
                </div>

                <div className="row" style={{ gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                  <button
                    className={roomToggleClass}
                    id="btnRoomToggle"
                    type="button"
                    disabled={roomToggleDisabled}
                    aria-pressed={isRoomOpen()}
                    onClick={() => void onRoomToggle()}
                  >
                    {roomToggleLabel}
                  </button>
                  <button
                    className="btn"
                    id="btnChooseQuiz"
                    type="button"
                    disabled={chooseQuizDisabled}
                    title={chooseQuizDisabled ? 'Сначала откройте комнату' : ''}
                    onClick={onChooseQuiz}
                  >
                    Выбрать квиз
                  </button>
                  <button
                    className="btn"
                    id="btnSoloPreview"
                    type="button"
                    onClick={onSoloPreview}
                  >
                    Соло просмотр
                  </button>
                </div>

                <div className="host-hidden">
                  <div id="sessionId">{sessionId || '—'}</div>
                  <div id="hostSecret">{hostSecret || '—'}</div>
                </div>
              </div>
            </div>

            <div className="card host-join" style={{ display: lobbyVisible ? undefined : 'none' }}>
              <div className="host-join__head">
                <div>
                  <div className="muted">Подключение игроков</div>
                  <div className="host-join__title">Сканируйте QR или введите код</div>
                </div>
                <div className="pill" id="playersCount">
                  {playerCountLabel(players.length)}
                </div>
              </div>

              <div className="host-join__grid">
                <div className="host-qr">
                  <div className="host-qr__box" id="qr" ref={qrRef} />
                  <div className="muted host-qr__hint">
                    Откройте на телефоне и введите код комнаты
                  </div>
                </div>

                <div className="host-codebox">
                  <div className="muted">roomCode</div>
                  <div className="host-roomcode" id="roomCode">
                    {roomCode}
                  </div>
                  <div className="muted" style={{ marginTop: 10 }}>
                    Ссылка
                  </div>
                  <div className="host-link">
                    <input id="playerUrl" readOnly value={playerUrl} />
                    <button className="btn" type="button" onClick={() => void onCopyPlayerUrl()}>
                      Копировать
                    </button>
                  </div>

                  <div className="host-cta">
                    <button
                      className="btn good host-startgame"
                      id="btnStartGame"
                      disabled={startDisabled}
                      type="button"
                      onClick={() => void onStartGame()}
                    >
                      Начать игру
                    </button>
                    <div className="muted host-cta__hint" id="startHint">
                      {startHint}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div
              className="card host-players"
              style={{ display: lobbyVisible ? undefined : 'none' }}
            >
              <div className="host-players__head">
                <h2 style={{ margin: 0 }}>Игроки</h2>
                <div className="muted" id="playersSub">
                  Подключаются автоматически
                </div>
              </div>
              <div className="host-players__grid" id="players" ref={playersRef}>
                {players.map((p) => (
                  <div key={p.id} className="player-card">
                    <div className="player-card__left">
                      <PlayerAvatarFace avatarUrl={p.avatarUrl} displayName={p.displayName} />
                      <div className="player-card__text">
                        <div className="player-card__name">{p.displayName || '—'}</div>
                        <div className="muted player-card__meta">
                          {p.isVip ? 'VIP · online' : 'online'}
                        </div>
                      </div>
                    </div>
                    <div
                      className="player-card__status"
                      style={{ display: 'flex', gap: 8, alignItems: 'center' }}
                    >
                      {p.isVip ? (
                        <span className="pill host-vip-pill" title="VIP">
                          VIP
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="host-vip-icon"
                          title="Сделать VIP"
                          aria-label="Сделать VIP"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            void setVipPlayer(p.id);
                          }}
                        >
                          ★
                        </button>
                      )}
                      <button
                        type="button"
                        className="host-kick-icon"
                        title="Отключить игрока"
                        aria-label="Отключить игрока"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          void kickPlayer(p.id);
                        }}
                      >
                        ×
                      </button>
                      <span className="pill good">online</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div
              className={`card host-stage${roundIntroClass ? ' host-stage--round-intro' : ''}`}
              id="stageCard"
              style={{ display: stageVisible ? undefined : 'none' }}
            >
              <div className="stage-center">
                <div
                  className="host-stage__q host-stage__q--big stage-q"
                  id="stageQuestion"
                  ref={stageQuestionRef}
                >
                  —
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

                <div
                  className={`timer-circle${disputeLabel ? ' host-timer-circle--dispute' : ''}${
                    !soloControlsVisible && session?.isPaused ? ' host-timer-circle--paused' : ''
                  }`}
                  data-stage-key="timer"
                  aria-hidden="true"
                  style={{ display: timerCircleDisplay || undefined }}
                >
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
                  <div className="timer-circle__text" id="timerCircleText" ref={timerCircleTextRef} />
                </div>

                <div
                  className="stage-q host-stage__explanation-label"
                  id="stageExplanationLabel"
                />
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
                <div
                  className="grid-answers host-stage__answers"
                  id="stageAnswers"
                  ref={stageAnswersRef}
                />
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

            <div
              className="card"
              id="leaderboardCard"
              style={{ display: lbVisible ? undefined : 'none' }}
            >
              <div className="stage-center">
                <h2 className="stage-question stage-q stage-lb-title" id="lbTitle" ref={lbTitleRef}>
                  Таблица лидеров
                </h2>
                <div className="muted stage-meta stage-lb-sub" id="lbSub" ref={lbSubRef}>
                  —
                </div>
                <div style={{ width: '100%', maxWidth: 720 }}>
                  <div id="lbTop3" ref={lbTop3Ref} />
                  <div style={{ height: 10 }} />
                  <div id="lbList" ref={lbListRef} />
                </div>
                <button
                  className="btn primary good"
                  id="btnStartNextQuiz"
                  type="button"
                  style={{ display: showStartNext ? undefined : 'none' }}
                  onClick={onStartNextQuiz}
                >
                  Открыть галерею квизов
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
