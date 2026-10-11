import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Socket } from 'socket.io-client';
import { apiFetch } from '../api';
import { emojiAvatarUrl, emojiFromAvatarUrl, isImageAvatarUrl } from './avatar';
import { formatMs, remainingMs } from '../format';
import { SmoothTimerRing, ensureTimerRingLength, paintTimerLabel } from '../timer-ring';
import { connectGameSocket } from '../game-socket';
import { applyQuizStageTypography } from '../host/quiz-stage-font';
import { parseStageTypeStyles, type StageTypeStyles } from '../host/stage-type-styles';
import { applyViewportRoundBg, clearViewportRoundBg } from '../stage/round-bg';
import { toast } from '../toast';
import {
  buildAnswerPayload,
  defaultMatchOrder,
  isPlayerRevealPhase,
  mergeAnswerKeyIntoQuestion,
  optionHasVisual,
  paintPlayerOptionSelection,
  paintPlayerReveal,
  paintPlayerSubmitDisabled,
  paintPlayerTextValue,
  shouldKeepPlayerAnswerDraft,
  validateMatchOrder,
} from './answers';
import { markOwnAnswerCorrectIfDisputeApproved } from './dispute-feedback';
import { isStageIntroPhase } from '../stage-intro-phase';
import { verifySavedRoomIsStillSameSession } from './session-api';
import {
  clearPlayerIdentity,
  hasSavedReconnectTokens,
  normRoomCode,
  readPlayerIdentity,
  savePlayerIdentity,
} from './storage';
import type {
  AnswerPayload,
  AnswerKeyPayload,
  JoinResponse,
  LeaderboardPayload,
  OpenDispute,
  PlayerQuestion,
  PlayerSession,
  PublicQuizResponse,
} from './types';
import { isMultipleChoiceType } from './types';
import { playerVipChrome } from './vip-chrome';
import {
  bettingConfigFromQuestion,
  formatStakeLimits,
  isBettingUiPhase,
  isStakeAllowed,
  resolveStakeBounds,
  type BettingMode,
  type StakeBounds,
} from './betting';

export type PlayerSurface = 'join' | 'game' | 'leaderboard' | 'waiting';

export type QTitleMode = 'waiting' | 'question' | 'round' | 'lobby_wait';

const AVATARS = [
  '😀',
  '😎',
  '🤩',
  '🥳',
  '😈',
  '👻',
  '🤖',
  '👽',
  '🦊',
  '🐱',
  '🐶',
  '🐼',
  '🐸',
  '🦁',
  '🐯',
  '🦄',
  '🐙',
  '🔥',
  '⭐',
  '🎮',
  '🎯',
  '🚀',
  '💎',
  '🍀',
] as const;

function syncBodyPlayerGameViewing(gameViewing: boolean) {
  try {
    if (gameViewing) {
      document.body.classList.add('player-game-viewing');
      document.documentElement.classList.add('player-game-viewing');
    } else {
      document.body.classList.remove('player-game-viewing');
      document.documentElement.classList.remove('player-game-viewing');
    }
  } catch {
    /* ignore */
  }
}

function emitAck<T = unknown>(
  socket: Socket,
  event: string,
  payload: unknown,
  timeoutMs: number,
): Promise<{ err?: Error; res?: T }> {
  return new Promise((resolve) => {
    socket.timeout(timeoutMs).emit(event, payload, (err: Error | null, res: T) => {
      resolve({ err: err || undefined, res });
    });
  });
}

export function usePlayerGame() {
  const [searchParams] = useSearchParams();
  const qpCode = searchParams.get('code');

  const [surface, setSurface] = useState<PlayerSurface>('join');
  const [roomCode, setRoomCode] = useState(() => (qpCode ? normRoomCode(qpCode) : ''));
  const [name, setName] = useState('');
  const [chosenAva, setChosenAva] = useState<string | null>(null);
  const [customAvatarUrl, setCustomAvatarUrl] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [meAvatarUrl, setMeAvatarUrl] = useState<string | null>(null);
  const [avatarEditable, setAvatarEditable] = useState(false);
  const [showReturnBlock, setShowReturnBlock] = useState(false);
  const [showBackToJoin, setShowBackToJoin] = useState(false);
  const [showLeave, setShowLeave] = useState(false);
  const [showSubmit, setShowSubmit] = useState(true);
  const [submitDisabled, setSubmitDisabled] = useState(true);
  const [wsStatus, setWsStatus] = useState('disconnected');
  const [meName, setMeName] = useState('—');
  const [meId, setMeId] = useState('—');
  const [phaseInfo, setPhaseInfo] = useState('—');
  const [timerCircleLen, setTimerCircleLenState] = useState<number | null>(null);
  const [showTimerCircle, setShowTimerCircle] = useState(false);
  const [qTitle, setQTitle] = useState('Ожидание…');
  const [qTitleMode, setQTitleMode] = useState<QTitleMode>('waiting');
  const [introMeta, setIntroMeta] = useState('');
  const [gameCardIntro, setGameCardIntro] = useState(false);
  const [gameCardSummary, setGameCardSummary] = useState(false);
  const [gameViewing, setGameViewing] = useState(false);

  const [question, setQuestion] = useState<PlayerQuestion | null>(null);
  const [questionType, setQuestionType] = useState<string | null>(null);
  const [phase, setPhase] = useState<string | null>(null);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>([]);
  const [hasSubmittedCurrent, setHasSubmittedCurrent] = useState(false);
  const [textAnswer, setTextAnswer] = useState('');
  const [textVisible, setTextVisible] = useState(false);
  const [textDisabled, setTextDisabled] = useState(false);
  const [textFeedback, setTextFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [matchVisible, setMatchVisible] = useState(false);
  const [matchOrder, setMatchOrder] = useState<number[]>([]);
  const [matchBlockClass, setMatchBlockClass] = useState('');
  const [matchRowClasses, setMatchRowClasses] = useState<Record<number, string>>({});
  const [matchKeyHint, setMatchKeyHint] = useState<string | null>(null);
  const [answersVisible, setAnswersVisible] = useState(true);
  const [answersVisual, setAnswersVisual] = useState(false);
  const [answersHtmlMode, setAnswersHtmlMode] = useState<'options' | 'correct_texts' | 'waiting_msg' | 'empty'>(
    'empty',
  );
  const [correctTexts, setCorrectTexts] = useState<string[]>([]);
  const [showDisputeChallenge, setShowDisputeChallenge] = useState(false);
  const [openDispute, setOpenDispute] = useState<OpenDispute | null>(null);
  const [lbKind, setLbKind] = useState<'round' | 'final'>('round');
  const [lbRows, setLbRows] = useState<LeaderboardPayload['rows']>([]);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [isVip, setIsVip] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [videoPlayingGuess, setVideoPlayingGuess] = useState(false);
  const [showBettingPanel, setShowBettingPanel] = useState(false);
  const [stakeDraft, setStakeDraft] = useState(0);
  const [stakeInput, setStakeInput] = useState('');
  const [stakePlaced, setStakePlaced] = useState(false);
  const [stakeSubmitting, setStakeSubmitting] = useState(false);
  const [playerScore, setPlayerScore] = useState(0);
  const [bettingMode, setBettingMode] = useState<BettingMode>('free');
  const [bettingBounds, setBettingBounds] = useState<StakeBounds>({
    min: 1,
    max: 0,
    presets: [],
    canBet: false,
  });
  const [bettingLimitLabel, setBettingLimitLabel] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const sessionRef = useRef<PlayerSession | null>(null);
  const meRef = useRef<{
    sessionId: string | null;
    playerId: string | null;
    reconnectToken: string | null;
    displayName: string | null;
  }>({ sessionId: null, playerId: null, reconnectToken: null, displayName: null });
  const playerViewSeqRef = useRef(0);
  const currentQuestionRef = useRef<PlayerQuestion | null>(null);
  const questionTypeRef = useRef<string | null>(null);
  const selectedOptionIdRef = useRef<string | null>(null);
  const selectedOptionIdsRef = useRef<string[]>([]);
  const hasSubmittedRef = useRef(false);
  const textAnswerRef = useRef('');
  const matchOrderRef = useRef<number[]>([]);
  const pendingEarlySubmitRef = useRef<{ questionId: string; payload: AnswerPayload } | null>(null);
  const pendingAnswerKeyRef = useRef<AnswerKeyPayload | null>(null);
  const phaseTotalMsRef = useRef<number | null>(null);
  const timerCircleLenRef = useRef<number | null>(null);
  const timerTextElRef = useRef<HTMLDivElement | null>(null);
  const timerProgressElRef = useRef<SVGCircleElement | null>(null);
  const leavingNowRef = useRef(false);
  const sessionClosedByHostRef = useRef(false);
  const wsReconnectAttemptsRef = useRef(0);
  const playerDismissedLeaderboardRef = useRef(false);
  const finalBgByQuizIdRef = useRef<Record<string, string | null>>(Object.create(null));
  const coverBgByQuizIdRef = useRef<Record<string, string | null>>(Object.create(null));
  const coverFontByQuizIdRef = useRef<Record<string, string | null>>(Object.create(null));
  const coverTypeStylesByQuizIdRef = useRef<Record<string, StageTypeStyles | null>>(Object.create(null));
  const openDisputeRef = useRef<OpenDispute | null>(null);
  const connectWsRef = useRef<() => void>(() => {});
  const applySessionRef = useRef<(s: PlayerSession, prev: PlayerSession | null) => void>(() => {});
  const leaveLobbyRef = useRef<(silent: boolean, keepIdentity: boolean) => void>(() => {});

  const refreshReturnBlock = useCallback(() => {
    setShowReturnBlock(hasSavedReconnectTokens());
  }, []);

  const setOpenDisputeState = useCallback((d: OpenDispute | null) => {
    openDisputeRef.current = d && typeof d === 'object' ? d : null;
    setOpenDispute(openDisputeRef.current);
  }, []);

  const clearTextFeedback = useCallback(() => setTextFeedback(null), []);

  const setBackToJoinButton = useCallback((on: boolean) => setShowBackToJoin(on), []);

  const showGame = useCallback(() => {
    setBackToJoinButton(false);
    setSurface('game');
    setAvatarEditable(false);
    setGameViewing(true);
    syncBodyPlayerGameViewing(true);
    setShowTimerCircle(false);
    const m = meRef.current;
    setMeName(m.displayName || '—');
    setMeId(m.playerId || '—');
  }, [setBackToJoinButton]);

  const showPlayerWaitingRoom = useCallback(() => {
    clearViewportRoundBg();
    setBackToJoinButton(true);
    setSurface('waiting');
    setGameViewing(true);
    syncBodyPlayerGameViewing(true);
    setQTitle('Комната ожидания');
    setQTitleMode('lobby_wait');
    setIntroMeta('');
    setTextVisible(false);
    setTextAnswer('');
    textAnswerRef.current = '';
    setTextDisabled(false);
    clearTextFeedback();
    setMatchVisible(false);
    setMatchOrder([]);
    matchOrderRef.current = [];
    setMatchBlockClass('');
    setMatchRowClasses({});
    setMatchKeyHint(null);
    setAnswersHtmlMode('waiting_msg');
    setAnswersVisible(true);
    setShowTimerCircle(false);
    phaseTotalMsRef.current = null;
    setShowSubmit(false);
    setSubmitDisabled(true);
    setShowLeave(false);
    setQuestion(null);
    currentQuestionRef.current = null;
  }, [clearTextFeedback, setBackToJoinButton]);

  const resetPlayerSurfaceToJoin = useCallback(() => {
    setBackToJoinButton(false);
    setOpenDisputeState(null);
    setSurface('join');
    setAvatarEditable(false);
    setGameViewing(false);
    clearViewportRoundBg();
    syncBodyPlayerGameViewing(false);
    setGameCardIntro(false);
    setGameCardSummary(false);
    setQTitle('Ожидание…');
    setQTitleMode('waiting');
    setIntroMeta('');
    setAnswersHtmlMode('empty');
    setAnswersVisible(true);
    setTextVisible(false);
    setTextAnswer('');
    textAnswerRef.current = '';
    setTextDisabled(false);
    clearTextFeedback();
    setMatchVisible(false);
    setMatchOrder([]);
    matchOrderRef.current = [];
    setMatchBlockClass('');
    setMatchRowClasses({});
    setMatchKeyHint(null);
    setShowTimerCircle(false);
    setShowSubmit(true);
    setSubmitDisabled(true);
    setQuestion(null);
    currentQuestionRef.current = null;
  }, [clearTextFeedback, setBackToJoinButton, setOpenDisputeState]);

  const renderChallengeMount = useCallback(
    (q: PlayerQuestion | null, ph: string | null, playerAnswer: PlayerQuestion['playerAnswer']) => {
      if (ph !== 'answer_reveal') {
        setShowDisputeChallenge(false);
        return;
      }
      if (!q || String(q.type) !== 'text_input') {
        setShowDisputeChallenge(false);
        return;
      }
      if (openDisputeRef.current && openDisputeRef.current.status === 'open') {
        setShowDisputeChallenge(false);
        return;
      }
      if (!playerAnswer || playerAnswer.isCorrect !== false) {
        setShowDisputeChallenge(false);
        return;
      }
      setShowDisputeChallenge(true);
    },
    [],
  );

  const applyApprovedDisputeToUi = useCallback(
    (dispute: OpenDispute | null | undefined, outcome?: string) => {
      const q = currentQuestionRef.current;
      const next = markOwnAnswerCorrectIfDisputeApproved(q, dispute, meRef.current.playerId, outcome);
      if (next && next !== q) {
        currentQuestionRef.current = next;
        setQuestion(next);
        setTextFeedback('correct');
      }
      const shown = next || q;
      renderChallengeMount(shown, sessionRef.current && sessionRef.current.phase, shown && shown.playerAnswer);
    },
    [renderChallengeMount],
  );

  const syncDisputeState = useCallback(async () => {
    const socket = socketRef.current;
    if (!socket) return;
    const { err, res } = await emitAck<{ ok?: boolean; dispute?: OpenDispute | null }>(
      socket,
      'dispute_state',
      {},
      8000,
    );
    if (!err && res && res.ok) {
      setOpenDisputeState(res.dispute || null);
    }
  }, [setOpenDisputeState]);

  const applyMatchReveal = useCallback((q: PlayerQuestion, playerAnswer: PlayerQuestion['playerAnswer']) => {
    const m0 = q.match;
    if (!m0 || !m0.left || !m0.right) return;
    const n0 = m0.left.length;
    const letters0 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const key = m0.correct && m0.correct.length === n0 ? m0.correct : null;
    if (key) {
      const keyParts: string[] = [];
      for (let ki = 0; ki < n0; ki++) {
        const letK = letters0[ki] || String(ki + 1);
        keyParts.push(`${letK}→${key[ki]}`);
      }
      setMatchKeyHint(`Ключ: ${keyParts.join(', ')}`);
    } else {
      setMatchKeyHint(null);
    }
    if (playerAnswer && typeof playerAnswer.isCorrect === 'boolean') {
      const keyReveal = Array.isArray(m0.correct) && m0.correct.length === n0 ? m0.correct : null;
      const ordReveal = playerAnswer.matchOrder;
      const canPerRow = !!(keyReveal && ordReveal && ordReveal.length === n0);
      const smRaw = m0.scoringMode != null ? m0.scoringMode : m0.scoring_mode;
      const isPerMatchMode = String(smRaw || '').toLowerCase() === 'per_match';
      let someRight = false;
      let someWrong = false;
      if (canPerRow && keyReveal && ordReveal) {
        for (let pi = 0; pi < n0; pi++) {
          const chosenP = Number(ordReveal[pi]);
          const expP = keyReveal[pi];
          const rowOkP = Number.isFinite(chosenP) && chosenP === expP;
          if (rowOkP) someRight = true;
          else someWrong = true;
        }
      }
      const mixed = someRight && someWrong;
      const usePerRowColors = canPerRow && (isPerMatchMode || mixed);
      if (usePerRowColors && keyReveal && ordReveal) {
        const rowCls: Record<number, string> = {};
        for (let rj = 0; rj < n0; rj++) {
          const chosen = Number(ordReveal[rj]);
          const exp = keyReveal[rj];
          const rowOk = Number.isFinite(chosen) && chosen === exp;
          rowCls[rj] = rowOk ? 'player-match__row--correct' : 'player-match__row--wrong';
        }
        setMatchRowClasses(rowCls);
        setMatchBlockClass('');
      } else {
        setMatchRowClasses({});
        setMatchBlockClass(playerAnswer.isCorrect ? 'player-match--ok' : 'player-match--bad');
      }
    }
  }, []);

  const renderQuestion = useCallback(
    (q0: PlayerQuestion | null, ph: string | null) => {
      setGameViewing(true);
      syncBodyPlayerGameViewing(true);
      setBackToJoinButton(false);
      let q = q0;
      if (q && isPlayerRevealPhase(ph)) {
        q = mergeAnswerKeyIntoQuestion(q, pendingAnswerKeyRef.current);
      }
      const prevQid = currentQuestionRef.current?.id ? String(currentQuestionRef.current.id) : '';
      const nextQid = q?.id ? String(q.id) : '';
      const keepDraft = shouldKeepPlayerAnswerDraft(prevQid, nextQid, ph);
      currentQuestionRef.current = q;
      setQuestion(q);
      if (prevQid !== nextQid) setVideoPlayingGuess(false);
      const qType = q && q.type ? String(q.type) : null;
      questionTypeRef.current = qType;
      setQuestionType(qType);
      setPhase(ph);
      setShowDisputeChallenge(false);
      setMatchKeyHint(null);
      setMatchRowClasses({});
      setMatchBlockClass('');
      setCorrectTexts([]);

      if (!keepDraft) {
        setSelectedOptionId(null);
        selectedOptionIdRef.current = null;
        setSelectedOptionIds([]);
        selectedOptionIdsRef.current = [];
        setHasSubmittedCurrent(false);
        hasSubmittedRef.current = false;
        setSubmitDisabled(true);
      }

      if (!q) {
        clearViewportRoundBg();
        setTextVisible(false);
        setTextAnswer('');
        textAnswerRef.current = '';
        paintPlayerTextValue('');
        setTextDisabled(false);
        clearTextFeedback();
        setMatchVisible(false);
        setMatchOrder([]);
        matchOrderRef.current = [];
        setAnswersHtmlMode('empty');
        return;
      }

      setAnswersVisible(true);
      setAnswersHtmlMode('options');
      setMatchVisible(false);
      if (!keepDraft) {
        setMatchOrder([]);
        matchOrderRef.current = [];
        setTextAnswer('');
        textAnswerRef.current = '';
        paintPlayerTextValue('');
        setTextDisabled(false);
        clearTextFeedback();
      }
      setTextVisible(false);

      setQTitle(`${q.prompt}${q.basePoints != null ? ` (+${q.basePoints})` : ''}`);
      setQTitleMode('question');

      const opts = q.options || [];
      const visual = optionHasVisual(opts);
      setAnswersVisual(visual);

      if (ph === 'question_read') {
        setAnswersHtmlMode('empty');
        setMatchVisible(false);
        setSubmitDisabled(true);
        return;
      }

      const playerAnswer = q.playerAnswer || null;
      if (playerAnswer) {
        setHasSubmittedCurrent(true);
        hasSubmittedRef.current = true;
        const ids = (playerAnswer.selectedOptionIds || []).slice();
        setSelectedOptionIds(ids);
        selectedOptionIdsRef.current = ids;
        const first = ids[0] || null;
        setSelectedOptionId(first);
        selectedOptionIdRef.current = first;
        setSubmitDisabled(true);
        paintPlayerOptionSelection(ids);
        paintPlayerSubmitDisabled(true);
      } else if (keepDraft) {
        paintPlayerOptionSelection(selectedOptionIdsRef.current);
      }

      if (isPlayerRevealPhase(ph)) {
        paintPlayerReveal({
          selectedIds: selectedOptionIdsRef.current,
          correctIds: q.correctOptionIds || [],
        });
        if (q.correctTexts?.length) setCorrectTexts(q.correctTexts.slice());
      }

      if (qType === 'matching') {
        setAnswersVisible(false);
        setAnswersHtmlMode('empty');
        setMatchVisible(true);
        const m0 = q.match;
        if (!m0 || !m0.left || !m0.right || !m0.left.length || m0.left.length !== m0.right.length) {
          if (!keepDraft) {
            setMatchOrder([]);
            matchOrderRef.current = [];
          }
          return;
        }
        const order =
          keepDraft && !playerAnswer ? matchOrderRef.current.slice() : defaultMatchOrder(m0, playerAnswer);
        setMatchOrder(order);
        matchOrderRef.current = order;
        if (ph === 'answer_reveal' || ph === 'round_replay' || ph === 'round_summary') {
          applyMatchReveal(q, playerAnswer);
        }
        if (!hasSubmittedRef.current) {
          setSubmitDisabled(!validateMatchOrder(order, m0.left.length));
        }
        return;
      }

      if (qType === 'text_input') {
        setAnswersHtmlMode('empty');
        setTextVisible(true);
        const typed =
          playerAnswer && playerAnswer.textAnswer != null ? String(playerAnswer.textAnswer) : '';
        const reveal =
          ph === 'answer_reveal' || ph === 'round_replay' || ph === 'round_summary';
        if (typed) {
          setTextAnswer(typed);
          textAnswerRef.current = typed;
          paintPlayerTextValue(typed);
          setTextDisabled(true);
        }
        if (reveal) {
          const cts = (q.correctTexts || []).slice(0, 10);
          setCorrectTexts(cts);
          setAnswersHtmlMode('correct_texts');
          if (!typed) {
            setTextAnswer('');
            textAnswerRef.current = '';
            paintPlayerTextValue('');
          }
          setTextDisabled(true);
          if (playerAnswer && typeof playerAnswer.isCorrect === 'boolean') {
            setTextFeedback(playerAnswer.isCorrect ? 'correct' : 'wrong');
          } else {
            clearTextFeedback();
          }
          setSubmitDisabled(true);
          if (ph === 'answer_reveal') {
            void syncDisputeState().then(() => {
              renderChallengeMount(q, ph, playerAnswer);
            });
          }
        } else if (!hasSubmittedRef.current) {
          setSubmitDisabled(!String(textAnswerRef.current || '').trim());
        }
        return;
      }

      setAnswersHtmlMode('options');
    },
    [
      applyMatchReveal,
      clearTextFeedback,
      renderChallengeMount,
      setBackToJoinButton,
      syncDisputeState,
    ],
  );

  const paintRevealFromQuestion = useCallback((q: PlayerQuestion | null) => {
    if (!q) return;
    const ids = q.correctOptionIds || [];
    if (!ids.length) return;
    paintPlayerReveal({
      selectedIds: selectedOptionIdsRef.current,
      correctIds: ids,
    });
  }, []);

  const applyAnswerKey = useCallback(
    (key: AnswerKeyPayload | null | undefined) => {
      if (!key || !key.questionId) return;
      pendingAnswerKeyRef.current = key;
      const q = currentQuestionRef.current;
      if (!q || String(q.id) !== String(key.questionId)) return;
      const merged = mergeAnswerKeyIntoQuestion(q, key);
      currentQuestionRef.current = merged;
      setQuestion(merged);
      if (key.correctTexts && key.correctTexts.length) {
        setCorrectTexts(key.correctTexts.slice());
      }
      if (merged.match && key.matchCorrect) {
        applyMatchReveal(merged, merged.playerAnswer || null);
      }
      paintRevealFromQuestion(merged);
    },
    [applyMatchReveal, paintRevealFromQuestion],
  );

  const submitAnswerNow = useCallback(
    async (payload: AnswerPayload) => {
      const socket = socketRef.current;
      if (!socket) throw new Error('WS не подключён');
      if (!sessionRef.current || sessionRef.current.phase !== 'question') {
        throw new Error('Сейчас не фаза вопроса');
      }
      if (!currentQuestionRef.current) throw new Error('Нет вопроса');
      if (hasSubmittedRef.current) throw new Error('Ответ уже отправлен');
      if (!payload || !payload.questionId) throw new Error('Некорректный payload');

      hasSubmittedRef.current = true;
      setHasSubmittedCurrent(true);
      setSubmitDisabled(true);
      setTextDisabled(true);
      paintPlayerSubmitDisabled(true);

      const { err, res } = await emitAck<{ ok?: boolean; message?: string }>(
        socket,
        'submit_answer',
        payload,
        3000,
      );
      if (err || !res?.ok) {
        hasSubmittedRef.current = false;
        setHasSubmittedCurrent(false);
        setSubmitDisabled(false);
        setTextDisabled(false);
        paintPlayerSubmitDisabled(false);
        toast(err ? 'submit_answer error/timeout' : (res && res.message) || 'Ошибка ответа');
        return;
      }
      pendingEarlySubmitRef.current = null;
      toast('Ответ отправлен');
    },
    [],
  );

  const ensureQuizBg = useCallback(
    async (
      quizId: string,
      cache: MutableRefObject<Record<string, string | null>>,
      apply: boolean,
    ) => {
      if (cache.current[quizId] !== undefined) {
        applyQuizStageTypography({
          fontFamily: coverFontByQuizIdRef.current[quizId],
          stageTypeStyles: coverTypeStylesByQuizIdRef.current[quizId],
        });
        if (apply) {
          if (cache.current[quizId]) applyViewportRoundBg(cache.current[quizId]);
          else clearViewportRoundBg();
        }
        return cache.current[quizId];
      }
      try {
        const d = await apiFetch<PublicQuizResponse>(`/api/quizzes/public/${encodeURIComponent(quizId)}`, {
          headers: {},
        });
        const bg = d && d.background ? String(d.background).trim() : '';
        const ff = d && d.fontFamily ? String(d.fontFamily).trim() : '';
        const typeStyles = parseStageTypeStyles(d?.stageTypeStyles);
        cache.current[quizId] = bg || null;
        coverFontByQuizIdRef.current[quizId] = ff || null;
        coverTypeStylesByQuizIdRef.current[quizId] = typeStyles;
        applyQuizStageTypography({ fontFamily: ff || null, stageTypeStyles: typeStyles });
        if (apply) {
          if (bg) applyViewportRoundBg(bg);
          else clearViewportRoundBg();
        }
        return cache.current[quizId];
      } catch {
        cache.current[quizId] = null;
        coverFontByQuizIdRef.current[quizId] = null;
        coverTypeStylesByQuizIdRef.current[quizId] = null;
        applyQuizStageTypography({ fontFamily: null, stageTypeStyles: null });
        if (apply) {
          clearViewportRoundBg();
        }
        return null;
      }
    },
    [],
  );

  const syncBettingFromQuestion = useCallback((q: PlayerQuestion | null, ph: string | null) => {
    const scope =
      q?.bettingScope ?? (q?.bettingEnabled ? 'round' : null);
    const show = isBettingUiPhase(ph, scope);
    setShowBettingPanel(show);
    if (typeof q?.playerScore === 'number') setPlayerScore(q.playerScore);
    if (show && q) {
      const score = typeof q.playerScore === 'number' ? q.playerScore : 0;
      const cfg = bettingConfigFromQuestion(q);
      const bounds = resolveStakeBounds(score, cfg);
      setBettingMode(cfg.mode);
      setBettingBounds(bounds);
      setBettingLimitLabel(formatStakeLimits(bounds, cfg.mode));
      const placedStake = q.playerStake ?? q.roundStake;
      if (placedStake != null) {
        setStakePlaced(true);
        setStakeDraft(placedStake);
        setStakeInput(placedStake > 0 ? String(placedStake) : '');
      } else {
        setStakePlaced(false);
        // Свободный ввод стартует с минимально допустимой ставки, варианты — с пустого выбора.
        const initial = cfg.mode === 'free' && bounds.canBet ? bounds.min : 0;
        setStakeDraft(initial);
        setStakeInput(initial > 0 ? String(initial) : '');
      }
    } else {
      setStakePlaced(false);
      setStakeSubmitting(false);
    }
  }, []);

  const renderLeaderboard = useCallback(
    (payload: LeaderboardPayload) => {
      setBackToJoinButton(false);
      const pid = meRef.current.playerId;
      if (pid && payload?.rows) {
        const mine = payload.rows.find((r) => r.playerId != null && String(r.playerId) === String(pid));
        if (mine && typeof mine.score === 'number') setPlayerScore(mine.score);
      }
      const kind0 = (payload && payload.kind ? payload.kind : 'round') as 'round' | 'final';
      if (kind0 === 'final') {
        const qid0 = sessionRef.current && sessionRef.current.quizId ? String(sessionRef.current.quizId) : '';
        if (!qid0) clearViewportRoundBg();
        else void ensureQuizBg(qid0, finalBgByQuizIdRef, true);
      }
      setSurface('leaderboard');
      setGameViewing(false);
      syncBodyPlayerGameViewing(false);
      setLbKind(kind0 === 'final' ? 'final' : 'round');
      setLbRows((payload && payload.rows) || []);
    },
    [ensureQuizBg, setBackToJoinButton],
  );

  const applySessionFromServer = useCallback(
    (s: PlayerSession, prevSession: PlayerSession | null) => {
      if (!s) return;
      if (s.endedAt) {
        sessionClosedByHostRef.current = true;
        toast('Комната закрыта — введите код и имя снова.');
        leaveLobbyRef.current(true, false);
        return;
      }
      const quizId = s.quizId ? String(s.quizId) : '';
      if (quizId) void ensureQuizBg(quizId, coverBgByQuizIdRef, false);
      const ph = s.phase;
      const pid = meRef.current.playerId;
      setIsVip(!!pid && s.vipPlayerId != null && String(s.vipPlayerId) === String(pid));
      setIsPaused(!!s.isPaused);
      if (String(prevSession?.currentQuestionId || '') !== String(s.currentQuestionId || '')) {
        setVideoPlayingGuess(false);
      } else if (
        String(prevSession?.phase || '') !== String(ph || '') &&
        (ph === 'answer_reveal' || ph === 'round_replay' || ph === 'round_summary' || ph === 'question')
      ) {
        setVideoPlayingGuess(false);
      }
      setPhase(ph);
      if (ph !== 'answer_reveal') {
        setOpenDisputeState(null);
      }
      if (isStageIntroPhase(ph)) {
        setTextVisible(false);
        setTextAnswer('');
        textAnswerRef.current = '';
        setTextDisabled(false);
        clearTextFeedback();
        setMatchVisible(false);
        setMatchOrder([]);
        matchOrderRef.current = [];
        setMatchBlockClass('');
      }

      const inGameUi =
        ph === 'quiz_intro' ||
        ph === 'round_intro' ||
        ph === 'question_read' ||
        ph === 'question' ||
        ph === 'answer_reveal' ||
        ph === 'round_replay' ||
        ph === 'round_summary' ||
        ph === 'lobby';
      setGameViewing(inGameUi);
      syncBodyPlayerGameViewing(inGameUi);
      setGameCardIntro(isStageIntroPhase(ph));
      setGameCardSummary(ph === 'round_replay' || ph === 'round_summary');
      try {
        if (isStageIntroPhase(ph)) document.body.classList.add('player-round-intro');
        else document.body.classList.remove('player-round-intro');
      } catch {
        /* ignore */
      }

      if (ph !== 'leaderboard' && ph !== 'finished') {
        playerDismissedLeaderboardRef.current = false;
      }
      setPhaseInfo(`phase: ${ph}`);

      if (ph === 'lobby') {
        if (prevSession?.phase && prevSession.phase !== 'lobby') {
          toast('Ведущий завершил квиз — ожидайте следующий');
        }
        showPlayerWaitingRoom();
        setAvatarEditable(true);
        setShowLeave(true);
        return;
      }

      setAvatarEditable(false);

      if (ph === 'leaderboard' || ph === 'finished') {
        const socket = socketRef.current;
        if (!socket) return;
        if (playerDismissedLeaderboardRef.current) {
          showPlayerWaitingRoom();
          return;
        }
        const kind = ph === 'finished' ? 'final' : 'round';
        void emitAck<LeaderboardPayload>(socket, 'leaderboard_view', { kind }, 8000).then(({ err, res }) => {
          if (err) return;
          if (res && res.ok) renderLeaderboard(res);
        });
        if (ph === 'finished') {
          const qid = s && s.quizId ? String(s.quizId) : '';
          if (!qid) clearViewportRoundBg();
          else void ensureQuizBg(qid, finalBgByQuizIdRef, true);
        }
        return;
      }

      if (
        prevSession &&
        s.currentQuestionId &&
        prevSession.currentQuestionId &&
        String(prevSession.currentQuestionId) === String(s.currentQuestionId) &&
        prevSession.phase === s.phase &&
        ph !== 'lobby' &&
        ph !== 'leaderboard' &&
        ph !== 'finished'
      ) {
        setShowLeave(false);
        return;
      }

      setSurface('game');
      setGameViewing(true);
      syncBodyPlayerGameViewing(true);
      setShowTimerCircle(!(ph === 'lobby' || isStageIntroPhase(ph)));
      setShowSubmit(ph === 'question');

      const cachedQ = currentQuestionRef.current;
      const sameCachedQuestion =
        !!cachedQ &&
        !!s.currentQuestionId &&
        String(cachedQ.id) === String(s.currentQuestionId);

      if (
        sameCachedQuestion &&
        cachedQ &&
        (isStageIntroPhase(ph) || ph === 'question_read' || ph === 'question')
      ) {
        setShowLeave(false);
        if (isStageIntroPhase(ph)) {
          const isQuizIntro = ph === 'quiz_intro';
          try {
            document.body.classList.add('player-round-intro');
          } catch {
            /* ignore */
          }
          setGameCardIntro(true);
          phaseTotalMsRef.current =
            (isQuizIntro ? cachedQ.quizIntroSec || 6 : cachedQ.roundIntroSec || 0) * 1000;
          setQTitle(
            isQuizIntro ? cachedQ.quizTitle || 'Квиз' : cachedQ.roundTitle || 'Раунд',
          );
          setQTitleMode('round');
          setIntroMeta(
            isQuizIntro
              ? (cachedQ.quizDescription || '').trim()
              : (cachedQ.roundDescription || '').trim(),
          );
          setAnswersHtmlMode('empty');
          currentQuestionRef.current = cachedQ;
          setQuestion(cachedQ);
          syncBettingFromQuestion(cachedQ, ph);
          return;
        }
        try {
          document.body.classList.remove('player-round-intro');
        } catch {
          /* ignore */
        }
        setGameCardIntro(false);
        setIntroMeta('');
        if (ph === 'question_read') {
          phaseTotalMsRef.current = (cachedQ.readTimeSec || 0) * 1000;
          setQTitle(cachedQ.prompt || 'Вопрос');
          setQTitleMode('question');
          currentQuestionRef.current = cachedQ;
          setQuestion(cachedQ);
          syncBettingFromQuestion(cachedQ, ph);
          renderQuestion(cachedQ, ph);
          return;
        }
        syncBettingFromQuestion(null, ph);
        phaseTotalMsRef.current = (cachedQ.timeLimitSec || 0) * 1000;
        renderQuestion(cachedQ, ph);
        return;
      }

      const revealPh = isPlayerRevealPhase(ph);
      if (revealPh && sameCachedQuestion && cachedQ) {
        setShowLeave(false);
        try {
          document.body.classList.remove('player-round-intro');
        } catch {
          /* ignore */
        }
        setGameCardIntro(false);
        setIntroMeta('');
        phaseTotalMsRef.current = (cachedQ.roundSummarySec || 2) * 1000;
        const merged = mergeAnswerKeyIntoQuestion(cachedQ, pendingAnswerKeyRef.current);
        renderQuestion(merged, ph);
        paintRevealFromQuestion(merged);
      }

      if (
        (ph === 'quiz_intro' ||
          ph === 'round_intro' ||
          ph === 'question_read' ||
          ph === 'question' ||
          ph === 'answer_reveal' ||
          ph === 'round_replay' ||
          ph === 'round_summary') &&
        s.currentQuestionId
      ) {
        if (!(revealPh && sameCachedQuestion)) setAnswersHtmlMode('empty');
        const seq = ++playerViewSeqRef.current;
        const socket = socketRef.current;
        if (!socket) return;
        void emitAck<{ question?: PlayerQuestion }>(socket, 'question_view', {}, 8000).then(({ err, res }) => {
          if (seq !== playerViewSeqRef.current) return;
          if (err) {
            toast('question_view error');
            return;
          }
          const q0 = res && res.question;
          if (!q0) return;
          const q = mergeAnswerKeyIntoQuestion(q0, pendingAnswerKeyRef.current);
          setBackToJoinButton(false);

          const ridBg = (q.roundBackgroundUrl || '').trim();
          if (ridBg) {
            applyViewportRoundBg(ridBg);
            const qidFont = s && s.quizId ? String(s.quizId) : '';
            if (qidFont) void ensureQuizBg(qidFont, coverBgByQuizIdRef, false);
          } else {
            const qid = s && s.quizId ? String(s.quizId) : '';
            if (!qid) clearViewportRoundBg();
            else if (coverBgByQuizIdRef.current[qid] !== undefined) {
              if (coverBgByQuizIdRef.current[qid]) applyViewportRoundBg(coverBgByQuizIdRef.current[qid]);
              else clearViewportRoundBg();
            } else {
              void ensureQuizBg(qid, coverBgByQuizIdRef, false).then((bg) => {
                try {
                  const cur = sessionRef.current;
                  if (
                    cur &&
                    (cur.phase === 'question' ||
                      cur.phase === 'question_read' ||
                      isStageIntroPhase(cur.phase) ||
                      cur.phase === 'answer_reveal' ||
                      cur.phase === 'round_summary' ||
                      cur.phase === 'round_replay')
                  ) {
                    if (!(q.roundBackgroundUrl || '').trim() && bg) applyViewportRoundBg(bg);
                  }
                } catch {
                  /* ignore */
                }
              });
            }
          }

          if (isStageIntroPhase(ph)) {
            const isQuizIntro = ph === 'quiz_intro';
            try {
              document.body.classList.add('player-round-intro');
            } catch {
              /* ignore */
            }
            setGameCardIntro(true);
            phaseTotalMsRef.current =
              (isQuizIntro ? q.quizIntroSec || 6 : q.roundIntroSec || 0) * 1000;
            setQTitle(isQuizIntro ? q.quizTitle || 'Квиз' : q.roundTitle || 'Раунд');
            setQTitleMode('round');
            setIntroMeta(
              isQuizIntro ? (q.quizDescription || '').trim() : (q.roundDescription || '').trim(),
            );
            setTextVisible(false);
            setTextAnswer('');
            textAnswerRef.current = '';
            setTextDisabled(false);
            clearTextFeedback();
            setMatchVisible(false);
            setMatchOrder([]);
            matchOrderRef.current = [];
            setAnswersHtmlMode('empty');
            setSubmitDisabled(true);
            currentQuestionRef.current = q;
            setQuestion(q);
            syncBettingFromQuestion(q, ph);
            return;
          }

          if (ph === 'question_read') {
            try {
              document.body.classList.remove('player-round-intro');
            } catch {
              /* ignore */
            }
            setGameCardIntro(false);
            setIntroMeta('');
            phaseTotalMsRef.current = (q.readTimeSec || 0) * 1000;
            setQTitle(q.prompt || 'Вопрос');
            setQTitleMode('question');
            currentQuestionRef.current = q;
            setQuestion(q);
            syncBettingFromQuestion(q, ph);
            renderQuestion(q, ph);
            return;
          }

          if (ph === 'question') {
            try {
              document.body.classList.remove('player-round-intro');
            } catch {
              /* ignore */
            }
            setGameCardIntro(false);
            setIntroMeta('');
            syncBettingFromQuestion(null, ph);
            phaseTotalMsRef.current = (q.timeLimitSec || 0) * 1000;
            renderQuestion(q, ph);
            try {
              const pending = pendingEarlySubmitRef.current;
              if (pending && pending.questionId && String(pending.questionId) === String(q.id)) {
                void submitAnswerNow(pending.payload);
              } else {
                pendingEarlySubmitRef.current = null;
              }
            } catch {
              /* keep UI interactive */
            }
          }

          if (ph === 'answer_reveal') {
            try {
              document.body.classList.remove('player-round-intro');
            } catch {
              /* ignore */
            }
            setGameCardIntro(false);
            setIntroMeta('');
            phaseTotalMsRef.current = (q.roundSummarySec || 2) * 1000;
            renderQuestion(q, ph);
            paintRevealFromQuestion(q);
            return;
          }

          if (ph === 'round_replay' || ph === 'round_summary') {
            try {
              document.body.classList.remove('player-round-intro');
            } catch {
              /* ignore */
            }
            setGameCardIntro(false);
            setIntroMeta('');
            phaseTotalMsRef.current = (q.roundSummarySec || 2) * 1000;
            renderQuestion(q, ph);
            paintRevealFromQuestion(q);
          }
        });
      } else {
        phaseTotalMsRef.current = null;
        try {
          document.body.classList.remove('player-round-intro');
        } catch {
          /* ignore */
        }
        setGameCardIntro(false);
        setIntroMeta('');
        renderQuestion(null, ph);
      }

      setShowLeave(ph === 'lobby');
    },
    [
      clearTextFeedback,
      ensureQuizBg,
      renderLeaderboard,
      renderQuestion,
      paintRevealFromQuestion,
      applyAnswerKey,
      setBackToJoinButton,
      setOpenDisputeState,
      showPlayerWaitingRoom,
      submitAnswerNow,
      syncBettingFromQuestion,
    ],
  );

  applySessionRef.current = applySessionFromServer;

  const leaveLobby = useCallback(
    (silent: boolean, keepIdentity: boolean) => {
      setBackToJoinButton(false);
      leavingNowRef.current = true;
      sessionClosedByHostRef.current = false;
      try {
        socketRef.current?.disconnect();
      } catch {
        /* ignore */
      }
      socketRef.current = null;
      sessionRef.current = null;
      currentQuestionRef.current = null;
      setQuestion(null);
      setIsVip(false);
      setIsPaused(false);
      setVideoPlayingGuess(false);
      setOpenDisputeState(null);
      setSelectedOptionId(null);
      selectedOptionIdRef.current = null;
      playerDismissedLeaderboardRef.current = false;
      if (!keepIdentity) {
        meRef.current = { sessionId: null, playerId: null, reconnectToken: null, displayName: null };
        setPlayerId(null);
        clearPlayerIdentity();
      }
      setSurface('join');
      setGameViewing(false);
      clearViewportRoundBg();
      syncBodyPlayerGameViewing(false);
      setWsStatus('disconnected');
      if (!silent) toast('Вы вышли из лобби');
      refreshReturnBlock();
      leavingNowRef.current = false;
    },
    [refreshReturnBlock, setBackToJoinButton, setOpenDisputeState],
  );
  leaveLobbyRef.current = leaveLobby;

  useEffect(() => {
    const onPageShow = (ev: PageTransitionEvent) => {
      if (!ev.persisted) return;
      leaveLobbyRef.current(true, true);
      refreshReturnBlock();
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, [refreshReturnBlock]);

  const connectWs = useCallback(() => {
    const m = meRef.current;
    if (!m.sessionId || !m.reconnectToken) return;
    if (socketRef.current?.connected) return;
    if (socketRef.current) {
      try {
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
      } catch {
        /* ignore */
      }
      socketRef.current = null;
    }
    wsReconnectAttemptsRef.current += 1;
    const socket = connectGameSocket({
      sessionId: m.sessionId,
      reconnectToken: m.reconnectToken,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      wsReconnectAttemptsRef.current = 0;
      setWsStatus('connected');
    });
    socket.on('disconnect', () => {
      setWsStatus('disconnected');
      if (leavingNowRef.current || sessionClosedByHostRef.current) return;
      void (async () => {
        const saved = readPlayerIdentity();
        const sid = saved.sessionId || meRef.current.sessionId;
        const stillActive = await verifySavedRoomIsStillSameSession(saved.roomCode, sid);
        if (!stillActive) {
          sessionClosedByHostRef.current = true;
          toast('Комната закрыта. Введите код и имя снова.');
          leaveLobbyRef.current(true, false);
          return;
        }
        try {
          showPlayerWaitingRoom();
        } catch {
          /* ignore */
        }
        setBackToJoinButton(true);
        toast('Соединение прервано — идёт попытка восстановить. Нажмите «Вернуться», если не восстановится.');
      })();
    });
    socket.on('connect_error', (err: Error) => {
      const msg = err && err.message ? String(err.message) : 'ws connect error';
      toast(msg);
      if (wsReconnectAttemptsRef.current < 4) {
        setTimeout(() => {
          if (!meRef.current.sessionId || !meRef.current.reconnectToken) return;
          connectWsRef.current();
        }, 500 * wsReconnectAttemptsRef.current);
        return;
      }
      if (/invalid|unauthorized|not found|ended|закрыта|closed/i.test(msg)) {
        leaveLobbyRef.current(true, false);
        return;
      }
      try {
        showPlayerWaitingRoom();
      } catch {
        /* ignore */
      }
      setBackToJoinButton(true);
    });
    socket.on(
      'session_ready',
      (payload: {
        session?: PlayerSession;
        role?: string;
        playerId?: string;
        player?: { score?: number; avatarUrl?: string | null; displayName?: string };
      }) => {
        const prevSess = sessionRef.current;
        sessionRef.current = payload.session || null;
        if (payload && payload.role === 'player' && payload.playerId) {
          meRef.current.playerId = payload.playerId;
          setMeId(payload.playerId);
          setPlayerId(payload.playerId);
        }
        if (payload?.player && typeof payload.player.score === 'number') {
          setPlayerScore(payload.player.score);
        }
        if (payload?.player?.displayName) {
          meRef.current.displayName = payload.player.displayName;
          setMeName(payload.player.displayName);
        }
        if (payload?.player && 'avatarUrl' in payload.player) {
          const url = payload.player.avatarUrl ?? null;
          setMeAvatarUrl(url);
          const emoji = emojiFromAvatarUrl(url);
          if (emoji) {
            setChosenAva(emoji);
            setCustomAvatarUrl(null);
          } else if (isImageAvatarUrl(url)) {
            setCustomAvatarUrl(url);
          } else {
            setCustomAvatarUrl(null);
          }
        }
        showGame();
        if (payload && payload.session) {
          applySessionRef.current(payload.session, prevSess);
        }
      },
    );
    socket.on('session_update', (s: PlayerSession) => {
      const prevSession = sessionRef.current;
      sessionRef.current = s;
      if (
        prevSession &&
        !s.endedAt &&
        prevSession.phase === s.phase &&
        String(prevSession.currentQuestionId || '') === String(s.currentQuestionId || '') &&
        !!prevSession.isPaused === !!s.isPaused &&
        (prevSession.vipPlayerId || null) === (s.vipPlayerId || null)
      ) {
        return;
      }
      applySessionRef.current(s, prevSession);
    });
    socket.on('answer_key', (payload: AnswerKeyPayload) => {
      applyAnswerKey(payload);
    });
    socket.on('dispute_update', (payload: { kind?: string; outcome?: string; reason?: string; dispute?: OpenDispute }) => {
      try {
        if (!payload) return;
        if (payload.kind === 'closed') {
          setOpenDisputeState(null);
          const oc = payload.outcome;
          if (oc === 'approved') {
            toast('Ответ засчитан по итогам голосования');
            applyApprovedDisputeToUi(payload.dispute, oc);
            return;
          }
          if (payload.reason === 'timeout') toast('Оспаривание снято по таймауту');
          else toast('Оспаривание отклонено');
        } else if (payload.dispute) {
          setOpenDisputeState(payload.dispute);
        }
        renderChallengeMount(
          currentQuestionRef.current,
          sessionRef.current && sessionRef.current.phase,
          currentQuestionRef.current && currentQuestionRef.current.playerAnswer,
        );
      } catch {
        /* ignore */
      }
    });
    socket.on('session_abandoned', (payload: { reason?: string }) => {
      sessionClosedByHostRef.current = true;
      const r = payload && payload.reason ? String(payload.reason) : '';
      toast(
        r === 'host_left'
          ? 'Ведущий покинул комнату — комната закрыта. Введите код и имя снова.'
          : 'Комната закрыта. Введите код и имя снова.',
      );
      leaveLobbyRef.current(false, false);
    });
  }, [
    applyApprovedDisputeToUi,
    renderChallengeMount,
    setBackToJoinButton,
    setOpenDisputeState,
    showGame,
    showPlayerWaitingRoom,
    applyAnswerKey,
  ]);
  connectWsRef.current = connectWs;

  // Timer: CSS/WAAPI drain for the ring; 10Hz only for the 0.1s label.
  useEffect(() => {
    const ring = new SmoothTimerRing();
    const tick = () => {
      const sess = sessionRef.current;
      const paused = !!sess?.isPaused;
      const ms = paused
        ? typeof sess?.pausedRemainingMs === 'number'
          ? sess.pausedRemainingMs
          : null
        : remainingMs(sess && sess.phaseDeadlineAt);
      const nextText = paused ? 'Пауза' : ms == null ? '—' : formatMs(ms);
      paintTimerLabel(timerTextElRef.current, nextText);
      const hiddenTimer = document.getElementById('timer');
      if (hiddenTimer && hiddenTimer !== timerTextElRef.current) {
        paintTimerLabel(hiddenTimer, nextText);
      }
      const progress = timerProgressElRef.current;
      const len = ensureTimerRingLength(progress, timerCircleLenRef);
      const total = phaseTotalMsRef.current;
      ring.sync({
        progress,
        len,
        remainingMs: ms,
        totalMs: total,
        paused,
        animKey: paused
          ? `pause:${ms ?? ''}|${total || 0}`
          : `run:${sess?.phaseDeadlineAt || ''}|${total || 0}`,
      });
    };
    tick();
    const id = window.setInterval(tick, 100);
    return () => {
      window.clearInterval(id);
      ring.cancel();
    };
  }, []);

  // Init: query code, return block, auto reconnect
  useEffect(() => {
    resetPlayerSurfaceToJoin();
    let saved = readPlayerIdentity();
    const qpNorm = qpCode ? normRoomCode(qpCode) : '';
    if (qpNorm) {
      setRoomCode(qpNorm);
      if (saved.sessionId && saved.reconnectToken && saved.roomCode && qpNorm !== saved.roomCode) {
        clearPlayerIdentity();
        saved = {};
      }
    }

    const allowAuto =
      !!(saved.sessionId && saved.reconnectToken) && (!qpNorm || (saved.roomCode && qpNorm === saved.roomCode));

    if (allowAuto && saved.sessionId && saved.reconnectToken) {
      const sid = saved.sessionId;
      const tok = saved.reconnectToken;
      const dname = saved.displayName || 'Player';
      const room = saved.roomCode;
      void verifySavedRoomIsStillSameSession(room, sid).then((ok) => {
        if (!ok) {
          clearPlayerIdentity();
          refreshReturnBlock();
          return;
        }
        meRef.current = {
          sessionId: sid,
          playerId: null,
          reconnectToken: tok,
          displayName: dname,
        };
        wsReconnectAttemptsRef.current = 0;
        connectWsRef.current();
      });
    }

    refreshReturnBlock();
    setWsStatus('disconnected');

    return () => {
      leavingNowRef.current = true;
      try {
        socketRef.current?.disconnect();
      } catch {
        /* ignore */
      }
      socketRef.current = null;
      syncBodyPlayerGameViewing(false);
      clearViewportRoundBg();
      try {
        document.body.classList.remove('player-round-intro');
      } catch {
        /* ignore */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only init matching player.js
  }, []);

  const onJoin = useCallback(async () => {
    try {
      const rc = normRoomCode(roomCode);
      const nm = name.trim();
      if (!rc) throw new Error('Введите roomCode');
      if (!nm) throw new Error('Введите имя');
      const displayName = nm;
      const res = await apiFetch<JoinResponse>('/api/session/join', {
        method: 'POST',
        headers: {},
        body: JSON.stringify({ roomCode: rc, displayName, avatarUrl: null }),
      });
      meRef.current = {
        sessionId: res.sessionId,
        playerId: res.playerId,
        reconnectToken: res.reconnectToken,
        displayName,
      };
      setPlayerId(res.playerId);
      setMeId(res.playerId);
      setMeName(displayName);
      setMeAvatarUrl(null);
      setChosenAva(null);
      setCustomAvatarUrl(null);
      savePlayerIdentity({
        sessionId: res.sessionId,
        reconnectToken: res.reconnectToken,
        displayName,
        roomCode: res.roomCode || rc,
      });
      wsReconnectAttemptsRef.current = 0;
      connectWs();
      toast('Подключено');
    } catch (e: unknown) {
      const err = e as { message?: string };
      toast((err && err.message) || 'Ошибка подключения');
    }
  }, [connectWs, name, roomCode]);

  const applyLocalAvatarUrl = useCallback((url: string | null) => {
    setMeAvatarUrl(url);
    const emoji = emojiFromAvatarUrl(url);
    if (emoji) {
      setChosenAva(emoji);
      setCustomAvatarUrl(null);
      return;
    }
    if (isImageAvatarUrl(url)) {
      setCustomAvatarUrl(url);
      return;
    }
    setCustomAvatarUrl(null);
  }, []);

  const pushAvatar = useCallback(async (avatarUrl: string) => {
    applyLocalAvatarUrl(avatarUrl);
    const socket = socketRef.current;
    if (!socket || !socket.connected) {
      toast('Нет соединения — аватар сохранится после переподключения');
      return;
    }
    const { err, res } = await emitAck<{ ok?: boolean; message?: string }>(
      socket,
      'player_set_avatar',
      { avatarUrl },
      8000,
    );
    if (err || !(res && res.ok)) {
      toast((res && res.message) || 'Не удалось сохранить аватар');
    }
  }, [applyLocalAvatarUrl]);

  const selectEmojiAvatar = useCallback(
    (emoji: string) => {
      setChosenAva(emoji);
      setCustomAvatarUrl(null);
      void pushAvatar(emojiAvatarUrl(emoji));
    },
    [pushAvatar],
  );

  const clearCustomAvatar = useCallback(() => {
    const emoji = chosenAva || AVATARS[0];
    setChosenAva(emoji);
    setCustomAvatarUrl(null);
    void pushAvatar(emojiAvatarUrl(emoji));
  }, [chosenAva, pushAvatar]);

  const onAvatarFile = useCallback(
    async (file: File | null | undefined) => {
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        toast('Нужен файл изображения');
        return;
      }
      if (file.size > 2 * 1024 * 1024) {
        toast('Максимум 2 МБ');
        return;
      }
      setAvatarUploading(true);
      try {
        const fd = new FormData();
        fd.append('file', file, file.name || 'avatar.jpg');
        const data = await apiFetch<{ url?: string }>('/api/session/upload-avatar', {
          method: 'POST',
          headers: {},
          body: fd,
        });
        const url = data?.url ? String(data.url) : '';
        if (!url) throw new Error('Сервер не вернул url');
        setCustomAvatarUrl(url);
        await pushAvatar(url);
        toast('Аватар загружен');
      } catch (e: unknown) {
        const err = e as { message?: string };
        toast((err && err.message) || 'Не удалось загрузить');
      } finally {
        setAvatarUploading(false);
      }
    },
    [pushAvatar],
  );

  const onSubmit = useCallback(async () => {
    try {
      if (!socketRef.current) throw new Error('WS не подключён');
      if (!sessionRef.current) throw new Error('Нет сессии');
      if (!currentQuestionRef.current) throw new Error('Нет вопроса');
      if (hasSubmittedRef.current) throw new Error('Ответ уже отправлен');

      const payload = buildAnswerPayload({
        question: currentQuestionRef.current,
        questionType: questionTypeRef.current,
        selectedOptionId: selectedOptionIdRef.current,
        selectedOptionIds: selectedOptionIdsRef.current,
        textAnswer: textAnswerRef.current,
        matchOrder: matchOrderRef.current,
      });

      if (sessionRef.current.phase === 'question') {
        await submitAnswerNow(payload);
        return;
      }
      if (sessionRef.current.phase === 'question_read') {
        pendingEarlySubmitRef.current = { questionId: payload.questionId, payload };
        setSubmitDisabled(true);
        toast('Ответ сохранён и будет отправлен в начале вопроса');
        return;
      }
      throw new Error('Сейчас нельзя отвечать');
    } catch (e: unknown) {
      const err = e as { message?: string };
      toast(err.message || 'Ошибка');
    }
  }, [submitAnswerNow]);

  const onReturn = useCallback(async () => {
    const saved = readPlayerIdentity();
    if (!saved.sessionId || !saved.reconnectToken) {
      toast('Нечего восстанавливать');
      return;
    }
    const ok = await verifySavedRoomIsStillSameSession(saved.roomCode, saved.sessionId);
    if (!ok) {
      clearPlayerIdentity();
      refreshReturnBlock();
      toast('Комната уже закрыта или пересоздана — введите код и имя снова.');
      return;
    }
    meRef.current = {
      sessionId: saved.sessionId,
      playerId: null,
      reconnectToken: saved.reconnectToken,
      displayName: saved.displayName || 'Player',
    };
    wsReconnectAttemptsRef.current = 0;
    connectWs();
  }, [connectWs, refreshReturnBlock]);

  const onSelectOption = useCallback(
    (optId: string) => {
      if (hasSubmittedRef.current) return;
      const t = questionTypeRef.current;
      if (isMultipleChoiceType(t)) {
        const id = String(optId || '');
        const prev = selectedOptionIdsRef.current;
        const exists = prev.some((x) => String(x) === id);
        const next = exists ? prev.filter((x) => String(x) !== id) : [...prev.filter(Boolean), id].filter(Boolean);
        selectedOptionIdsRef.current = next;
        selectedOptionIdRef.current = next[0] || null;
        paintPlayerOptionSelection(next);
        paintPlayerSubmitDisabled(next.length === 0);
        startTransition(() => {
          setSelectedOptionIds(next);
          setSelectedOptionId(next[0] || null);
          setSubmitDisabled(next.length === 0);
        });
      } else {
        selectedOptionIdRef.current = optId;
        selectedOptionIdsRef.current = [optId];
        paintPlayerOptionSelection([optId]);
        paintPlayerSubmitDisabled(false);
        startTransition(() => {
          setSelectedOptionId(optId);
          setSelectedOptionIds([optId]);
          setSubmitDisabled(false);
        });
      }
    },
    [],
  );

  const onTextChange = useCallback((v: string) => {
    textAnswerRef.current = v;
    setTextAnswer(v);
    if (hasSubmittedRef.current) return;
    const empty = !v.trim();
    paintPlayerSubmitDisabled(empty);
    setSubmitDisabled((prev) => (prev === empty ? prev : empty));
  }, []);

  const onPlaceStake = useCallback(async (stake: number) => {
    const socket = socketRef.current;
    const q = currentQuestionRef.current;
    const ph = sessionRef.current?.phase ?? null;
    const scope = q?.bettingScope ?? (q?.bettingEnabled ? 'round' : null);
    if (!socket || !q || !scope) {
      toast('Ставки сейчас недоступны');
      return;
    }
    if (!isBettingUiPhase(ph, scope)) {
      toast(scope === 'question' ? 'Ставка — только перед вопросом' : 'Ставки — только в начале раунда');
      return;
    }
    setStakeSubmitting(true);
    try {
      const payload =
        scope === 'question'
          ? { questionId: q.id, stake }
          : { roundId: q.roundId, stake };
      const { err } = await emitAck(socket, 'place_stake', payload, 8000);
      if (err) throw err;
      setStakeDraft(stake);
      setStakePlaced(true);
      toast(
        stake > 0
          ? `Ставка ${stake} принята`
          : 'Играете без ставки — вопрос по стандартной цене',
      );
    } catch (e: unknown) {
      const err = e as { message?: string };
      toast(err.message || 'Не удалось поставить ставку');
    } finally {
      setStakeSubmitting(false);
    }
  }, []);

  const onSelectStakePreset = useCallback((value: number) => {
    if (stakePlaced || stakeSubmitting) return;
    setStakeDraft(value);
    setStakeInput(value > 0 ? String(value) : '');
  }, [stakePlaced, stakeSubmitting]);

  const onStakeInputChange = useCallback((raw: string) => {
    if (stakePlaced || stakeSubmitting) return;
    const digits = String(raw ?? '').replace(/\D+/g, '').slice(0, 9);
    setStakeInput(digits);
    const n = parseInt(digits, 10);
    setStakeDraft(Number.isFinite(n) ? n : 0);
  }, [stakePlaced, stakeSubmitting]);

  /** Отказ от ставки: вопрос идёт по стандартной цене без риска потери очков. */
  const onSkipStake = useCallback(() => onPlaceStake(0), [onPlaceStake]);

  const stakeValid = stakeDraft > 0 && isStakeAllowed(stakeDraft, bettingBounds, bettingMode);

  const stakeError = useMemo(() => {
    if (!showBettingPanel || stakePlaced || bettingMode === 'presets') return null;
    if (!stakeInput || stakeDraft <= 0) return null;
    if (stakeDraft < bettingBounds.min) return `Минимальная ставка — ${bettingBounds.min}`;
    if (stakeDraft > bettingBounds.max) return `Максимальная ставка — ${bettingBounds.max}`;
    return null;
  }, [showBettingPanel, stakePlaced, bettingMode, stakeInput, stakeDraft, bettingBounds]);

  const onMatchChange = useCallback((idx: number, raw: string) => {
    if (hasSubmittedRef.current) return;
    const n = matchOrderRef.current.length;
    const next = matchOrderRef.current.slice();
    const num = parseInt(String(raw || '').trim(), 10);
    if (!Number.isFinite(num)) {
      next[idx] = NaN as unknown as number;
    } else {
      next[idx] = Math.max(1, Math.min(n, Math.floor(num)));
    }
    matchOrderRef.current = next;
    setMatchOrder(next.slice());
    setSubmitDisabled(!validateMatchOrder(next.map((x) => (Number.isFinite(x) ? x : NaN)), n));
  }, []);

  const voteDispute = useCallback(
    async (disputeId: string, approve: boolean) => {
      const socket = socketRef.current;
      if (!socket) return;
      const { err, res } = await emitAck<{ ok?: boolean; dispute?: OpenDispute; message?: string }>(
        socket,
        'dispute_vote',
        { disputeId, approve },
        10000,
      );
      if (err) {
        toast(String((err && err.message) || err || 'Голос не отправлен'));
        return;
      }
      if (res && res.ok && res.dispute) {
        setOpenDisputeState(res.dispute);
        if (res.dispute.status === 'approved') applyApprovedDisputeToUi(res.dispute, 'approved');
      } else if (res && res.message) toast(String(res.message));
    },
    [applyApprovedDisputeToUi, setOpenDisputeState],
  );

  const startDispute = useCallback(async () => {
    const socket = socketRef.current;
    const q = currentQuestionRef.current;
    if (!socket || !q?.id) return;
    const { err, res } = await emitAck<{ ok?: boolean; dispute?: OpenDispute; message?: string }>(
      socket,
      'dispute_start',
      { questionId: q.id },
      12000,
    );
    if (err) {
      toast(String((err && err.message) || err || 'Не удалось начать оспаривание'));
      return;
    }
    if (res && res.ok && res.dispute) {
      setOpenDisputeState(res.dispute);
      toast('Оспаривание начато');
    } else {
      toast(res && res.message ? String(res.message) : 'Нельзя оспорить');
    }
  }, [setOpenDisputeState]);

  const onTimerCircleReady = useCallback((len: number) => {
    timerCircleLenRef.current = len;
    setTimerCircleLenState(len);
  }, []);

  const emitVipCommand = useCallback(async (event: string, failToast: string) => {
    const socket = socketRef.current;
    if (!socket) {
      toast('WS не подключён');
      return false;
    }
    const { err, res } = await emitAck<{ ok?: boolean; message?: string }>(socket, event, {}, 8000);
    if (err) {
      toast(failToast);
      return false;
    }
    if (res && res.ok) return true;
    toast(res && res.message ? String(res.message) : failToast);
    return false;
  }, []);

  const onVipStartGame = useCallback(async () => {
    await emitVipCommand('vip_start_game', 'Не удалось начать игру');
  }, [emitVipCommand]);

  const onVipTogglePause = useCallback(async () => {
    await emitVipCommand('vip_toggle_pause', 'Не удалось переключить паузу');
  }, [emitVipCommand]);

  const onVipToggleVideo = useCallback(async () => {
    const ok = await emitVipCommand('vip_toggle_question_video', 'Не удалось переключить медиа');
    if (ok) setVideoPlayingGuess((g) => !g);
  }, [emitVipCommand]);

  const vipChrome = playerVipChrome({
    isVip,
    phase: phase || '',
    videoUrl: question?.videoUrl,
    audioUrl: question?.audioUrl,
    explanationVideoUrl: question?.explanationVideoUrl,
    isPaused,
    videoPlayingGuess,
  });

  return {
    AVATARS,
    surface,
    roomCode,
    setRoomCode,
    name,
    setName,
    chosenAva,
    selectEmojiAvatar,
    customAvatarUrl,
    avatarUploading,
    onAvatarFile,
    clearCustomAvatar,
    avatarEditable,
    showReturnBlock,
    showBackToJoin,
    showLeave,
    showSubmit,
    submitDisabled,
    wsStatus,
    meName,
    meId,
    meAvatarUrl,
    meAvatar: (() => {
      const e = emojiFromAvatarUrl(meAvatarUrl);
      if (e) return e;
      if (isImageAvatarUrl(meAvatarUrl)) return '';
      return (meName || '?').slice(0, 1).toUpperCase();
    })(),
    phaseInfo,
    timerCircleLen,
    timerTextElRef,
    timerProgressElRef,
    showTimerCircle,
    qTitle,
    qTitleMode,
    introMeta,
    gameCardIntro,
    gameCardSummary,
    gameViewing,
    question,
    questionType,
    phase,
    selectedOptionId,
    selectedOptionIds,
    hasSubmittedCurrent,
    textAnswer,
    textVisible,
    textDisabled,
    textFeedback,
    matchVisible,
    matchOrder,
    matchBlockClass,
    matchRowClasses,
    matchKeyHint,
    answersVisible,
    answersVisual,
    answersHtmlMode,
    correctTexts,
    showDisputeChallenge,
    openDispute,
    playerId,
    isPaused,
    vipChrome,
    onVipStartGame,
    onVipTogglePause,
    onVipToggleVideo,
    lbKind,
    lbRows,
    onJoin,
    onSubmit,
    onReturn,
    onLeave: () => leaveLobby(false, true),
    onBackToJoin: () => leaveLobby(false, false),
    onLbBackToWaiting: () => {
      playerDismissedLeaderboardRef.current = true;
      showPlayerWaitingRoom();
    },
    onSelectOption,
    onTextChange,
    onMatchChange,
    voteDispute,
    startDispute,
    onTimerCircleReady,
    showBettingPanel,
    stakeDraft,
    stakeInput,
    stakePlaced,
    stakeSubmitting,
    stakeValid,
    stakeError,
    playerScore,
    bettingMode,
    bettingPresets: bettingBounds.presets,
    bettingMinStake: bettingBounds.min,
    bettingMaxStake: bettingBounds.max,
    bettingCanBet: bettingBounds.canBet,
    bettingLimitLabel,
    onPlaceStake,
    onSelectStakePreset,
    onStakeInputChange,
    onSkipStake,
  };
}
