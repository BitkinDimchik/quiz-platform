export type VipChrome = {
  showStart: boolean;
  showPause: boolean;
  pauseLabel: 'Пауза' | 'Продолжить';
  showVideo: boolean;
  videoLabel: 'Старт видео' | 'Стоп видео' | 'Старт аудио' | 'Стоп аудио';
};

const PAUSE_PHASES = new Set([
  'quiz_intro',
  'round_intro',
  'question_read',
  'question',
  'answer_reveal',
  'round_replay',
  'round_summary',
  'leaderboard',
]);

const REVEAL_VIDEO_PHASES = new Set(['answer_reveal', 'round_replay', 'round_summary']);

export function playerVipChrome(opts: {
  isVip: boolean;
  phase: string;
  videoUrl?: string | null;
  audioUrl?: string | null;
  explanationVideoUrl?: string | null;
  isPaused?: boolean;
  videoPlayingGuess?: boolean;
}): VipChrome {
  const isVip = !!opts.isVip;
  const phase = String(opts.phase || '');
  const video = String(opts.videoUrl || '').trim();
  const audio = String(opts.audioUrl || '').trim();
  const explVideo = String(opts.explanationVideoUrl || '').trim();
  const paused = !!opts.isPaused;
  const showPause = isVip && PAUSE_PHASES.has(phase);
  const showListen = phase === 'question' && !!(video || audio);
  const showExpl = REVEAL_VIDEO_PHASES.has(phase) && !!explVideo;
  const showVideo = isVip && (showListen || showExpl);
  const playing = !!opts.videoPlayingGuess;
  let videoLabel: VipChrome['videoLabel'] = 'Старт видео';
  if (showExpl || video) videoLabel = playing ? 'Стоп видео' : 'Старт видео';
  else if (audio) videoLabel = playing ? 'Стоп аудио' : 'Старт аудио';
  return {
    showStart: isVip && phase === 'lobby',
    showPause,
    pauseLabel: paused ? 'Продолжить' : 'Пауза',
    showVideo,
    videoLabel,
  };
}
