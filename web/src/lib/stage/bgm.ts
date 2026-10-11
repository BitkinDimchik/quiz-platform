/** Host BGM with fade in/out (parity with host.js). */

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

export class HostBgm {
  private bgmEl: HTMLAudioElement | null = null;
  private bgmUrl = '';
  private bgmRequestedUrl = '';
  private bgmTargetVol = 0.65;
  private bgmFadeToken = 0;
  private bgmSwitchBusy = false;
  private visibilityHandler: (() => void) | null = null;

  constructor() {
    this.visibilityHandler = () => this.forceBgmSyncNow();
    try {
      document.addEventListener('visibilitychange', this.visibilityHandler);
    } catch {
      /* ignore */
    }
  }

  dispose() {
    if (this.visibilityHandler) {
      try {
        document.removeEventListener('visibilitychange', this.visibilityHandler);
      } catch {
        /* ignore */
      }
      this.visibilityHandler = null;
    }
    this.stop();
    if (this.bgmEl) {
      try {
        this.bgmEl.remove();
      } catch {
        /* ignore */
      }
      this.bgmEl = null;
    }
  }

  private ensureEl(): HTMLAudioElement | null {
    if (this.bgmEl) return this.bgmEl;
    try {
      const el = document.createElement('audio');
      el.id = 'hostBgm';
      el.loop = true;
      el.preload = 'auto';
      el.style.display = 'none';
      el.volume = this.bgmTargetVol;
      document.body.appendChild(el);
      this.bgmEl = el;
    } catch {
      this.bgmEl = null;
    }
    return this.bgmEl;
  }

  private fadeVolume(el: HTMLAudioElement, toVol: number, ms: number, done?: () => void) {
    try {
      if (document.hidden) {
        try {
          el.volume = clamp01(toVol);
        } catch {
          /* ignore */
        }
        done?.();
        return;
      }
    } catch {
      /* ignore */
    }
    const token = ++this.bgmFadeToken;
    const from = clamp01(el.volume);
    const to = clamp01(toVol);
    const dur = Number(ms || 0);
    if (!Number.isFinite(dur) || dur <= 0) {
      try {
        el.volume = to;
      } catch {
        /* ignore */
      }
      done?.();
      return;
    }
    const start = Date.now();
    const step = () => {
      if (token !== this.bgmFadeToken) return;
      const t = (Date.now() - start) / dur;
      if (t >= 1) {
        try {
          el.volume = to;
        } catch {
          /* ignore */
        }
        done?.();
        return;
      }
      const v = from + (to - from) * t;
      try {
        el.volume = clamp01(v);
      } catch {
        /* ignore */
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  forceBgmSyncNow() {
    const el = this.ensureEl();
    if (!el) return;
    this.bgmFadeToken++;
    this.bgmSwitchBusy = false;
    const next = (this.bgmRequestedUrl || '').trim();
    if (!next) {
      try {
        el.pause();
      } catch {
        /* ignore */
      }
      try {
        el.removeAttribute('src');
        el.load();
      } catch {
        /* ignore */
      }
      this.bgmUrl = '';
      try {
        el.volume = this.bgmTargetVol;
      } catch {
        /* ignore */
      }
      return;
    }
    if (this.bgmUrl !== next) {
      this.bgmUrl = next;
      try {
        el.pause();
      } catch {
        /* ignore */
      }
      try {
        el.setAttribute('src', next);
        el.loop = true;
        el.currentTime = 0;
        try {
          el.volume = this.bgmTargetVol;
        } catch {
          /* ignore */
        }
        const p = el.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch {
        /* ignore */
      }
    } else {
      try {
        el.volume = this.bgmTargetVol;
      } catch {
        /* ignore */
      }
      try {
        if (el.paused) {
          const p2 = el.play();
          if (p2 && typeof p2.catch === 'function') p2.catch(() => {});
        }
      } catch {
        /* ignore */
      }
    }
  }

  private applyRequestedBgm() {
    const el = this.ensureEl();
    if (!el) return;
    if (this.bgmSwitchBusy) return;

    if (this.bgmRequestedUrl && this.bgmUrl === this.bgmRequestedUrl) {
      try {
        if (el.paused) {
          const pSame = el.play();
          if (pSame && typeof pSame.catch === 'function') pSame.catch(() => {});
        }
      } catch {
        /* ignore */
      }
      this.fadeVolume(el, this.bgmTargetVol, 420);
      return;
    }

    this.bgmSwitchBusy = true;
    const hasCurrent = !!this.bgmUrl;
    this.fadeVolume(el, 0, hasCurrent ? 700 : 0, () => {
      const next = (this.bgmRequestedUrl || '').trim();
      if (!next) {
        try {
          el.pause();
        } catch {
          /* ignore */
        }
        try {
          el.removeAttribute('src');
          el.load();
        } catch {
          /* ignore */
        }
        this.bgmUrl = '';
        try {
          el.volume = this.bgmTargetVol;
        } catch {
          /* ignore */
        }
        this.bgmSwitchBusy = false;
        return;
      }

      this.bgmUrl = next;
      try {
        el.pause();
      } catch {
        /* ignore */
      }
      try {
        el.setAttribute('src', next);
        el.loop = true;
        el.currentTime = 0;
        try {
          el.volume = 0;
        } catch {
          /* ignore */
        }
        const p = el.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch {
        /* ignore */
      }

      this.fadeVolume(el, this.bgmTargetVol, 900, () => {
        this.bgmSwitchBusy = false;
        if ((this.bgmRequestedUrl || '').trim() !== (this.bgmUrl || '').trim()) {
          this.applyRequestedBgm();
        }
      });
    });
  }

  stop() {
    this.bgmRequestedUrl = '';
    this.applyRequestedBgm();
  }

  play(url: string) {
    const u = (url || '').trim();
    const el = this.ensureEl();
    if (!el) return;
    this.bgmRequestedUrl = u;
    this.applyRequestedBgm();
  }

  pause() {
    const el = this.ensureEl();
    if (!el) return;
    try {
      el.pause();
    } catch {
      /* ignore */
    }
  }

  resume() {
    const el = this.ensureEl();
    if (!el) return;
    try {
      try {
        el.volume = this.bgmTargetVol;
      } catch {
        /* ignore */
      }
      if (el.paused) {
        const p = el.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }
    } catch {
      /* ignore */
    }
  }
}
