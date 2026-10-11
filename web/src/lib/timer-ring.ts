export function timerRingDashoffset(
  len: number,
  remainingMs: number | null,
  totalMs: number | null,
): number {
  if (remainingMs == null || totalMs == null || totalMs <= 0 || !len) return len || 0;
  const p = Math.max(0, Math.min(1, remainingMs / totalMs));
  return len * (1 - p);
}

export function ensureTimerRingLength(
  progress: SVGCircleElement | null,
  lenRef: { current: number | null },
): number {
  if (!progress) return lenRef.current || 0;
  if (lenRef.current == null || lenRef.current <= 0) {
    try {
      const len = progress.getTotalLength();
      if (len > 0) {
        lenRef.current = len;
        progress.style.strokeDasharray = String(len);
      }
    } catch {
      lenRef.current = 0;
    }
  }
  return lenRef.current || 0;
}

export function resetTimerRingLength(lenRef: { current: number | null }): void {
  lenRef.current = null;
}

export function paintTimerLabel(el: HTMLElement | null, text: string): void {
  if (el && el.textContent !== text) el.textContent = text;
}

/**
 * One CSS linear drain per phase. Avoids per-frame SVG writes (those re-rasterize
 * filters and make both the ring and taps stutter).
 */
export class SmoothTimerRing {
  private key = '';
  private progress: SVGCircleElement | null = null;

  sync(opts: {
    progress: SVGCircleElement | null;
    len: number;
    remainingMs: number | null;
    totalMs: number | null;
    paused: boolean;
    hide?: boolean;
    animKey: string;
  }): void {
    const { progress, len, remainingMs: ms, totalMs, paused, hide, animKey } = opts;
    if (!progress) return;
    this.progress = progress;
    if (hide || ms == null || !totalMs || !len) {
      if (this.key === `empty:${animKey}`) return;
      this.clearTransition(progress);
      progress.style.strokeDashoffset = String(len || 0);
      this.key = `empty:${animKey}`;
      return;
    }
    const from = timerRingDashoffset(len, ms, totalMs);
    if (paused) {
      if (this.key === `pause:${animKey}`) return;
      this.clearTransition(progress);
      progress.style.strokeDashoffset = String(from);
      this.key = `pause:${animKey}`;
      return;
    }
    if (this.key === `run:${animKey}`) return;
    this.clearTransition(progress);
    progress.style.strokeDashoffset = String(from);
    void progress.getBoundingClientRect();
    if (ms > 16) {
      progress.style.transition = `stroke-dashoffset ${ms}ms linear`;
    }
    progress.style.strokeDashoffset = String(len);
    this.key = `run:${animKey}`;
  }

  cancel(): void {
    if (this.progress) this.clearTransition(this.progress);
    this.key = '';
    this.progress = null;
  }

  private clearTransition(progress: SVGCircleElement): void {
    progress.style.transition = 'none';
  }
}
