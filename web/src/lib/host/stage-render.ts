import { visibleCorrectTexts } from '../correct-texts';
import { formatOptionDisplayLabel } from '../format';
import {
  appendQuestionStageVideo,
  clearHostVideoRuntime,
  extractGoogleDriveFileId,
  googleDriveVideoToPreviewEmbedUrl,
  type HostVideoExtras,
} from '../stage/media';
import type { HostBgm } from '../stage/bgm';
import type { QuestionView } from './types';
import {
  stageKeyForAnswer,
  stageKeyForMatchL,
  stageKeyForMatchR,
} from './stage-layout';
import { appendStageImage, hideRectsFromQuestion, shouldShowImageHideRect } from './image-hide-rect';

export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Сохраняет переводы строк для отображения с white-space: pre-line. */
export function normalizeStageMultiline(text: string): string {
  return String(text || '').replace(/\r\n?/g, '\n');
}

function setStagePromptText(el: HTMLElement | null, text: string, fallback = 'Ожидание…') {
  if (!el) return;
  const normalized = normalizeStageMultiline(text).trim();
  el.textContent = normalized || fallback;
}

export type StageExplanationContent = { text: string; image: string; video: string } | null;

export function stageExplanationContent(
  q: QuestionView | null,
  showCorrect: boolean,
): StageExplanationContent {
  if (!showCorrect || !q) return null;
  const text = String(q.explanationText || '').trim();
  const image = String(q.explanationImageUrl || '').trim();
  const video = String(q.explanationVideoUrl || '').trim();
  if (!text && !image && !video) return null;
  return { text, image, video };
}

function closestStageCenter(...els: Array<HTMLElement | null>): HTMLElement | null {
  for (const el of els) {
    const center = el?.closest('.stage-center');
    if (center instanceof HTMLElement) return center;
  }
  return null;
}

function paintExplanationLabel(center: HTMLElement | null, show: boolean) {
  const label = center?.querySelector('#stageExplanationLabel');
  if (!(label instanceof HTMLElement)) return;
  if (!show) {
    label.textContent = '';
    label.style.display = 'none';
    label.removeAttribute('data-stage-key');
    return;
  }
  label.textContent = 'Пояснение';
  label.style.display = 'inline-block';
  label.setAttribute('data-stage-key', 'explanationLabel');
}

function setExplanationSwap(
  promptEl: HTMLElement | null,
  mediaEl: HTMLElement | null,
  replace: boolean,
  ...anchors: Array<HTMLElement | null>
) {
  // Keep the question prompt visible; only hide question media (listen media is off on reveal anyway).
  if (promptEl) {
    promptEl.style.removeProperty('display');
  }
  if (mediaEl) {
    if (replace) mediaEl.style.setProperty('display', 'none');
    else mediaEl.style.removeProperty('display');
  }
  const center = closestStageCenter(promptEl, mediaEl, ...anchors);
  if (center) {
    if (replace) center.setAttribute('data-stage-swap', 'explanation');
    else center.removeAttribute('data-stage-swap');
  }
  // Phase title lives in #stageMeta ("Правильный ответ" / "Итоги раунда…");
  // do not add a second "Пояснение" label above the stack.
  paintExplanationLabel(center, false);
}

export function paintStageExplanation(
  el: HTMLElement | null,
  q: QuestionView | null,
  showCorrect: boolean,
  imageEl: HTMLElement | null = null,
  promptEl: HTMLElement | null = null,
  mediaEl: HTMLElement | null = null,
  videoEl: HTMLElement | null = null,
) {
  const content = stageExplanationContent(q, showCorrect);
  paintExplanationText(el, content?.text || '');
  paintExplanationImage(imageEl, content?.image || '');
  paintExplanationVideo(videoEl, content?.video || '');
  setExplanationSwap(promptEl, mediaEl, !!content, el, imageEl, videoEl);
}

function hideExplanationSlot(el: HTMLElement | null) {
  if (!el) return;
  try {
    el.querySelectorAll('video, audio').forEach((node) => {
      const media = node as HTMLMediaElement;
      try {
        media.pause();
        media.removeAttribute('src');
        media.load();
      } catch {
        /* ignore */
      }
    });
  } catch {
    /* ignore */
  }
  el.innerHTML = '';
  el.style.display = 'none';
  el.removeAttribute('data-stage-key');
}

function paintExplanationText(el: HTMLElement | null, text: string) {
  if (!el) return;
  if (!text) {
    hideExplanationSlot(el);
    return;
  }
  el.textContent = normalizeStageMultiline(text);
  el.style.display = 'flex';
  el.setAttribute('data-stage-key', 'explanation');
}

function paintExplanationImage(el: HTMLElement | null, image: string) {
  if (!el) return;
  if (!image) {
    hideExplanationSlot(el);
    return;
  }
  el.classList.add('stage-answer', 'answer--visual');
  el.innerHTML = `<img class="host-stage__explanation-img" src="${escapeHtml(image)}" alt=""/>`;
  el.style.display = 'flex';
  el.setAttribute('data-stage-key', 'explanationImage');
}

function paintExplanationVideo(el: HTMLElement | null, videoUrl: string) {
  if (!el) return;
  const url = String(videoUrl || '').trim();
  if (!url) {
    hideExplanationSlot(el);
    return;
  }
  el.classList.add('host-stage__explanation--video', 'stage-media--host');
  el.innerHTML = '';
  el.style.display = 'flex';
  el.setAttribute('data-stage-key', 'explanationVideo');
  // Same as question listen media: manual start via controls / VIP toggle.
  appendQuestionStageVideo(el, url, { autoplay: false, controls: true });
}

export type StageDom = {
  stageQuestion: HTMLElement | null;
  stageMeta: HTMLElement | null;
  stageAnswers: HTMLElement | null;
  stageMedia: HTMLElement | null;
  stageExplanation: HTMLElement | null;
  stageExplanationImage: HTMLElement | null;
  stageExplanationVideo: HTMLElement | null;
  btnHostVideoSound: HTMLElement | null;
};

export function setStageMeta(el: HTMLElement | null, text: string | null) {
  if (!el) return;
  const t = (text || '').trim();
  el.textContent = t;
  el.style.display = t ? '' : 'none';
  if (t) el.setAttribute('data-stage-key', 'meta');
  else el.removeAttribute('data-stage-key');
}

function questionHasVisualOptions(q: QuestionView | null): boolean {
  return !!(q?.options || []).some((o) => (o.imageUrl || '').trim());
}

export type StageMediaController = {
  getAudioGateToken: () => number;
  bumpAudioGateToken: () => number;
  isVideoSoundUnlocked: () => boolean;
  setVideoSoundUnlocked: (v: boolean) => void;
  getVideoSoundQuestionId: () => string;
  setVideoSoundQuestionId: (id: string) => void;
  getLastQuestion: () => QuestionView | null;
  setLastQuestion: (q: QuestionView | null) => void;
  bgm: HostBgm;
  getSessionPhase: () => string | null | undefined;
  notifyListenMediaPlay: () => void;
  notifyListenMediaEnded: () => void;
};

export function clearStageMediaPreserveSoundBtn(dom: StageDom) {
  if (!dom.stageMedia) return;
  try {
    const keep = dom.btnHostVideoSound;
    const children = Array.from(dom.stageMedia.childNodes);
    for (const n of children) {
      if (keep && n === keep) continue;
      try {
        dom.stageMedia.removeChild(n);
      } catch {
        /* ignore */
      }
    }
  } catch {
    try {
      dom.stageMedia.innerHTML = '';
    } catch {
      /* ignore */
    }
    try {
      if (dom.btnHostVideoSound) dom.stageMedia.appendChild(dom.btnHostVideoSound);
    } catch {
      /* ignore */
    }
  }
}

function findStageVideo(dom: StageDom): HTMLVideoElement | null {
  return (
    (dom.stageMedia?.querySelector('video') as HTMLVideoElement | null) ||
    (dom.stageExplanationVideo?.querySelector('video') as HTMLVideoElement | null) ||
    null
  );
}

export function syncVideoSoundButton(dom: StageDom, q: QuestionView | null, unlocked: boolean) {
  if (!dom.btnHostVideoSound) return;
  try {
    const hasQuestionVideo = !!(q && String(q.videoUrl || '').trim());
    const hasExplVideo = !!(q && String(q.explanationVideoUrl || '').trim());
    const v = findStageVideo(dom);
    const show = (hasQuestionVideo || hasExplVideo) && v ? !!v.muted && !unlocked : false;
    const parent =
      (v && (v.closest('#stageExplanationVideo') as HTMLElement | null)) ||
      dom.stageMedia ||
      null;
    if (show && parent && dom.btnHostVideoSound.parentElement !== parent) {
      try {
        parent.appendChild(dom.btnHostVideoSound);
      } catch {
        /* ignore */
      }
    }
    dom.btnHostVideoSound.style.display = show ? '' : 'none';
  } catch {
    /* ignore */
  }
}

export function unlockCurrentStageVideoSound(dom: StageDom, ctrl: StageMediaController) {
  const v = findStageVideo(dom);
  if (!v) return;
  ctrl.setVideoSoundUnlocked(true);
  try {
    v.muted = false;
    v.defaultMuted = false;
    v.removeAttribute('muted');
    v.volume = 1;
  } catch {
    /* ignore */
  }
  try {
    const p = v.play();
    if (p && typeof p.then === 'function') p.catch(() => {});
  } catch {
    /* ignore */
  }
  syncVideoSoundButton(dom, ctrl.getLastQuestion(), true);
}

function restoreHostStageMetaAfterQuestionMedia(dom: StageDom, q: QuestionView | null) {
  if (!dom.stageMeta) return;
  const qt = q?.type ? String(q.type) : '';
  if (qt === 'matching') {
    setStageMeta(dom.stageMeta, 'Установите соответствие');
  } else if (qt === 'text_input' || questionHasVisualOptions(q)) {
    setStageMeta(dom.stageMeta, null);
  } else {
    setStageMeta(dom.stageMeta, 'Варианты ответа');
  }
}

export function pauseHostMediaQuestionMediaOnly(dom: StageDom, ctrl: StageMediaController) {
  ctrl.bumpAudioGateToken();
  try {
    if (!dom.stageMedia) return;
    const auStop = dom.stageMedia.querySelector('audio');
    if (auStop) {
      try {
        auStop.pause();
        auStop.currentTime = 0;
      } catch {
        /* ignore */
      }
    }
    const vidStop = dom.stageMedia.querySelector('video') as HostVideoExtras | null;
    if (vidStop) clearHostVideoRuntime(vidStop);
    const ifStop = dom.stageMedia.querySelector('iframe.stage-media__video-frame') as HTMLIFrameElement | null;
    if (ifStop) {
      try {
        ifStop.src = 'about:blank';
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
  try {
    if (ctrl.getSessionPhase() === 'question' && ctrl.getLastQuestion()) {
      restoreHostStageMetaAfterQuestionMedia(dom, ctrl.getLastQuestion());
    }
  } catch {
    /* ignore */
  }
}

function stopStageSlotMedia(slot: HTMLElement | null) {
  if (!slot) return;
  const auStop = slot.querySelector('audio');
  if (auStop) {
    try {
      auStop.pause();
      auStop.currentTime = 0;
    } catch {
      /* ignore */
    }
  }
  const vidStop = slot.querySelector('video') as HostVideoExtras | null;
  if (vidStop) clearHostVideoRuntime(vidStop);
  const ifStop = slot.querySelector('iframe.stage-media__video-frame') as HTMLIFrameElement | null;
  if (ifStop) {
    try {
      ifStop.src = 'about:blank';
    } catch {
      /* ignore */
    }
  }
}

export function stopHostMediaQuestionMedia(
  dom: StageDom,
  ctrl: StageMediaController,
  skipResumeBgm?: boolean,
) {
  ctrl.bumpAudioGateToken();
  try {
    stopStageSlotMedia(dom.stageMedia);
    stopStageSlotMedia(dom.stageExplanationVideo);
  } catch {
    /* ignore */
  }
  if (!skipResumeBgm) ctrl.bgm.resume();
}

export function maybeStartHostQuestionMediaGate(
  dom: StageDom,
  ctrl: StageMediaController,
  q: QuestionView,
) {
  if (!q || !dom.stageMedia) return;
  const videoUrl = (q.videoUrl || '').trim();
  const au = (q.audioUrl || '').trim();
  const videoEl = dom.stageMedia.querySelector('video') as HostVideoExtras | null;
  const iframeEl = dom.stageMedia.querySelector('iframe.stage-media__video-frame');

  if (videoUrl && videoEl) {
    const tokV = ctrl.bumpAudioGateToken();
    ctrl.bgm.pause();
    setStageMeta(dom.stageMeta, null);
    videoEl.controls = false;
    videoEl.loop = false;
    try {
      if (!ctrl.isVideoSoundUnlocked()) {
        videoEl.muted = true;
        videoEl.defaultMuted = true;
        videoEl.setAttribute('muted', '');
      }
      videoEl.volume = 1;
    } catch {
      /* ignore */
    }
    try {
      videoEl.playsInline = true;
      videoEl.setAttribute('playsinline', '');
      videoEl.setAttribute('webkit-playsinline', '');
    } catch {
      /* ignore */
    }
    try {
      videoEl._hostVideoKickIds = [];
    } catch {
      /* ignore */
    }

    const clearHostVideoKicks = () => clearHostVideoRuntime(videoEl);

    const finishHostVideo = () => {
      if (tokV !== ctrl.getAudioGateToken()) return;
      clearHostVideoKicks();
      ctrl.bgm.resume();
      restoreHostStageMetaAfterQuestionMedia(dom, q);
    };

    const tryPlayVideo = () => {
      if (tokV !== ctrl.getAudioGateToken()) return;
      try {
        if (!ctrl.isVideoSoundUnlocked()) {
          videoEl.muted = true;
          videoEl.defaultMuted = true;
          videoEl.setAttribute('muted', '');
        }
        videoEl.setAttribute('autoplay', '');
        videoEl.autoplay = true;
      } catch {
        /* ignore */
      }
      try {
        const pr = videoEl.play();
        if (pr && typeof pr.then === 'function') pr.catch(() => {});
      } catch {
        /* ignore */
      }
    };

    const onHostVideoPlaying = () => {
      try {
        if (videoEl._hostPlayPollId != null) {
          window.clearInterval(videoEl._hostPlayPollId);
          delete videoEl._hostPlayPollId;
        }
      } catch {
        /* ignore */
      }
    };

    try {
      videoEl._hostVideoOnPlaying = onHostVideoPlaying;
      videoEl.addEventListener('playing', onHostVideoPlaying);
    } catch {
      /* ignore */
    }

    try {
      if (videoEl._hostPlayPollId == null) {
        videoEl._hostPlayPollId = window.setInterval(() => {
          if (tokV !== ctrl.getAudioGateToken()) {
            try {
              window.clearInterval(videoEl._hostPlayPollId!);
            } catch {
              /* ignore */
            }
            try {
              delete videoEl._hostPlayPollId;
            } catch {
              /* ignore */
            }
            return;
          }
          if (!videoEl.paused) {
            onHostVideoPlaying();
            return;
          }
          tryPlayVideo();
        }, 200);
      }
    } catch {
      /* ignore */
    }

    try {
      videoEl._hostVideoVis = () => {
        if (tokV !== ctrl.getAudioGateToken()) {
          try {
            document.removeEventListener('visibilitychange', videoEl._hostVideoVis!);
          } catch {
            /* ignore */
          }
          try {
            delete videoEl._hostVideoVis;
          } catch {
            /* ignore */
          }
          return;
        }
        try {
          if (!document.hidden && videoEl.paused) tryPlayVideo();
        } catch {
          /* ignore */
        }
      };
      document.addEventListener('visibilitychange', videoEl._hostVideoVis, { passive: true });
    } catch {
      /* ignore */
    }

    const scheduleKick = (ms: number) => {
      const tid = window.setTimeout(() => tryPlayVideo(), ms);
      try {
        if (!videoEl._hostVideoKickIds) videoEl._hostVideoKickIds = [];
        videoEl._hostVideoKickIds.push(tid);
      } catch {
        /* ignore */
      }
    };

    videoEl.addEventListener(
      'ended',
      function hostVidEnd() {
        videoEl.removeEventListener('ended', hostVidEnd);
        finishHostVideo();
      },
      { once: true },
    );

    videoEl.addEventListener(
      'error',
      function hostVidErr() {
        videoEl.removeEventListener('error', hostVidErr);
        const ve = videoEl.error;
        if (ve && ve.code === 1) return;
        if (tokV === ctrl.getAudioGateToken() && videoEl.getAttribute('data-host-drive-uc') === '1') {
          try {
            clearHostVideoKicks();
          } catch {
            /* ignore */
          }
          ctrl.bumpAudioGateToken();
          try {
            const pNode = videoEl.parentNode;
            const vurlSw = (q.videoUrl || '').trim();
            const fileIdSw = extractGoogleDriveFileId(vurlSw);
            if (pNode && fileIdSw) {
              const ifrSw = document.createElement('iframe');
              ifrSw.className = 'stage-media__video-frame';
              ifrSw.src = googleDriveVideoToPreviewEmbedUrl(vurlSw);
              ifrSw.setAttribute('title', 'Видео');
              ifrSw.setAttribute(
                'allow',
                'autoplay; fullscreen; encrypted-media; picture-in-picture',
              );
              ifrSw.setAttribute('allowfullscreen', 'true');
              pNode.replaceChild(ifrSw, videoEl);
              maybeStartHostQuestionMediaGate(dom, ctrl, q);
              return;
            }
          } catch {
            /* ignore */
          }
        }
        finishHostVideo();
      },
      { once: true },
    );

    const onMediaReadyKick = () => tryPlayVideo();
    videoEl.addEventListener('loadedmetadata', onMediaReadyKick, { once: true });
    videoEl.addEventListener('loadeddata', onMediaReadyKick, { once: true });
    videoEl.addEventListener('canplay', onMediaReadyKick, { once: true });
    tryPlayVideo();
    requestAnimationFrame(() => requestAnimationFrame(tryPlayVideo));
    scheduleKick(0);
    scheduleKick(48);
    scheduleKick(160);
    scheduleKick(480);
    scheduleKick(1600);
    scheduleKick(4200);
    const fallbackUiTid = window.setTimeout(() => {
      if (tokV !== ctrl.getAudioGateToken()) return;
      try {
        if (videoEl.paused) videoEl.controls = true;
      } catch {
        /* ignore */
      }
      tryPlayVideo();
    }, 9000);
    try {
      if (!videoEl._hostVideoKickIds) videoEl._hostVideoKickIds = [];
      videoEl._hostVideoKickIds.push(fallbackUiTid);
    } catch {
      /* ignore */
    }
    return;
  }

  if (videoUrl && iframeEl) {
    ctrl.bumpAudioGateToken();
    ctrl.bgm.pause();
    setStageMeta(dom.stageMeta, null);
    return;
  }

  if (!au) return;
  const audioEl = dom.stageMedia.querySelector('audio');
  if (!audioEl) return;
  const tok = ctrl.bumpAudioGateToken();
  ctrl.bgm.pause();
  setStageMeta(dom.stageMeta, null);
  audioEl.controls = false;
  audioEl.loop = false;
  const finishHostAudio = () => {
    if (tok !== ctrl.getAudioGateToken()) return;
    ctrl.bgm.resume();
    restoreHostStageMetaAfterQuestionMedia(dom, q);
  };
  audioEl.addEventListener(
    'ended',
    function hostAudEnd() {
      audioEl.removeEventListener('ended', hostAudEnd);
      finishHostAudio();
    },
    { once: true },
  );
  audioEl.addEventListener(
    'error',
    function hostAudErr() {
      audioEl.removeEventListener('error', hostAudErr);
      finishHostAudio();
    },
    { once: true },
  );
  const pp = audioEl.play();
  if (pp && typeof pp.catch === 'function') {
    pp.catch(() => finishHostAudio());
  }
}

function activeStageListenMedia(dom: StageDom): HTMLMediaElement | null {
  const explSlot = dom.stageExplanationVideo;
  const explVideo = explSlot?.querySelector('video') as HTMLMediaElement | null;
  if (explVideo && explSlot && explSlot.style.display !== 'none') return explVideo;
  return (
    (dom.stageMedia?.querySelector('video') as HTMLMediaElement | null) ||
    (dom.stageMedia?.querySelector('audio') as HTMLMediaElement | null) ||
    explVideo ||
    null
  );
}

export function applyStageVideoToggle(dom: StageDom) {
  const media = activeStageListenMedia(dom);
  if (!media) return;
  try {
    if (media.paused) {
      try {
        media.muted = false;
        media.defaultMuted = false;
        media.removeAttribute('muted');
        media.volume = 1;
      } catch {
        /* ignore */
      }
      const p = media.play();
      if (p && typeof p.then === 'function') p.catch(() => {});
    } else {
      media.pause();
    }
  } catch {
    /* ignore */
  }
}

export function hostListenMediaPlaying(dom: StageDom): boolean {
  const media = activeStageListenMedia(dom);
  try {
    return !!media && !media.paused;
  } catch {
    return false;
  }
}

/** Unlock listen media after a host gesture so a later VIP play() can succeed. */
export function primeHostListenMedia(dom: StageDom) {
  const els = [
    ...Array.from(dom.stageMedia?.querySelectorAll('video') || []),
    ...Array.from(dom.stageMedia?.querySelectorAll('audio') || []),
    ...Array.from(dom.stageExplanationVideo?.querySelectorAll('video') || []),
  ] as HTMLMediaElement[];
  for (const el of els) {
    try {
      if (!el.paused) continue;
      if (el.getAttribute('data-host-primed') === '1') continue;
      if (el.getAttribute('data-host-priming') === '1') continue;
      const t = el.currentTime;
      el.setAttribute('data-host-priming', '1');
      el.muted = true;
      const p = el.play();
      const finish = () => {
        try {
          el.pause();
          el.currentTime = t;
          el.muted = false;
          el.defaultMuted = false;
          el.removeAttribute('muted');
        } catch {
          /* ignore */
        }
        el.removeAttribute('data-host-priming');
        el.setAttribute('data-host-primed', '1');
      };
      if (p && typeof p.then === 'function') {
        p.then(finish).catch(() => {
          el.removeAttribute('data-host-priming');
        });
      } else {
        finish();
      }
    } catch {
      el.removeAttribute('data-host-priming');
    }
  }
}

function armListenMedia(dom: StageDom, ctrl: StageMediaController) {
  const els = [
    ...Array.from(dom.stageMedia?.querySelectorAll('video') || []),
    ...Array.from(dom.stageMedia?.querySelectorAll('audio') || []),
    ...Array.from(dom.stageExplanationVideo?.querySelectorAll('video') || []),
  ] as HTMLMediaElement[];
  if (!els.length) return;

  let stopNotified = false;
  const notifyStop = () => {
    if (stopNotified) return;
    stopNotified = true;
    try {
      ctrl.bgm.resume();
    } catch {
      /* ignore */
    }
    try {
      ctrl.notifyListenMediaEnded();
    } catch {
      /* ignore */
    }
  };
  const notifyPlay = () => {
    stopNotified = false;
    try {
      ctrl.bgm.pause();
    } catch {
      /* ignore */
    }
    try {
      ctrl.notifyListenMediaPlay();
    } catch {
      /* ignore */
    }
  };

  for (const el of els) {
    if (el.getAttribute('data-listen-armed') === '1') continue;
    el.setAttribute('data-listen-armed', '1');
    el.controls = true;
    el.loop = false;
    el.autoplay = false;
    el.removeAttribute('autoplay');
    el.addEventListener(
      'play',
      () => {
        if (el.getAttribute('data-host-priming') === '1') return;
        notifyPlay();
      },
      { passive: true },
    );
    el.addEventListener(
      'pause',
      () => {
        if (el.getAttribute('data-host-priming') === '1') return;
        try {
          if (el.ended) return;
        } catch {
          /* ignore */
        }
        notifyStop();
      },
      { passive: true },
    );
    el.addEventListener(
      'ended',
      () => {
        if (el.getAttribute('data-host-priming') === '1') return;
        notifyStop();
      },
      { once: true },
    );
  }
}

export function renderStageQuestion(
  dom: StageDom,
  ctrl: StageMediaController,
  q: QuestionView | null,
  showCorrect: boolean,
  hostStagePhase?: string,
  _mediaMode: 'live' | 'solo' = 'solo',
) {
  ctrl.setLastQuestion(q);
  if (!dom.stageQuestion || !dom.stageAnswers || !dom.stageMeta) return;
  dom.stageQuestion.setAttribute('data-stage-key', 'prompt');
  if (dom.stageMedia) dom.stageMedia.setAttribute('data-stage-key', 'media');
  dom.stageMeta.setAttribute('data-stage-key', 'meta');
  setStagePromptText(dom.stageQuestion, q?.prompt || '', 'Ожидание…');
  const isRead = hostStagePhase === 'question_read';
  const stageCenter = closestStageCenter(
    dom.stageQuestion,
    dom.stageMedia,
    dom.stageExplanation,
    dom.stageExplanationImage,
    dom.stageExplanationVideo,
  );
  if (stageCenter) {
    if (showCorrect) stageCenter.setAttribute('data-stage-reveal', '1');
    else stageCenter.removeAttribute('data-stage-reveal');
  }

  if (!q) {
    stopHostMediaQuestionMedia(dom, ctrl, false);
    setStageMeta(dom.stageMeta, '—');
    dom.stageAnswers.innerHTML = '';
    try {
      delete dom.stageAnswers.dataset.count;
    } catch {
      /* ignore */
    }
    clearStageMediaPreserveSoundBtn(dom);
    syncVideoSoundButton(dom, null, ctrl.isVideoSoundUnlocked());
    paintStageExplanation(
      dom.stageExplanation,
      null,
      false,
      dom.stageExplanationImage,
      dom.stageQuestion,
      dom.stageMedia,
      dom.stageExplanationVideo,
    );
    if (stageCenter) stageCenter.removeAttribute('data-stage-reveal');
    return;
  }

  try {
    const qidS = String(q.id || '');
    if (qidS && qidS !== ctrl.getVideoSoundQuestionId()) {
      ctrl.setVideoSoundQuestionId(qidS);
      ctrl.setVideoSoundUnlocked(false);
    }
  } catch {
    /* ignore */
  }

  try {
    const expl = stageExplanationContent(q, showCorrect);
    paintStageExplanation(
      dom.stageExplanation,
      q,
      showCorrect,
      dom.stageExplanationImage,
      dom.stageQuestion,
      dom.stageMedia,
      dom.stageExplanationVideo,
    );
    if (!isRead) {
      stopHostMediaQuestionMedia(dom, ctrl, false);
    }

    if (isRead && !showCorrect) {
      try {
        ctrl.bgm.resume();
      } catch {
        /* ignore */
      }
      setStagePromptText(dom.stageQuestion, q.prompt || '', 'Вопрос');
      try {
        dom.stageQuestion.classList.remove('stage-title');
        dom.stageQuestion.classList.add('stage-q');
      } catch {
        /* ignore */
      }
      try {
        setStageMeta(dom.stageMeta, null);
      } catch {
        /* ignore */
      }
      dom.stageAnswers.innerHTML = '';
      try {
        delete dom.stageAnswers.dataset.count;
      } catch {
        /* ignore */
      }
      try {
        dom.stageAnswers.className = '';
      } catch {
        /* ignore */
      }
      if (dom.stageMedia) {
        clearStageMediaPreserveSoundBtn(dom);
        const imgRead = (q.imageUrl || '').trim();
        if (imgRead) {
          appendStageImage(
            dom.stageMedia,
            imgRead,
            hideRectsFromQuestion(q),
            shouldShowImageHideRect(hostStagePhase, showCorrect),
          );
        }
        syncVideoSoundButton(dom, q, ctrl.isVideoSoundUnlocked());
      }
      return;
    }

    ctrl.bgm.resume();
    if (!showCorrect) setStageMeta(dom.stageMeta, 'Варианты ответа');
    const qtype = q.type ? String(q.type) : '';
    const opts = q.options || [];
    const correct: Record<string, boolean> = Object.create(null);
    if (showCorrect && q.correctOptionIds?.length) {
      for (const id of q.correctOptionIds) correct[id] = true;
    }

    if (dom.stageMedia) {
      clearStageMediaPreserveSoundBtn(dom);
      if (!expl) {
        const imgUrl = (q.imageUrl || '').trim();
        const showListenMedia = !showCorrect;
        const videoUrl = showListenMedia ? (q.videoUrl || '').trim() : '';
        const audioUrl = showListenMedia ? (q.audioUrl || '').trim() : '';
        if (imgUrl) {
          appendStageImage(
            dom.stageMedia,
            imgUrl,
            hideRectsFromQuestion(q),
            shouldShowImageHideRect(hostStagePhase, showCorrect),
          );
        }
        if (videoUrl) {
          appendQuestionStageVideo(dom.stageMedia, videoUrl, {
            autoplay: false,
            controls: true,
          });
        }
        if (audioUrl) {
          const a = document.createElement('audio');
          a.controls = true;
          a.autoplay = false;
          a.src = audioUrl;
          dom.stageMedia.appendChild(a);
        }
        syncVideoSoundButton(dom, q, ctrl.isVideoSoundUnlocked());
      } else {
        syncVideoSoundButton(dom, q, ctrl.isVideoSoundUnlocked());
      }
    }

    if (qtype === 'matching') {
      renderMatching(dom, q, showCorrect);
      return;
    }

    if (qtype === 'text_input') {
      if (!showCorrect) setStageMeta(dom.stageMeta, null);
      try {
        delete dom.stageAnswers.dataset.count;
      } catch {
        /* ignore */
      }
      try {
        dom.stageAnswers.className = 'host-stage__answers host-stage__answers--text';
      } catch {
        /* ignore */
      }
      const list = showCorrect ? visibleCorrectTexts(q.correctTexts) : [];
      if (showCorrect && list.length) {
        let html =
          '<div class="stage-q stage-correct-texts-title" data-stage-key="correct:title" style="text-align:center;">' +
          'Правильный ответ:' +
          '</div>';
        html +=
          '<div class="stage-q stage-correct-texts-item" data-stage-key="correct:0" style="text-align:center;">' +
          escapeHtml(list[0]) +
          '</div>';
        dom.stageAnswers.innerHTML = html;
      } else {
        dom.stageAnswers.innerHTML =
          '<div class="muted stage-text-answer-hint" data-stage-key="textHint" style="text-align:center;">Пишите свой вариант ответа</div>';
      }
      return;
    }

    let visual = false;
    for (const o of opts) {
      if ((o.imageUrl || '').trim()) {
        visual = true;
        break;
      }
    }
    dom.stageAnswers.className =
      'grid-answers host-stage__answers' + (visual ? ' grid-answers--visual' : '');
    try {
      if (visual) dom.stageAnswers.dataset.count = String(opts.length || 0);
      else if (opts.length) dom.stageAnswers.dataset.count = String(opts.length);
      else delete dom.stageAnswers.dataset.count;
    } catch {
      /* ignore */
    }
    if (visual && !showCorrect) setStageMeta(dom.stageMeta, null);
    dom.stageAnswers.innerHTML = '';
    for (let k = 0; k < opts.length; k++) {
      const opt = opts[k];
      const div = document.createElement('div');
      div.className =
        'answer stage-answer' +
        (visual ? ' answer--visual' : '') +
        (correct[opt.id] ? ' correct' : '');
      div.setAttribute('data-stage-key', stageKeyForAnswer(opt.id));
      const oImg = (opt.imageUrl || '').trim();
      if (oImg) {
        const img = document.createElement('img');
        img.src = oImg;
        img.alt = '';
        div.appendChild(img);
        const cap = formatOptionDisplayLabel(opt.label || '', k);
        if (cap) {
          const capEl = document.createElement('div');
          capEl.className = 'answer-caption stage-caption';
          capEl.textContent = cap;
          div.appendChild(capEl);
        }
      } else {
        div.textContent = formatOptionDisplayLabel(opt.label || '', k) || '—';
      }
      dom.stageAnswers.appendChild(div);
    }
  } finally {
    try {
      // Question listen media + explanation video: same manual play wiring.
      if ((!showCorrect && hostStagePhase === 'question') || showCorrect) {
        armListenMedia(dom, ctrl);
      }
    } catch {
      /* ignore */
    }
  }
}

function renderMatching(dom: StageDom, q: QuestionView, showCorrect: boolean) {
  if (!dom.stageAnswers || !dom.stageMeta) return;
  if (!showCorrect) setStageMeta(dom.stageMeta, 'Установите соответствие');
  const mch = q.match;
  if (!mch?.left?.length || !mch.right) {
    dom.stageAnswers.className = 'host-stage__answers host-stage__match';
    try {
      delete dom.stageAnswers.dataset.count;
    } catch {
      /* ignore */
    }
    dom.stageAnswers.innerHTML = '';
    return;
  }
  const leftM = mch.left;
  const rightM = mch.right;
  const nM = leftM.length;
  dom.stageAnswers.className = 'host-stage__answers host-stage__match';
  try {
    dom.stageAnswers.dataset.count = String(nM);
  } catch {
    /* ignore */
  }
  dom.stageAnswers.innerHTML = '';
  const lettersM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const corrM = showCorrect && mch.correct && mch.correct.length === nM ? mch.correct : null;

  const escHM = (s: string) =>
    String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  const topRow = document.createElement('div');
  topRow.className = 'host-match__row host-match__row--top';
  for (let ai = 0; ai < nM; ai++) {
    const Lm = leftM[ai];
    const tile = document.createElement('div');
    tile.className = 'host-match__tile stage-answer';
    tile.setAttribute('data-stage-key', stageKeyForMatchL(Lm.id));
    const lab = lettersM[ai] || String(ai + 1);
    let inner = `<div class="host-match__badge">${escHM(lab)}</div>`;
    if ((Lm.imageUrl || '').trim()) {
      inner += `<img class="host-match__img" src="${escHM(Lm.imageUrl || '')}" alt=""/>`;
    }
    const capL = Lm.label && String(Lm.label).trim() ? String(Lm.label).trim() : '';
    if (capL) {
      inner += `<div class="host-match__cap stage-caption">${escHM(capL)}</div>`;
    }
    tile.innerHTML = inner;
    if (corrM) {
      try {
        tile.title = `→ ${String(corrM[ai])}`;
      } catch {
        /* ignore */
      }
    }
    topRow.appendChild(tile);
  }

  const botRow = document.createElement('div');
  botRow.className = 'host-match__row host-match__row--bottom';
  for (let bi = 0; bi < rightM.length; bi++) {
    const Rm = rightM[bi];
    const tileB = document.createElement('div');
    tileB.className = 'host-match__tile stage-answer';
    tileB.setAttribute('data-stage-key', stageKeyForMatchR(Rm.id));
    let innerB = `<div class="host-match__badge host-match__badge--num">${String(bi + 1)}</div>`;
    if ((Rm.imageUrl || '').trim()) {
      innerB += `<img class="host-match__img" src="${escHM(Rm.imageUrl || '')}" alt=""/>`;
    }
    const capR = Rm.label && String(Rm.label).trim() ? String(Rm.label).trim() : '';
    if (capR) {
      innerB += `<div class="host-match__cap stage-caption">${escHM(capR)}</div>`;
    }
    tileB.innerHTML = innerB;
    botRow.appendChild(tileB);
  }

  dom.stageAnswers.appendChild(topRow);
  dom.stageAnswers.appendChild(botRow);
  if (showCorrect && corrM) {
    const keyLine = document.createElement('div');
    keyLine.className = 'stage-q';
    keyLine.style.marginTop = '12px';
    keyLine.style.textAlign = 'center';
    const parts: string[] = [];
    for (let ki = 0; ki < nM; ki++) {
      parts.push(`${lettersM[ki] || String(ki + 1)}→${corrM[ki]}`);
    }
    keyLine.textContent = `Ключ: ${parts.join(', ')}`;
    dom.stageAnswers.appendChild(keyLine);
  }
}

export function renderLeaderboardDom(
  els: {
    lbTitle: HTMLElement | null;
    lbSub: HTMLElement | null;
    lbTop3: HTMLElement | null;
    lbList: HTMLElement | null;
  },
  payload: { kind?: string; rows?: Array<{ displayName?: string; score?: number; roundPoints?: number }> },
) {
  if (!payload || !els.lbList || !els.lbTop3) return;
  const kind = payload.kind || 'round';
  if (els.lbTitle) els.lbTitle.textContent = kind === 'final' ? 'Финальные итоги' : 'Итоги раунда';
  if (els.lbSub) {
    els.lbSub.textContent =
      kind === 'final' ? 'Список игроков и общий счёт' : 'Очки за раунд и общий счёт';
  }
  els.lbTop3.innerHTML = '';
  const rows = payload.rows || [];
  els.lbList.innerHTML = '';
  for (let j = 0; j < rows.length; j++) {
    const r = rows[j];
    const showRound = kind !== 'final';
    const rp = showRound ? `<span class="pill">+${r.roundPoints || 0}</span>` : '';
    els.lbList.innerHTML +=
      `<div class="row lb-row stage-lb-row">` +
      `<div class="lb-name" style="font-weight:900;">${j + 1}. ${escapeHtml(r.displayName || '—')}</div>` +
      `<div class="row" style="gap:8px; align-items:center;">` +
      rp +
      `<span class="pill good">${escapeHtml(String(r.score || 0))}</span>` +
      `</div></div>`;
  }
}
