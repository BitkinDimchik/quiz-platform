import { describe, expect, it } from 'vitest';
import { playerVipChrome } from './vip-chrome';

const PAUSE_PHASES = [
  'quiz_intro',
  'round_intro',
  'question_read',
  'question',
  'answer_reveal',
  'round_replay',
  'round_summary',
  'leaderboard',
] as const;

describe('playerVipChrome', () => {
  it('non-VIP: no buttons', () => {
    expect(
      playerVipChrome({
        isVip: false,
        phase: 'lobby',
        videoUrl: 'https://x/v.mp4',
        isPaused: true,
      }),
    ).toEqual({
      showStart: false,
      showPause: false,
      pauseLabel: 'Продолжить',
      showVideo: false,
      videoLabel: 'Старт видео',
    });
  });

  it('lobby + VIP: start only', () => {
    const chrome = playerVipChrome({ isVip: true, phase: 'lobby' });
    expect(chrome.showStart).toBe(true);
    expect(chrome.showPause).toBe(false);
    expect(chrome.showVideo).toBe(false);
  });

  it('question + video + VIP: pause and video', () => {
    const chrome = playerVipChrome({
      isVip: true,
      phase: 'question',
      videoUrl: 'https://x/v.mp4',
    });
    expect(chrome.showStart).toBe(false);
    expect(chrome.showPause).toBe(true);
    expect(chrome.pauseLabel).toBe('Пауза');
    expect(chrome.showVideo).toBe(true);
    expect(chrome.videoLabel).toBe('Старт видео');
  });

  it('question + audio + VIP: audio start label', () => {
    const chrome = playerVipChrome({
      isVip: true,
      phase: 'question',
      audioUrl: 'https://x/a.mp3',
    });
    expect(chrome.showVideo).toBe(true);
    expect(chrome.videoLabel).toBe('Старт аудио');
  });

  it('paused + VIP: resume label', () => {
    const chrome = playerVipChrome({
      isVip: true,
      phase: 'question',
      isPaused: true,
    });
    expect(chrome.showPause).toBe(true);
    expect(chrome.pauseLabel).toBe('Продолжить');
  });

  it('video playing guess: stop label', () => {
    const chrome = playerVipChrome({
      isVip: true,
      phase: 'question',
      videoUrl: ' https://x/v.mp4 ',
      videoPlayingGuess: true,
    });
    expect(chrome.showVideo).toBe(true);
    expect(chrome.videoLabel).toBe('Стоп видео');
  });

  it('listen media button only in question phase', () => {
    expect(
      playerVipChrome({
        isVip: true,
        phase: 'question_read',
        videoUrl: 'https://x/v.mp4',
        audioUrl: 'https://x/a.mp3',
      }).showVideo,
    ).toBe(false);
  });

  it('reveal + explanation video + VIP: video button', () => {
    for (const phase of ['answer_reveal', 'round_replay', 'round_summary'] as const) {
      const chrome = playerVipChrome({
        isVip: true,
        phase,
        explanationVideoUrl: 'https://x/expl.mp4',
        videoUrl: 'https://x/q.mp4',
      });
      expect(chrome.showVideo).toBe(true);
      expect(chrome.videoLabel).toBe('Старт видео');
    }
  });

  it('reveal without explanation video: no video button', () => {
    expect(
      playerVipChrome({
        isVip: true,
        phase: 'answer_reveal',
        videoUrl: 'https://x/q.mp4',
      }).showVideo,
    ).toBe(false);
  });

  it('pause allow-list covers timed phases, not lobby/finished', () => {
    for (const phase of PAUSE_PHASES) {
      expect(playerVipChrome({ isVip: true, phase }).showPause).toBe(true);
    }
    expect(playerVipChrome({ isVip: true, phase: 'lobby' }).showPause).toBe(false);
    expect(playerVipChrome({ isVip: true, phase: 'finished' }).showPause).toBe(false);
  });
});
