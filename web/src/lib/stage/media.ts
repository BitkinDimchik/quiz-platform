/** Google Drive / stage video helpers (parity with host.js). */

export function isGoogleDriveVideoPageUrl(url: string | null | undefined): boolean {
  const s = String(url || '').trim();
  if (!s) return false;
  if (/^https?:\/\/(drive|docs)\.google\.com\/file\/d\/[a-zA-Z0-9_-]+/i.test(s)) return true;
  if (/^https?:\/\/drive\.google\.com\/open\?/i.test(s) && /[?&]id=[a-zA-Z0-9_-]+/.test(s)) return true;
  return false;
}

export function extractGoogleDriveFileId(url: string | null | undefined): string {
  const s = String(url || '').trim();
  if (!s) return '';
  const mFile = s.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (mFile) return mFile[1];
  const mOpen = s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (mOpen) return mOpen[1];
  return '';
}

export function googleDriveVideoToPreviewEmbedUrl(url: string | null | undefined): string {
  const id = extractGoogleDriveFileId(url);
  if (!id) return String(url || '').trim();
  return `https://drive.google.com/file/d/${id}/preview`;
}

export function googleDriveUcDownloadUrl(fileId: string): string {
  return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`;
}

/** Рамка по реальному кадру: оболочка с aspect-ratio. */
export function bindStageVideoShellLayout(videoEl: HTMLVideoElement) {
  const shell = videoEl.parentElement;
  if (!shell || !shell.classList.contains('stage-media__video-shell')) return;
  const applyAspect = () => {
    try {
      const w = videoEl.videoWidth;
      const h = videoEl.videoHeight;
      if (w > 0 && h > 0) shell.style.aspectRatio = `${w} / ${h}`;
    } catch {
      /* ignore */
    }
  };
  try {
    if (videoEl.readyState >= 1) applyAspect();
  } catch {
    /* ignore */
  }
  videoEl.addEventListener('loadedmetadata', applyAspect, { once: true });
}

export type StageVideoFlags = {
  autoplay?: boolean;
  controls?: boolean;
};

function prepareQuestionVideo(v: HTMLVideoElement, flags?: StageVideoFlags) {
  const autoplay = flags?.autoplay !== false;
  const controls = flags?.controls === true;
  v.controls = controls;
  try {
    v.playsInline = true;
    v.setAttribute('playsinline', '');
    v.setAttribute('webkit-playsinline', '');
    v.preload = 'auto';
    if (autoplay) {
      v.muted = true;
      v.defaultMuted = true;
      v.setAttribute('muted', '');
      v.setAttribute('autoplay', '');
      v.autoplay = true;
    } else {
      v.muted = false;
      v.defaultMuted = false;
      v.removeAttribute('muted');
      v.removeAttribute('autoplay');
      v.autoplay = false;
    }
  } catch {
    /* ignore */
  }
}

/** Append question video (native or Drive uc stream) into stage media container. */
export function appendQuestionStageVideo(
  container: HTMLElement,
  videoUrl: string,
  flags?: StageVideoFlags,
) {
  const url = String(videoUrl || '').trim();
  if (!url) return;
  const shell = document.createElement('div');
  shell.className = 'stage-media__video-shell';

  if (isGoogleDriveVideoPageUrl(url)) {
    const gid = extractGoogleDriveFileId(url);
    if (!gid) return;
    const vDrive = document.createElement('video');
    vDrive.setAttribute('data-host-drive-uc', '1');
    prepareQuestionVideo(vDrive, flags);
    vDrive.src = googleDriveUcDownloadUrl(gid);
    shell.appendChild(vDrive);
    container.appendChild(shell);
    bindStageVideoShellLayout(vDrive);
    try {
      vDrive.load();
    } catch {
      /* ignore */
    }
    return;
  }

  const v = document.createElement('video');
  prepareQuestionVideo(v, flags);
  v.src = url;
  shell.appendChild(v);
  container.appendChild(shell);
  bindStageVideoShellLayout(v);
}

export type HostVideoExtras = HTMLVideoElement & {
  _hostVideoOnPlaying?: EventListener;
  _hostVideoVis?: EventListener;
  _hostPlayPollId?: number | null;
  _hostRetryIv?: number | null;
  _hostVideoKickIds?: number[] | null;
};

export function clearHostVideoRuntime(vidStop: HostVideoExtras) {
  if (vidStop._hostVideoOnPlaying) {
    try {
      vidStop.removeEventListener('playing', vidStop._hostVideoOnPlaying);
    } catch {
      /* ignore */
    }
    try {
      delete vidStop._hostVideoOnPlaying;
    } catch {
      /* ignore */
    }
  }
  if (vidStop._hostVideoVis) {
    try {
      document.removeEventListener('visibilitychange', vidStop._hostVideoVis);
    } catch {
      /* ignore */
    }
    try {
      delete vidStop._hostVideoVis;
    } catch {
      /* ignore */
    }
  }
  if (vidStop._hostPlayPollId != null) {
    try {
      window.clearInterval(vidStop._hostPlayPollId);
    } catch {
      /* ignore */
    }
    try {
      delete vidStop._hostPlayPollId;
    } catch {
      /* ignore */
    }
  }
  if (vidStop._hostRetryIv != null) {
    try {
      window.clearInterval(vidStop._hostRetryIv);
    } catch {
      /* ignore */
    }
    try {
      delete vidStop._hostRetryIv;
    } catch {
      /* ignore */
    }
  }
  if (vidStop._hostVideoKickIds && vidStop._hostVideoKickIds.length) {
    for (const id of vidStop._hostVideoKickIds) {
      try {
        window.clearTimeout(id);
      } catch {
        /* ignore */
      }
    }
    try {
      delete vidStop._hostVideoKickIds;
    } catch {
      /* ignore */
    }
  }
  try {
    vidStop.pause();
    vidStop.currentTime = 0;
  } catch {
    /* ignore */
  }
}
